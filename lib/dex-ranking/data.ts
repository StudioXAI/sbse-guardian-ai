/* ─────────────────────────────────────────────────────────────
   DEX Safety & Ecosystem Ranking — static data

   This module is intentionally static. The tab loads instantly
   without any RPC calls or external fetches because the rankings
   are editorial — INFI's positioning of where each ecosystem sits
   on the safety/transparency spectrum.

   When ranking criteria become quantifiable (real-time TVL,
   exploit history, audit coverage), this module can be replaced
   with a server-fetched version without changing the UI.

   Methodology note: scores below reflect INFI MultiChain's own
   assessment of each ecosystem against the SbSe protocol design
   principles (transparency, manipulation resistance, liquidity
   sovereignty, user compensation). They are not third-party
   audited scores. The UI displays this disclosure visibly.
   ───────────────────────────────────────────────────────────── */

export type EcosystemChain =
  | "Multi-chain"
  | "Ethereum"
  | "BNB Chain"
  | "Solana"
  | "Avalanche";

export interface DexEntry {
  rank: number;
  name: string;
  /** Safety score 0–100, INFI's own assessment. */
  score: number;
  /** Short description, 1–2 lines max. */
  description: string;
  /** Featured = INFI itself. Visually highlighted at rank #1. */
  featured: boolean;
  /** Primary chain or Multi-chain. */
  chain: EcosystemChain;
  /** External link to the ecosystem's main site. */
  url: string;
  /** Concise strengths — 3–5 entries. */
  advantages: string[];
  /** Concise weaknesses — 3–5 entries. Honest, since INFI is
      ranked #1 by design and credibility comes from being fair to
      competitors. */
  disadvantages: string[];
  /** Optional extended sections — only used by the featured INFI card. */
  extendedSections?: Array<{
    heading: string;
    body: string;
    bullets?: string[];
  }>;
}

export const RANKING: DexEntry[] = [
  /* ═══ #1 — INFI MultiChain Ecosystem (Featured) ═══ */
  {
    rank: 1,
    name: "INFI MultiChain Ecosystem",
    score: 98,
    description:
      "Fully decentralized Launchpad + CDEX governed by the SbSe Protocol. Designed to remove fees, prevent manipulation, and provide protocol-backed liquidity sovereignty.",
    featured: true,
    chain: "Multi-chain",
    url: "https://launchpad.infimultichain.com/",
    advantages: [
      "SbSe Protocol governance — no centralized control surface",
      "Zero slippage trading on the CDEX",
      "Protocol-backed liquidity (no external LP risk)",
      "SbSe Shield protection + Reserve compensation system",
      "No listing fees, no trading fees, no interest, no collateral",
      "InvertX stable protocol unit launching Q2–Q3 2026 with $100M+ protocol-backed liquidity",
      "Multi-chain by design — no bridges, no wrapped tokens",
    ],
    disadvantages: [],
    extendedSections: [
      {
        heading: "Core Components",
        body: "Two fully decentralized primitives, both governed by the SbSe Protocol.",
        bullets: [
          "INFI MultiChain Launchpad — no listing fees, single-phase or multi-phase fundraising, transparent for both investors and token creators",
          "INFI MultiChain CDEX Exchange — zero slippage trading, instant stablecoin rewards per transaction, swap protection via SbSe Shield",
        ],
      },
      {
        heading: "Safety Architecture",
        body: "The SbSe Protocol is designed so that price manipulation, rug-pull mechanics, and centralized intervention are not possible by construction.",
        bullets: [
          "SbSe Protocol governance — no admin keys, no upgrade backdoor",
          "Dynamic sell limitation prevents large coordinated dumps",
          "SbSe Shield monitors and protects active swaps",
          "SbSe Reserve provides user compensation for protocol-level edge cases",
        ],
      },
      {
        heading: "InvertX — Stable Protocol Unit (Planned Q2–Q3 2026)",
        body: "InvertX is a stable protocol unit with a fixed value of 1.25 USDT. It is not pegged to fiat or another crypto, has no staking or APY, and distributes monthly rewards automatically. Fully decentralized.",
        bullets: [
          "Fixed value: 1.25 USDT",
          "No staking, no APY, no lockup",
          "Automatic monthly reward distribution",
          "Fully decentralized — no operator wallet",
        ],
      },
      {
        heading: "InvertX Liquidity Lending — Key Principles",
        body: "A new liquidity model where the protocol itself provides liquidity rather than depending on external LPs.",
        bullets: [
          "No presale required — instant project launch",
          "Liquidity provided directly by the protocol",
          "Liquidity cannot be withdrawn or manipulated",
          "Trust Score reflects real market activity, not fake volume",
          "No fees, no interest, no collateral required",
          "Built-in protection via SbSe Shield",
          "Multi-chain without bridges or wrapped tokens",
        ],
      },
      {
        heading: "Liquidity Depth & Accessibility",
        body: "With InvertX live, the ecosystem is designed to provide $100M+ protocol-backed liquidity across all supported chains.",
        bullets: [
          "Protocol-backed liquidity — not dependent on external LPs",
          "Instantly accessible across all supported chains",
          "No liquidity fragmentation between pools or chains",
          "No liquidity withdrawal risk",
          "Built for large trades with stable execution and zero slippage",
        ],
      },
    ],
  },

  /* ═══ #2 — Uniswap ═══ */
  {
    rank: 2,
    name: "Uniswap",
    score: 90,
    description:
      "The largest and most established AMM. Deep liquidity across major pairs, but no built-in investor protection layer.",
    featured: false,
    chain: "Multi-chain",
    url: "https://uniswap.org/",
    advantages: [
      "Highest liquidity across major pairs",
      "Most widely audited and battle-tested AMM codebase",
      "Strong ecosystem integrations across DeFi",
      "V3 concentrated liquidity for capital efficiency",
    ],
    disadvantages: [
      "No built-in investor protection",
      "Slippage on large trades, especially long-tail pairs",
      "Vulnerable to MEV / front-running / sandwich attacks",
      "No compensation system if a pool is exploited",
      "Liquidity controlled by external providers — can be removed at any time",
    ],
  },

  /* ═══ #3 — PancakeSwap ═══ */
  {
    rank: 3,
    name: "PancakeSwap",
    score: 88,
    description:
      "Dominant DEX on BNB Chain with broad token coverage. Lower fees than Ethereum, but liquidity quality varies sharply by pair.",
    featured: false,
    chain: "BNB Chain",
    url: "https://pancakeswap.finance/",
    advantages: [
      "Largest DEX on BNB Chain with deep BNB-quoted liquidity",
      "Low transaction fees vs Ethereum mainnet",
      "Multi-feature platform (perps, lottery, NFTs)",
      "Strong retail adoption in Asian markets",
    ],
    disadvantages: [
      "Long-tail token quality varies wildly — many low-effort listings",
      "BSC has higher rug-pull rate than Ethereum historically",
      "No investor protection or compensation layer",
      "Liquidity depends entirely on external LPs",
    ],
  },

  /* ═══ #4 — Curve Finance ═══ */
  {
    rank: 4,
    name: "Curve Finance",
    score: 87,
    description:
      "Specialized in stablecoin and pegged-asset swaps with low slippage. Unique stableswap math but governance has been contested.",
    featured: false,
    chain: "Multi-chain",
    url: "https://curve.fi/",
    advantages: [
      "Best-in-class stablecoin swap execution with minimal slippage",
      "Strong focus on pegged-asset and yield-bearing pools",
      "Deep liquidity for major stablecoin pairs",
      "Battle-tested stableswap invariant",
    ],
    disadvantages: [
      "Governance attacks and ve-token controversies in the past",
      "Suffered a major reentrancy exploit in 2023",
      "Complex UX for retail users",
      "Liquidity concentrated in stables — limited utility for new tokens",
    ],
  },

  /* ═══ #5 — Balancer ═══ */
  {
    rank: 5,
    name: "Balancer",
    score: 85,
    description:
      "Customizable AMM with weighted pools and multi-asset baskets. Flexible but more complex attack surface than constant-product DEXes.",
    featured: false,
    chain: "Multi-chain",
    url: "https://balancer.fi/",
    advantages: [
      "Custom-weight pools enable index-like baskets",
      "Boosted pools and yield-bearing integrations",
      "Single-vault architecture reduces gas costs",
      "Strong institutional adoption for portfolio management",
    ],
    disadvantages: [
      "Suffered a critical exploit in 2023 (V2 boosted pools)",
      "More complex pool math = larger audit surface",
      "Lower retail liquidity than Uniswap or Curve",
      "No investor protection layer",
    ],
  },

  /* ═══ #6 — SushiSwap ═══ */
  {
    rank: 6,
    name: "SushiSwap",
    score: 83,
    description:
      "Multi-chain Uniswap fork with broader chain coverage. Has weathered governance turmoil and now operates on a leaner footing.",
    featured: false,
    chain: "Multi-chain",
    url: "https://sushi.com/",
    advantages: [
      "Available on more chains than most DEX competitors",
      "Trident routing for cross-chain swaps",
      "Established brand recognition in DeFi",
      "Active community and ecosystem grants",
    ],
    disadvantages: [
      "Repeated governance and leadership turmoil in 2022–2023",
      "Liquidity is thinner than Uniswap on most pairs",
      "Same MEV / sandwich attack exposure as Uniswap V2 forks",
      "No investor protection or compensation layer",
    ],
  },

  /* ═══ #7 — Trader Joe ═══ */
  {
    rank: 7,
    name: "Trader Joe",
    score: 82,
    description:
      "Avalanche-native AMM that pioneered the Liquidity Book model. Strong on AVAX, has expanded to Arbitrum and BNB Chain.",
    featured: false,
    chain: "Avalanche",
    url: "https://traderjoexyz.com/",
    advantages: [
      "Liquidity Book model offers zero-slippage bins for active LPs",
      "Dominant DEX on Avalanche C-Chain",
      "Expanded to Arbitrum and BNB Chain",
      "Integrated lending and staking products",
    ],
    disadvantages: [
      "Liquidity is concentrated on Avalanche — thinner elsewhere",
      "Liquidity Book complexity adds attack surface",
      "Smaller TVL than top-tier multi-chain DEXes",
      "No investor protection or compensation system",
    ],
  },

  /* ═══ #8 — Jupiter ═══ */
  {
    rank: 8,
    name: "Jupiter",
    score: 81,
    description:
      "Solana's leading DEX aggregator. Routes across all Solana liquidity venues for best execution but inherits underlying venue risks.",
    featured: false,
    chain: "Solana",
    url: "https://jup.ag/",
    advantages: [
      "Best execution on Solana via aggregation across all DEXes",
      "Limit orders, DCA, and perpetuals integrated",
      "Very low fees thanks to Solana's gas model",
      "Strong Solana-native tooling and UX",
    ],
    disadvantages: [
      "Inherits the safety profile of underlying Solana DEXes it routes through",
      "Solana network has experienced multi-hour outages",
      "MEV exists on Solana too despite different architecture",
      "No investor protection layer of its own",
    ],
  },

  /* ═══ #9 — Raydium ═══ */
  {
    rank: 9,
    name: "Raydium",
    score: 80,
    description:
      "Solana AMM that combines on-chain order books with traditional liquidity pools. Major venue for Solana memecoin launches.",
    featured: false,
    chain: "Solana",
    url: "https://raydium.io/",
    advantages: [
      "Hybrid order-book + AMM model for tight spreads",
      "Primary venue for Solana memecoin launches",
      "Permissionless pool creation",
      "Low fees on Solana",
    ],
    disadvantages: [
      "Permissionless pools mean very high rug-pull rate on memecoins",
      "Liquidity withdrawal is trivial — most launched tokens fail within days",
      "No vetting or quality filter on listed tokens",
      "Inherits Solana network risks",
    ],
  },

  /* ═══ #10 — Orca ═══ */
  {
    rank: 10,
    name: "Orca",
    score: 79,
    description:
      "Solana DEX focused on UX simplicity and concentrated liquidity (Whirlpools). Cleaner UX than competitors but smaller liquidity footprint.",
    featured: false,
    chain: "Solana",
    url: "https://www.orca.so/",
    advantages: [
      "Concentrated liquidity Whirlpools for capital efficiency",
      "Cleaner UX than most Solana DEX competitors",
      "Strong stablecoin and major-token liquidity",
      "Active developer support and integrations",
    ],
    disadvantages: [
      "Lower TVL than Raydium or Jupiter on Solana",
      "Liquidity thinner outside major pairs",
      "No investor protection or compensation system",
      "Inherits Solana network risks",
    ],
  },
];

/** Methodology disclosure shown in the UI for transparency. */
export const METHODOLOGY_NOTE =
  "Scores reflect INFI MultiChain's assessment of each ecosystem against the SbSe protocol design principles: transparency, manipulation resistance, liquidity sovereignty, and user compensation. They are not third-party audited scores. Rankings are editorial and updated as ecosystems evolve.";
