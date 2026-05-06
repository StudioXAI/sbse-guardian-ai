/* ─────────────────────────────────────────────────────────────
   New Project Scanner V2 — filtered logs approach

   The legacy scanner pulled every transaction in every block via
   eth_getBlockByNumber with fullTransactions=true. That's ~9MB of
   payload per scan across 6 chains and is the heaviest scanner in
   the system.

   This scanner instead uses eth_getLogs with a topic filter for
   ERC-20 mint events: Transfer(0x0, <recipient>, <amount>). When
   a fresh ERC-20 contract is deployed and mints initial supply,
   it emits this exact event. We catch the token "coming alive"
   regardless of how the contract was deployed (CREATE, CREATE2,
   factory clone, proxy).

   COST PROFILE:
   - Per scan: 6 chains × 1 eth_getLogs call = 6 RPC calls
   - Each returns ~50-200 events
   - Plus 1 eth_blockNumber per chain (already shared via tipBlocks)
   - Plus metadata resolution (cached, mostly cheap)
   - Total: ~90% reduction vs legacy block-pulling approach

   COVERAGE:
   - Catches: ERC-20s that mint at deploy time (most production tokens)
   - Misses: tokens with deferred minting, tokens minting in pieces
   - Misses: non-ERC-20 deployments (we don't want these anyway)

   FREQUENCY:
   - Cache TTL = 4 hours, so the scanner runs at most 6x per day
   - In serverless this means the first request after 4h triggers
     a fresh scan; subsequent requests within 4h get cached results
   - Idle instances may scan less often if no traffic arrives
   ───────────────────────────────────────────────────────────── */

import {
  rpcCall,
  toHexBlock,
  CHAIN_CONFIG,
  type SupportedChain,
} from "./quicknodeClient";
import { resolveTokenMetadata } from "./tokenMetadata";
import { TtlCache } from "./cache";

/* Re-export types from the legacy module so callers don't need
   to update their imports. The shape is identical between the
   two scanner implementations. */
export type {
  NewProject,
  ProjectSocials,
  NewProjectsScanResult,
  ScanInputs,
} from "./newProjectScanner_legacy";

import type {
  NewProject,
  NewProjectsScanResult,
  ScanInputs,
} from "./newProjectScanner_legacy";

/* ═══════════════════════════════════════════════════════════ */
/* Topic constants                                              */
/* ═══════════════════════════════════════════════════════════ */

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** 32-byte zero address used as the topic filter for "from = 0x0".
    Topic args are left-padded to 32 bytes. */
const ZERO_TOPIC =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/* ═══════════════════════════════════════════════════════════ */
/* Scan parameters                                              */
/* ═══════════════════════════════════════════════════════════ */

/* Block window — the looser scanner can use a wider window
   because eth_getLogs filters server-side. Tradeoff: wider window
   catches more potential new tokens but takes longer per call.
   200 blocks = ~40 minutes on Ethereum, ~10 mins on Polygon,
   ~7 minutes on Arbitrum. Reasonable balance. */
const BLOCK_SPAN = 200;

/* Hard caps to keep the response bounded. */
const MAX_EVENTS_PER_CHAIN = 500;
const MAX_TOKENS_PER_CHAIN = 100;

/* Buffer config — same as legacy. */
const BUFFER_MAX_ENTRIES = 500;
const BUFFER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/* Top-level cache TTL — drives scan frequency.
   4 hours = 6x per day. */
const SCAN_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

/* Buffer is module-level so it persists across scans within an
   instance. Internal-deployment endpoint also writes here. */
export const projectBuffer = new Map<string, NewProject>();

/* ═══════════════════════════════════════════════════════════ */
/* Raw log shape                                                */
/* ═══════════════════════════════════════════════════════════ */

interface RawLog {
  address: string;           // contract that emitted the event
  topics: string[];           // [TRANSFER_TOPIC, fromTopic, toTopic]
  data: string;               // amount (uint256, hex)
  blockNumber: string;        // hex
  transactionHash: string;
  logIndex: string;
}

/* ═══════════════════════════════════════════════════════════ */
/* Per-chain scan                                               */
/* ═══════════════════════════════════════════════════════════ */

interface ChainScanResult {
  projects: NewProject[];
  /** Total mint events seen (before dedupe). */
  eventsSeen: number;
  /** Unique contracts after dedupe. */
  uniqueContracts: number;
  /** ERC-20s after metadata filter. */
  tokens: number;
}

async function scanChain(
  chain: SupportedChain,
  tipBlock: number,
): Promise<ChainScanResult> {
  const cfg = CHAIN_CONFIG[chain];
  const fromBlock = Math.max(0, tipBlock - BLOCK_SPAN);

  /* Fire one filtered eth_getLogs call. We filter on:
     - topics[0] = Transfer event signature
     - topics[1] = zero address (fresh mint, not a real transfer)
     The provider does the filtering server-side, so we only
     receive events that match both criteria. */
  const result = await rpcCall<RawLog[]>(chain, "eth_getLogs", [
    {
      fromBlock: toHexBlock(fromBlock),
      toBlock: toHexBlock(tipBlock),
      topics: [TRANSFER_TOPIC, ZERO_TOPIC],
    },
  ]);

  if (!Array.isArray(result) || result.length === 0) {
    return { projects: [], eventsSeen: 0, uniqueContracts: 0, tokens: 0 };
  }

  /* Cap the events we process — protects against memory blowup
     if a market-stress event produces thousands of mints in our
     window. Take the most recent ones. */
  const capped = result.slice(-MAX_EVENTS_PER_CHAIN);

  /* Dedupe by contract address. A single token that mints in
     multiple transactions within our window only counts once.
     We keep the EARLIEST event per contract so the discoveredAt
     timestamp reflects when the token actually came alive. */
  const byContract = new Map<string, RawLog>();
  for (const log of capped) {
    const addr = log.address.toLowerCase();
    const existing = byContract.get(addr);
    if (!existing) {
      byContract.set(addr, log);
      continue;
    }
    /* Keep the earliest log (lower block number, lower log index) */
    const existingBlock = parseInt(existing.blockNumber, 16);
    const newBlock = parseInt(log.blockNumber, 16);
    if (newBlock < existingBlock) byContract.set(addr, log);
  }

  /* Resolve metadata for all unique contracts. The metadata
     resolver returns absent entries for non-ERC-20s (which we
     filter out). It also has its own cache, so warm contracts
     resolve cheaply. */
  const addresses = Array.from(byContract.keys());
  const metaMap = await resolveTokenMetadata(chain, addresses);

  /* Build NewProject records for entries that resolved as ERC-20s. */
  const projects: NewProject[] = [];
  for (const [addr, log] of byContract.entries()) {
    const meta = metaMap.get(addr);
    if (!meta) continue;
    if (!meta.symbol || meta.symbol.length === 0 || meta.symbol.length > 12) {
      continue;
    }

    /* The mint event tells us the contract emitted Transfer-from-zero.
       The deployer wallet is the recipient of that mint (topics[2]).
       This isn't always the EOA that deployed the contract — for
       proxy deploys, the recipient is whoever the constructor minted
       to. But it's the most useful "owner-at-launch" field we can
       extract without a second RPC call. */
    const recipientTopic = log.topics[2];
    const recipient =
      recipientTopic && recipientTopic.length === 66
        ? "0x" + recipientTopic.slice(26).toLowerCase()
        : "0x0000000000000000000000000000000000000000";

    const blockNum = parseInt(log.blockNumber, 16);

    projects.push({
      id: `${log.transactionHash}-${addr}`,
      contractAddress: addr,
      chain: cfg.name,
      chainId: cfg.chainId,
      blockNumber: blockNum,
      discoveredAt: Date.now(),
      deployer: recipient,
      symbol: meta.symbol,
      name: meta.name,
      decimals: meta.decimals,
      contractUrl: `${cfg.explorerBase}/address/${addr}`,
      deployerUrl: `${cfg.explorerBase}/address/${recipient}`,
      txUrl: `${cfg.explorerBase}/tx/${log.transactionHash}`,
      txHash: log.transactionHash,
    });

    if (projects.length >= MAX_TOKENS_PER_CHAIN) break;
  }

  return {
    projects,
    eventsSeen: result.length,
    uniqueContracts: byContract.size,
    tokens: projects.length,
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Buffer helpers — exported for the internal-deployment route */
/* ═══════════════════════════════════════════════════════════ */

export function mergeIntoBuffer(projects: NewProject[]): void {
  const now = Date.now();

  for (const p of projects) {
    if (!projectBuffer.has(p.id)) {
      projectBuffer.set(p.id, p);
    }
  }

  for (const [id, p] of projectBuffer.entries()) {
    if (now - p.discoveredAt > BUFFER_MAX_AGE_MS) {
      projectBuffer.delete(id);
    }
  }

  if (projectBuffer.size > BUFFER_MAX_ENTRIES) {
    const sorted = [...projectBuffer.entries()].sort(
      (a, b) => a[1].discoveredAt - b[1].discoveredAt,
    );
    const toRemove = projectBuffer.size - BUFFER_MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      projectBuffer.delete(sorted[i][0]);
    }
  }
}

export function readProjectBuffer(limit: number = 100): NewProject[] {
  const all = [...projectBuffer.values()];
  all.sort((a, b) => b.discoveredAt - a.discoveredAt);
  return all.slice(0, limit);
}

/* ═══════════════════════════════════════════════════════════ */
/* Top-level scan with cache                                    */
/* ═══════════════════════════════════════════════════════════ */

const scanCache = new TtlCache<NewProjectsScanResult>(SCAN_CACHE_TTL_MS);

export async function scanNewProjects(
  inputs: ScanInputs,
): Promise<NewProjectsScanResult> {
  const cached = scanCache.get("scan");
  if (cached) return cached;

  const perChainResults = await Promise.all(
    inputs.chains.map(async (chain) => {
      const tip = inputs.tipBlocks.get(chain);
      if (tip === undefined) {
        return {
          chain: CHAIN_CONFIG[chain].name,
          eventsSeen: 0,
          uniqueContracts: 0,
          tokens: 0,
          projects: [] as NewProject[],
        };
      }
      try {
        const result = await scanChain(chain, tip);
        return {
          chain: CHAIN_CONFIG[chain].name,
          ...result,
        };
      } catch (err) {
        /* Single-chain failure shouldn't abort the whole scan.
           Log silently — diagnostics will surface failures via
           empty per-chain counts. */
        console.error(`[newProjectScanner] ${chain} failed:`, err);
        return {
          chain: CHAIN_CONFIG[chain].name,
          eventsSeen: 0,
          uniqueContracts: 0,
          tokens: 0,
          projects: [] as NewProject[],
        };
      }
    }),
  );

  /* Merge all chains' findings into the rolling buffer. The
     buffer also receives internal deployments via the dedicated
     endpoint, so the read below sees both sources unified. */
  const allNew: NewProject[] = [];
  for (const r of perChainResults) allNew.push(...r.projects);
  mergeIntoBuffer(allNew);

  const result: NewProjectsScanResult = {
    projects: readProjectBuffer(100),
    totalCreations: perChainResults.reduce((s, r) => s + r.eventsSeen, 0),
    totalTokens: perChainResults.reduce((s, r) => s + r.tokens, 0),
    perChain: perChainResults.map((r) => ({
      chain: r.chain,
      creations: r.eventsSeen,
      tokens: r.tokens,
      blocksScanned: BLOCK_SPAN,
    })),
  };

  /* Always cache, even when projects is empty — protects against
     hammering the RPC if a chain is genuinely quiet. */
  scanCache.set("scan", result);
  return result;
}
