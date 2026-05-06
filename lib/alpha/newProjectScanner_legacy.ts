/* ─────────────────────────────────────────────────────────────
   New Project Scanner — newly-deployed ERC-20 contracts

   Detects contract creations across enabled chains and surfaces
   token contracts (filtering out LP pairs, pure proxies, and
   non-token deployments). Used by the New Projects tab.

   DETECTION METHOD:
   - Pull each block in the scan window with full transactions
   - Filter for transactions where `to` is null (contract creation)
   - From the receipt, extract the `contractAddress` of each new contract
   - For each, call symbol()/decimals()/name() — non-tokens fail these
     calls and get filtered out
   - Filter LP pair contracts by checking if the deployer is a known
     factory address

   COST:
   - eth_getBlockByNumber with full transactions is heavier than
     eth_getLogs but unavoidable here — contract creations don't
     emit a log signature we can filter on
   - We scan only every 3rd cycle (270s instead of 90s) to reduce
     load, since new tokens don't appear at sub-minute frequencies
   - Per scan: ~30 blocks × N chains × ~50KB block payload =
     bounded memory footprint
   ───────────────────────────────────────────────────────────── */

import {
  rpcCall,
  toHexBlock,
  CHAIN_CONFIG,
  type SupportedChain,
} from "./quicknodeClient";
import { resolveTokenMetadata, type TokenMetadata } from "./tokenMetadata";
import { TtlCache } from "./cache";

/* ═══════════════════════════════════════════════════════════ */
/* Public types                                                 */
/* ═══════════════════════════════════════════════════════════ */

export interface NewProject {
  /** Stable id for React keys + dedupe. */
  id: string;
  /** Token contract address. */
  contractAddress: string;
  /** Chain the token was deployed on. */
  chain: string;
  chainId: number;
  /** Block where the creation transaction landed. */
  blockNumber: number;
  /** When discovered (epoch ms). Approximate — not the actual
      block timestamp, but close enough for "X minutes ago". */
  discoveredAt: number;
  /** Wallet that deployed the contract. */
  deployer: string;
  /** Token metadata. */
  symbol: string;
  name: string;
  decimals: number;
  /** Block explorer URLs. */
  contractUrl: string;
  deployerUrl: string;
  txUrl: string;
  /** Tx hash that created the contract. */
  txHash: string;
  /** Set later by socials enrichment if found. */
  socials?: ProjectSocials;
  /** True if the project was launched via INFI MultiChain Launchpad.
      Set by the verified-launch checker, not the discovery scanner. */
  infiVerified?: boolean;
}

export interface ProjectSocials {
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  /** Source of the data — for transparency. */
  source: "coingecko" | "dexscreener" | "etherscan" | "self-reported";
}

export interface NewProjectsScanResult {
  projects: NewProject[];
  /** Total contract creations seen (before filtering). */
  totalCreations: number;
  /** Total ERC-20s identified after filtering. */
  totalTokens: number;
  /** Per-chain breakdown for diagnostics. */
  perChain: Array<{
    chain: string;
    creations: number;
    tokens: number;
    blocksScanned: number;
  }>;
}

/* ═══════════════════════════════════════════════════════════ */
/* Scan parameters                                              */
/* ═══════════════════════════════════════════════════════════ */

/* Block window — same as other scanners for consistency. */
const BLOCK_SPAN = 30;

/* Hard cap to prevent memory blowup if a chain has unusually
   high creation activity. */
const MAX_CREATIONS_PER_CHAIN = 200;
const MAX_TOKENS_PER_CHAIN = 100;

/* In-memory rolling buffer — projects persist across scans for
   24h or until the serverless instance restarts (same constraints
   as the threats buffer). The UI labels this honestly. */
const BUFFER_MAX_ENTRIES = 500;
const BUFFER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const projectBuffer = new Map<string, NewProject>();

/* ═══════════════════════════════════════════════════════════ */
/* Known factory / non-project deployer addresses              */
/*                                                              */
/* These addresses deploy contracts in bulk (Uniswap pair       */
/* factories, Sushiswap, etc.) — their deployments are LP pair  */
/* contracts, not standalone projects. Filter out at the source.*/
/* ═══════════════════════════════════════════════════════════ */

const NOISE_DEPLOYERS = new Set<string>([
  /* Uniswap V2 factory */
  "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f",
  /* Uniswap V3 factory */
  "0x1f98431c8ad98523631ae4a59f267346ea31f984",
  /* Sushiswap factory */
  "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac",
  /* PancakeSwap V2 factory (BSC) */
  "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
  /* QuickSwap factory (Polygon) */
  "0x5757371414417b8c6caad45baef941abc7d3ab32",
]);

/* ═══════════════════════════════════════════════════════════ */
/* Block fetching                                               */
/* ═══════════════════════════════════════════════════════════ */

interface BlockTransaction {
  hash: string;
  from: string;
  to: string | null; // null = contract creation
  blockNumber: string;
}

interface FullBlock {
  number: string;
  timestamp: string;
  transactions: BlockTransaction[];
}

interface TransactionReceipt {
  contractAddress: string | null;
  status: string; // "0x1" = success, "0x0" = revert
  from: string;
  blockNumber: string;
  transactionHash: string;
}

async function fetchBlockWithTxs(
  chain: SupportedChain,
  blockNumber: number,
): Promise<FullBlock | null> {
  /* Second param `true` = include full transactions. This is the
     heavy version of eth_getBlockByNumber — payload is much larger
     than the default but we need the tx list to find creations. */
  return rpcCall<FullBlock>(chain, "eth_getBlockByNumber", [
    toHexBlock(blockNumber),
    true,
  ]);
}

async function fetchReceipt(
  chain: SupportedChain,
  txHash: string,
): Promise<TransactionReceipt | null> {
  return rpcCall<TransactionReceipt>(chain, "eth_getTransactionReceipt", [
    txHash,
  ]);
}

/* ═══════════════════════════════════════════════════════════ */
/* Per-chain scan                                               */
/* ═══════════════════════════════════════════════════════════ */

interface ChainScanResult {
  projects: NewProject[];
  creations: number;
  tokens: number;
  blocksScanned: number;
}

async function scanChain(
  chain: SupportedChain,
  tipBlock: number,
): Promise<ChainScanResult> {
  const cfg = CHAIN_CONFIG[chain];
  const fromBlock = Math.max(0, tipBlock - BLOCK_SPAN);

  /* 1. Pull each block in the window with full transactions.
        Parallelized but capped at 5 concurrent requests so we
        don't slam the RPC provider. */
  const blockNumbers: number[] = [];
  for (let n = fromBlock; n <= tipBlock; n++) blockNumbers.push(n);

  const blocks: (FullBlock | null)[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < blockNumbers.length; i += CONCURRENCY) {
    const slice = blockNumbers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map((n) => fetchBlockWithTxs(chain, n)),
    );
    blocks.push(...results);
  }

  /* 2. Find all transactions where `to` is null — these are
        contract creations. */
  const creationTxs: BlockTransaction[] = [];
  for (const block of blocks) {
    if (!block || !Array.isArray(block.transactions)) continue;
    for (const tx of block.transactions) {
      /* Skip if not a contract creation (to != null) */
      if (tx.to !== null) continue;
      /* Skip noise deployers (Uniswap factory etc) */
      if (tx.from && NOISE_DEPLOYERS.has(tx.from.toLowerCase())) continue;
      creationTxs.push(tx);
      if (creationTxs.length >= MAX_CREATIONS_PER_CHAIN) break;
    }
    if (creationTxs.length >= MAX_CREATIONS_PER_CHAIN) break;
  }

  if (creationTxs.length === 0) {
    return {
      projects: [],
      creations: 0,
      tokens: 0,
      blocksScanned: BLOCK_SPAN,
    };
  }

  /* 3. Fetch receipts to get the deployed contract addresses.
        eth_getTransactionReceipt batches well; we run them in
        parallel chunks. */
  const receipts: (TransactionReceipt | null)[] = [];
  for (let i = 0; i < creationTxs.length; i += CONCURRENCY) {
    const slice = creationTxs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map((tx) => fetchReceipt(chain, tx.hash)),
    );
    receipts.push(...results);
  }

  /* 4. Pair creations with their resulting contract addresses,
        skipping reverts. */
  const candidates: Array<{
    contractAddress: string;
    deployer: string;
    txHash: string;
    blockNumber: number;
  }> = [];
  for (let i = 0; i < creationTxs.length; i++) {
    const r = receipts[i];
    if (!r || !r.contractAddress || r.status !== "0x1") continue;
    /* Defense in depth — re-check noise deployers on the receipt's
       `from` field too, in case the tx-list `from` was missing. */
    if (NOISE_DEPLOYERS.has(r.from.toLowerCase())) continue;

    candidates.push({
      contractAddress: r.contractAddress.toLowerCase(),
      deployer: r.from.toLowerCase(),
      txHash: r.transactionHash,
      blockNumber: parseInt(r.blockNumber, 16),
    });
  }

  if (candidates.length === 0) {
    return {
      projects: [],
      creations: creationTxs.length,
      tokens: 0,
      blocksScanned: BLOCK_SPAN,
    };
  }

  /* 5. Resolve token metadata for all candidate contracts. The
        resolver returns absent entries for non-tokens — those get
        filtered out next. */
  const addresses = candidates.map((c) => c.contractAddress);
  const metaMap = await resolveTokenMetadata(chain, addresses);

  /* 6. Build NewProject records for entries that resolved as ERC-20s. */
  const projects: NewProject[] = [];
  for (const c of candidates) {
    const meta = metaMap.get(c.contractAddress);
    if (!meta) continue; // not an ERC-20
    /* Sanity filter — symbol must be reasonable. The metadata
       resolver already does this but defense in depth. */
    if (!meta.symbol || meta.symbol.length === 0 || meta.symbol.length > 12) {
      continue;
    }

    projects.push({
      id: `${c.txHash}-${c.contractAddress}`,
      contractAddress: c.contractAddress,
      chain: cfg.name,
      chainId: cfg.chainId,
      blockNumber: c.blockNumber,
      discoveredAt: Date.now(),
      deployer: c.deployer,
      symbol: meta.symbol,
      name: meta.name,
      decimals: meta.decimals,
      contractUrl: `${cfg.explorerBase}/address/${c.contractAddress}`,
      deployerUrl: `${cfg.explorerBase}/address/${c.deployer}`,
      txUrl: `${cfg.explorerBase}/tx/${c.txHash}`,
      txHash: c.txHash,
    });

    if (projects.length >= MAX_TOKENS_PER_CHAIN) break;
  }

  return {
    projects,
    creations: creationTxs.length,
    tokens: projects.length,
    blocksScanned: BLOCK_SPAN,
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Buffer management                                            */
/* ═══════════════════════════════════════════════════════════ */

function mergeIntoBuffer(projects: NewProject[]): void {
  const now = Date.now();

  for (const p of projects) {
    /* Don't overwrite — keep the original discoveredAt. */
    if (!projectBuffer.has(p.id)) {
      projectBuffer.set(p.id, p);
    }
  }

  /* Evict old entries. */
  for (const [id, p] of projectBuffer.entries()) {
    if (now - p.discoveredAt > BUFFER_MAX_AGE_MS) {
      projectBuffer.delete(id);
    }
  }

  /* Cap total size — drop oldest. */
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

/**
 * Read the buffer, sorted newest first. Returns up to `limit`
 * entries.
 */
export function readProjectBuffer(limit: number = 100): NewProject[] {
  const all = [...projectBuffer.values()];
  all.sort((a, b) => b.discoveredAt - a.discoveredAt);
  return all.slice(0, limit);
}

/* ═══════════════════════════════════════════════════════════ */
/* Top-level scan with cache                                    */
/* ═══════════════════════════════════════════════════════════ */

const scanCache = new TtlCache<NewProjectsScanResult>(270_000); // 4.5 min

export interface ScanInputs {
  chains: SupportedChain[];
  tipBlocks: Map<SupportedChain, number>;
}

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
          creations: 0,
          tokens: 0,
          blocksScanned: 0,
          projects: [] as NewProject[],
        };
      }
      try {
        const result = await scanChain(chain, tip);
        return {
          chain: CHAIN_CONFIG[chain].name,
          ...result,
        };
      } catch {
        return {
          chain: CHAIN_CONFIG[chain].name,
          creations: 0,
          tokens: 0,
          blocksScanned: 0,
          projects: [] as NewProject[],
        };
      }
    }),
  );

  /* Merge all chains' new findings into the rolling buffer. */
  const allNew: NewProject[] = [];
  for (const r of perChainResults) allNew.push(...r.projects);
  mergeIntoBuffer(allNew);

  /* Build the response from the buffer (which includes recent
     scans, not just this one's findings). */
  const result: NewProjectsScanResult = {
    projects: readProjectBuffer(100),
    totalCreations: perChainResults.reduce((s, r) => s + r.creations, 0),
    totalTokens: perChainResults.reduce((s, r) => s + r.tokens, 0),
    perChain: perChainResults.map((r) => ({
      chain: r.chain,
      creations: r.creations,
      tokens: r.tokens,
      blocksScanned: r.blocksScanned,
    })),
  };

  if (result.projects.length > 0) scanCache.set("scan", result);
  return result;
}
