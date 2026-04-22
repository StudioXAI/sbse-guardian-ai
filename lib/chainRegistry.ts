/* ─────────────────────────────────────────────────────────────
   Chain Registry — Etherscan V2 unified endpoint.
   Covers every mainnet Etherscan V2 supports (35 chains).
   Ordered by priority: most popular first, so tiered detection
   hits mainstream chains before obscure ones.
   Single ETHERSCAN_API_KEY works across all of them.
   ───────────────────────────────────────────────────────────── */

export interface ChainEntry {
  id: string;
  name: string;
  chainIdNum: number;
  rpc: string | undefined;
  explorerApi: string;
  apiKeyEnv: string;
  symbol: string;
  /** Detection tier. Lower = scanned first. */
  tier: 1 | 2 | 3;
}

const V2_API = "https://api.etherscan.io/v2/api";
const API_KEY_ENV = "ETHERSCAN_API_KEY";

/**
 * Resolve a chain's RPC URL, preferring env override, then a sensible
 * public fallback (for chains where one is commonly available).
 */
const rpc = (envVar: string, fallback?: string) =>
  process.env[envVar] || fallback;

export const CHAIN_REGISTRY: ChainEntry[] = [
  /* ── Tier 1: Where 95% of value lives. Scan these first. ── */
  { id: "ethereum",  name: "Ethereum",        chainIdNum: 1,     symbol: "ETH",  tier: 1,
    rpc: rpc("ETH_RPC_URL",       "https://eth.llamarpc.com"),          explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "bsc",       name: "BNB Smart Chain", chainIdNum: 56,    symbol: "BNB",  tier: 1,
    rpc: rpc("BSC_RPC_URL",       "https://bsc-dataseed.binance.org"),  explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "polygon",   name: "Polygon",         chainIdNum: 137,   symbol: "POL",  tier: 1,
    rpc: rpc("POLYGON_RPC_URL",   "https://polygon-rpc.com"),           explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "base",      name: "Base",            chainIdNum: 8453,  symbol: "ETH",  tier: 1,
    rpc: rpc("BASE_RPC_URL",      "https://mainnet.base.org"),          explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "arbitrum",  name: "Arbitrum One",    chainIdNum: 42161, symbol: "ETH",  tier: 1,
    rpc: rpc("ARBITRUM_RPC_URL",  "https://arb1.arbitrum.io/rpc"),      explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "optimism",  name: "OP Mainnet",      chainIdNum: 10,    symbol: "ETH",  tier: 1,
    rpc: rpc("OPTIMISM_RPC_URL",  "https://mainnet.optimism.io"),       explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "avalanche", name: "Avalanche",       chainIdNum: 43114, symbol: "AVAX", tier: 1,
    rpc: rpc("AVALANCHE_RPC_URL", "https://api.avax.network/ext/bc/C/rpc"), explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },

  /* ── Tier 2: Established L2s + mainnets. ── */
  { id: "linea",     name: "Linea",           chainIdNum: 59144, symbol: "ETH",  tier: 2,
    rpc: rpc("LINEA_RPC_URL",     "https://rpc.linea.build"),           explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "blast",     name: "Blast",           chainIdNum: 81457, symbol: "ETH",  tier: 2,
    rpc: rpc("BLAST_RPC_URL",     "https://rpc.blast.io"),              explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "scroll",    name: "Scroll",          chainIdNum: 534352,symbol: "ETH",  tier: 2,
    rpc: rpc("SCROLL_RPC_URL",    "https://rpc.scroll.io"),             explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "mantle",    name: "Mantle",          chainIdNum: 5000,  symbol: "MNT",  tier: 2,
    rpc: rpc("MANTLE_RPC_URL",    "https://rpc.mantle.xyz"),            explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "gnosis",    name: "Gnosis",          chainIdNum: 100,   symbol: "xDAI", tier: 2,
    rpc: rpc("GNOSIS_RPC_URL",    "https://rpc.gnosischain.com"),       explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "celo",      name: "Celo",            chainIdNum: 42220, symbol: "CELO", tier: 2,
    rpc: rpc("CELO_RPC_URL",      "https://forno.celo.org"),            explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "fraxtal",   name: "Fraxtal",         chainIdNum: 252,   symbol: "frxETH", tier: 2,
    rpc: rpc("FRAXTAL_RPC_URL",   "https://rpc.frax.com"),              explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "taiko",     name: "Taiko",           chainIdNum: 167000,symbol: "ETH",  tier: 2,
    rpc: rpc("TAIKO_RPC_URL",     "https://rpc.mainnet.taiko.xyz"),     explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "opbnb",     name: "opBNB",           chainIdNum: 204,   symbol: "BNB",  tier: 2,
    rpc: rpc("OPBNB_RPC_URL",     "https://opbnb-mainnet-rpc.bnbchain.org"), explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "unichain",  name: "Unichain",        chainIdNum: 130,   symbol: "ETH",  tier: 2,
    rpc: rpc("UNICHAIN_RPC_URL",  "https://mainnet.unichain.org"),      explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "world",     name: "World Chain",     chainIdNum: 480,   symbol: "ETH",  tier: 2,
    rpc: rpc("WORLD_RPC_URL",     undefined),                           explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "sonic",     name: "Sonic",           chainIdNum: 146,   symbol: "S",    tier: 2,
    rpc: rpc("SONIC_RPC_URL",     "https://rpc.soniclabs.com"),         explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "abstract",  name: "Abstract",        chainIdNum: 2741,  symbol: "ETH",  tier: 2,
    rpc: rpc("ABSTRACT_RPC_URL",  "https://api.mainnet.abs.xyz"),       explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },

  /* ── Tier 3: Newer / niche chains. ── */
  { id: "berachain", name: "Berachain",       chainIdNum: 80094, symbol: "BERA", tier: 3,
    rpc: rpc("BERACHAIN_RPC_URL", "https://rpc.berachain.com"),         explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "sei",       name: "Sei",             chainIdNum: 1329,  symbol: "SEI",  tier: 3,
    rpc: rpc("SEI_RPC_URL",       "https://evm-rpc.sei-apis.com"),      explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "monad",     name: "Monad",           chainIdNum: 143,   symbol: "MON",  tier: 3,
    rpc: rpc("MONAD_RPC_URL",     undefined),                           explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "hyperevm",  name: "HyperEVM",        chainIdNum: 999,   symbol: "HYPE", tier: 3,
    rpc: rpc("HYPEREVM_RPC_URL",  "https://rpc.hyperliquid.xyz/evm"),   explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "katana",    name: "Katana",          chainIdNum: 747474,symbol: "ETH",  tier: 3,
    rpc: rpc("KATANA_RPC_URL",    undefined),                           explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "megaeth",   name: "MegaETH",         chainIdNum: 4326,  symbol: "ETH",  tier: 3,
    rpc: rpc("MEGAETH_RPC_URL",   undefined),                           explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "swell",     name: "Swellchain",      chainIdNum: 1923,  symbol: "ETH",  tier: 3,
    rpc: rpc("SWELL_RPC_URL",     "https://swell-mainnet.alt.technology"), explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "apechain",  name: "ApeChain",        chainIdNum: 33139, symbol: "APE",  tier: 3,
    rpc: rpc("APECHAIN_RPC_URL",  "https://apechain.calderachain.xyz/http"), explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "plasma",    name: "Plasma",          chainIdNum: 9745,  symbol: "XPL",  tier: 3,
    rpc: rpc("PLASMA_RPC_URL",    undefined),                           explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "stable",    name: "Stable",          chainIdNum: 988,   symbol: "USDT", tier: 3,
    rpc: rpc("STABLE_RPC_URL",    undefined),                           explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "moonbeam",  name: "Moonbeam",        chainIdNum: 1284,  symbol: "GLMR", tier: 3,
    rpc: rpc("MOONBEAM_RPC_URL",  "https://rpc.api.moonbeam.network"),  explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "moonriver", name: "Moonriver",       chainIdNum: 1285,  symbol: "MOVR", tier: 3,
    rpc: rpc("MOONRIVER_RPC_URL", "https://rpc.api.moonriver.moonbeam.network"), explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "bttc",      name: "BitTorrent Chain",chainIdNum: 199,   symbol: "BTT",  tier: 3,
    rpc: rpc("BTTC_RPC_URL",      "https://rpc.bittorrentchain.io"),    explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "xdc",       name: "XDC Network",     chainIdNum: 50,    symbol: "XDC",  tier: 3,
    rpc: rpc("XDC_RPC_URL",       "https://rpc.ankr.com/xdc"),          explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
  { id: "memecore",  name: "Memecore",        chainIdNum: 4352,  symbol: "M",    tier: 3,
    rpc: rpc("MEMECORE_RPC_URL",  undefined),                           explorerApi: V2_API, apiKeyEnv: API_KEY_ENV },
];

/** One Etherscan V2 key works across all chains. */
export function getExplorerApiKey(_chain: ChainEntry): string {
  return process.env.ETHERSCAN_API_KEY || "";
}
