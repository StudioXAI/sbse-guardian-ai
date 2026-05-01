/* ─────────────────────────────────────────────────────────────
   Risk Events Scanner — chain-wide admin event detection

   Scans every contract on each enabled chain for emissions of
   standard admin events. These are the OpenZeppelin patterns used
   by the vast majority of production tokens, DEXes, lending
   protocols, and staking contracts:

     OwnershipTransferred  — owner changed (renounced or transferred
                             to attacker)
     Upgraded              — proxy implementation changed
                             (upgradeTo / upgradeToAndCall executed)
     AdminChanged          — proxy admin changed
     RoleGranted           — access control role given to an address
     Paused / Unpaused     — contract paused (transfers frozen)

   This is broader and more reliable than scanning function-call
   selectors on a hardcoded contract list. Whole-chain coverage,
   no curation needed, scales the same way the DEX scanner does.

   COST PROFILE:
   - 1 eth_getLogs per chain per event topic = 5 calls per chain
   - Times 6 chains = 30 calls per refresh
   - Each call typically returns 5-200 events at chain tip
   - Well within QuickNode Build tier headroom

   Output is a list of RiskEvent records compatible with the
   existing UI panel. Each event includes the contract address
   that emitted it (so users can investigate further), the new
   owner / admin / role recipient, and a severity classification.
   ───────────────────────────────────────────────────────────── */

import {
  rpcCall,
  toHexBlock,
  CHAIN_CONFIG,
  type SupportedChain,
} from "./quicknodeClient";
import { parseAddressTopic } from "./dexEventScanner";
import { resolveTokenMetadata } from "./tokenMetadata";
import { getWalletLabel } from "./walletLabels";
import type { RiskSeverity } from "./riskFunctions";

/* ═══════════════════════════════════════════════════════════ */
/* Event topic registry                                         */
/* ═══════════════════════════════════════════════════════════ */

interface AdminEventDef {
  topic: string;
  signature: string;
  shortName: string;
  severity: RiskSeverity;
  description: string;
  /** How to format the human-readable detail line for this event,
      given the parsed indexed parameters. */
  format: (params: string[]) => string;
}

/* keccak256 hashes for standard admin events. These are stable
   across the entire EVM ecosystem because OpenZeppelin's contracts
   are the canonical reference implementation. */
const ADMIN_EVENTS: AdminEventDef[] = [
  {
    /* OwnershipTransferred(address indexed previousOwner, address indexed newOwner) */
    topic: "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0",
    signature: "OwnershipTransferred(address,address)",
    shortName: "OwnershipTransferred",
    severity: "critical",
    description:
      "Contract ownership changed. New owner can call all owner-only functions including mint, pause, upgrade.",
    format: (p) => {
      const [prev, next] = p;
      if (
        next === "0x0000000000000000000000000000000000000000"
      ) {
        return `Ownership renounced (was ${shorten(prev)})`;
      }
      return `Ownership transferred from ${shorten(prev)} to ${shorten(next)}`;
    },
  },
  {
    /* Upgraded(address indexed implementation) */
    topic: "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b",
    signature: "Upgraded(address)",
    shortName: "Upgraded",
    severity: "critical",
    description:
      "Proxy contract upgraded to new implementation. New code is now active — the contract can do anything the new implementation allows.",
    format: (p) => {
      const [impl] = p;
      return `Proxy upgraded to implementation ${shorten(impl)}`;
    },
  },
  {
    /* AdminChanged(address previousAdmin, address newAdmin) — non-indexed! */
    topic: "0x7e644d79422f17c01e4894b5f4f588d331ebfa28653d42ae832dc59e38c9798f",
    signature: "AdminChanged(address,address)",
    shortName: "AdminChanged",
    severity: "critical",
    description:
      "Proxy admin changed. New admin controls upgrades.",
    format: (p) => {
      const [prev, next] = p;
      return `Proxy admin changed from ${shorten(prev)} to ${shorten(next)}`;
    },
  },
  {
    /* RoleGranted(bytes32 indexed role, address indexed account, address indexed sender) */
    topic: "0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d",
    signature: "RoleGranted(bytes32,address,address)",
    shortName: "RoleGranted",
    severity: "high",
    description:
      "Access control role granted. The recipient gains permissions specific to that role.",
    format: (p) => {
      const [role, account, sender] = p;
      return `Role ${shortenHash(role)} granted to ${shorten(account)} by ${shorten(sender)}`;
    },
  },
  {
    /* Paused(address account) — non-indexed */
    topic: "0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258",
    signature: "Paused(address)",
    shortName: "Paused",
    severity: "high",
    description:
      "Contract paused. Transfers and other restricted operations are frozen until unpaused.",
    format: (p) => {
      const [acct] = p;
      return `Contract paused by ${shorten(acct)}`;
    },
  },
  {
    /* Unpaused(address account) — non-indexed */
    topic: "0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa",
    signature: "Unpaused(address)",
    shortName: "Unpaused",
    severity: "low",
    description: "Contract unpaused — operations resumed.",
    format: (p) => {
      const [acct] = p;
      return `Contract unpaused by ${shorten(acct)}`;
    },
  },
];

const TOPIC_TO_DEF = new Map(ADMIN_EVENTS.map((e) => [e.topic, e]));

/* ═══════════════════════════════════════════════════════════ */
/* Scan parameters                                              */
/* ═══════════════════════════════════════════════════════════ */

const BLOCK_SPAN = 30;
const MAX_LOGS_PER_TOPIC_PER_CHAIN = 100;
/* Cap on how many events surface per scan — pre-trim so the UI
   doesn't get flooded if a market-stress moment fires hundreds. */
const MAX_RESULTS = 50;

/* ═══════════════════════════════════════════════════════════ */
/* Output type — matches the existing RiskEvent shape           */
/* ═══════════════════════════════════════════════════════════ */

export interface AdminRiskEvent {
  id: string;
  txHash: string;
  chain: string;
  chainId: number;
  /** Human-readable function name e.g. "OwnershipTransferred". */
  functionName: string;
  signature: string;
  severity: RiskSeverity;
  /** Plain-English description of what happened. */
  description: string;
  /** Wallet/EOA that initiated the change (decoded from event). */
  callerAddress: string;
  callerLabel?: string;
  /** Contract that emitted the event. */
  targetAddress: string;
  targetLabel?: string;
  /** Token symbol if the contract is a known ERC-20 we can identify. */
  symbol?: string;
  txUrl: string;
  callerUrl: string;
  targetUrl: string;
  timestamp: number;
}

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

/* ═══════════════════════════════════════════════════════════ */
/* Per-chain scan                                               */
/* ═══════════════════════════════════════════════════════════ */

async function scanAdminEventsOnChain(
  chain: SupportedChain,
  tipBlock: number,
): Promise<{ events: AdminRiskEvent[]; eventsSeen: number }> {
  const cfg = CHAIN_CONFIG[chain];
  const fromBlock = Math.max(0, tipBlock - BLOCK_SPAN);
  const baseFilter = {
    fromBlock: toHexBlock(fromBlock),
    toBlock: toHexBlock(tipBlock),
  };

  /* Fire one eth_getLogs per topic in parallel. Each call returns
     all events of that type across the entire chain in the window. */
  const logBatches = await Promise.all(
    ADMIN_EVENTS.map(async (def) => {
      const result = await rpcCall<RawLog[]>(chain, "eth_getLogs", [
        { ...baseFilter, topics: [def.topic] },
      ]);
      if (!Array.isArray(result)) return [] as RawLog[];
      return result.slice(0, MAX_LOGS_PER_TOPIC_PER_CHAIN);
    }),
  );

  /* Flatten all logs from all topics. */
  const allLogs: RawLog[] = [];
  for (const batch of logBatches) allLogs.push(...batch);
  const eventsSeen = allLogs.length;

  if (allLogs.length === 0) {
    return { events: [], eventsSeen: 0 };
  }

  /* Resolve token metadata for all the contracts that fired events.
     Many will not be ERC-20 (could be staking pools, governance,
     bridges, etc) — those just don't get a symbol. The metadata
     resolver returns absent entries silently. */
  const uniqueContracts = Array.from(
    new Set(allLogs.map((l) => l.address.toLowerCase())),
  );
  const tokenMeta = await resolveTokenMetadata(chain, uniqueContracts);

  /* Build risk events from each log. */
  const events: AdminRiskEvent[] = [];
  for (const log of allLogs) {
    if (!Array.isArray(log.topics) || log.topics.length === 0) continue;
    const def = TOPIC_TO_DEF.get(log.topics[0]);
    if (!def) continue;

    const contract = log.address.toLowerCase();
    /* Extract indexed parameters from the topic array (skip topic[0] which
       is the event signature). For non-indexed params (like AdminChanged
       and Paused/Unpaused), the data is in the log.data field. */
    const indexedParams = log.topics.slice(1).map(parseAddressTopic);

    /* For events with non-indexed parameters, parse them from log.data. */
    const dataParams = parseDataAddresses(log.data);

    /* Combine indexed + data parameters in the order needed by the format
       function. The order varies per event — we pass them in their natural
       order from topics first, then data. The format function knows what
       to do with them. */
    const allParams = [...indexedParams, ...dataParams];

    /* Caller is best-effort: for events with a clear initiator
       (Paused, Unpaused, RoleGranted) it's the relevant param.
       For OwnershipTransferred / Upgraded / AdminChanged we don't
       have the original tx sender from the event alone — we'd need
       eth_getTransactionByHash for that. To keep cost down, we
       use the contract itself as the caller display when we don't
       have an EOA, and let users click through to view the tx
       for the actual sender. */
    let caller = contract;
    if (def.shortName === "Paused" || def.shortName === "Unpaused") {
      caller = dataParams[0] ?? contract;
    } else if (def.shortName === "RoleGranted") {
      /* sender is the third param (sender of the role grant). */
      caller = indexedParams[2] ?? contract;
    } else if (def.shortName === "OwnershipTransferred") {
      /* The previous owner is the one who initiated the transfer
         (the call to transferOwnership). */
      caller = indexedParams[0] ?? contract;
    }

    const meta = tokenMeta.get(contract);
    const callerLabel = getWalletLabel(cfg.chainId, caller);
    const targetLabel = getWalletLabel(cfg.chainId, contract);

    const blockNum = parseInt(log.blockNumber, 16);
    /* Approximate timestamp — we don't have block timestamps without
       extra RPC calls. The display uses "X minutes ago" so being off
       by a minute is acceptable. */
    const timestamp = Date.now();

    events.push({
      id: `admin-${log.transactionHash}-${log.topics[0].slice(0, 10)}`,
      txHash: log.transactionHash,
      chain: cfg.name,
      chainId: cfg.chainId,
      functionName: def.shortName,
      signature: def.signature,
      severity: def.severity,
      description: `${def.format(allParams)}. ${def.description}`,
      callerAddress: caller,
      callerLabel: callerLabel?.label,
      targetAddress: contract,
      targetLabel: targetLabel?.label ?? meta?.symbol,
      symbol: meta?.symbol,
      txUrl: `${cfg.explorerBase}/tx/${log.transactionHash}`,
      callerUrl: `${cfg.explorerBase}/address/${caller}`,
      targetUrl: `${cfg.explorerBase}/address/${contract}`,
      timestamp,
    });
  }

  return { events, eventsSeen };
}

/**
 * Pull all 32-byte-aligned address-shaped values from a hex data
 * blob. Used for events with non-indexed address parameters where
 * each address is encoded as a 32-byte right-padded value in the
 * data field.
 */
function parseDataAddresses(data: string): string[] {
  if (!data || typeof data !== "string") return [];
  const stripped = data.startsWith("0x") ? data.slice(2) : data;
  const out: string[] = [];
  /* Each 32-byte word = 64 hex chars. An address sits in the low
     20 bytes (last 40 hex chars) of a word with the high 12 bytes
     zero-padded. */
  for (let i = 0; i + 64 <= stripped.length; i += 64) {
    const word = stripped.slice(i, i + 64);
    /* Heuristic: only treat as an address if the high 12 bytes are
       zero. Otherwise it's some other encoded value. */
    if (word.slice(0, 24) === "000000000000000000000000") {
      out.push("0x" + word.slice(24).toLowerCase());
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════ */
/* Public entry — orchestrator calls this                       */
/* ═══════════════════════════════════════════════════════════ */

export interface AdminEventScanResult {
  events: AdminRiskEvent[];
  totalEventsSeen: number;
}

export async function scanAdminEvents(
  chains: SupportedChain[],
  tipBlocks: Map<SupportedChain, number>,
): Promise<AdminEventScanResult> {
  const results = await Promise.all(
    chains.map(async (chain) => {
      const tip = tipBlocks.get(chain);
      if (tip === undefined) return null;
      try {
        return await scanAdminEventsOnChain(chain, tip);
      } catch {
        return null;
      }
    }),
  );

  const all: AdminRiskEvent[] = [];
  let totalEventsSeen = 0;
  for (const r of results) {
    if (!r) continue;
    all.push(...r.events);
    totalEventsSeen += r.eventsSeen;
  }

  /* Sort by severity weight (critical → high → medium → low),
     then by timestamp desc within each severity tier. */
  const sevWeight: Record<RiskSeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  all.sort((a, b) => {
    const w = sevWeight[b.severity] - sevWeight[a.severity];
    if (w !== 0) return w;
    return b.timestamp - a.timestamp;
  });

  return {
    events: all.slice(0, MAX_RESULTS),
    totalEventsSeen,
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Display helpers                                              */
/* ═══════════════════════════════════════════════════════════ */

function shorten(addr: string): string {
  if (!addr) return "—";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortenHash(hash: string): string {
  if (!hash) return "—";
  if (hash.length < 12) return hash;
  return `${hash.slice(0, 10)}…`;
}
