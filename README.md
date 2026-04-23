# SbSe Guardian

> Don't audit code. Ask the agent.

Multichain smart-contract intelligence across **Ethereum, BSC, Polygon, Base, Arbitrum, and Avalanche**. Paste a contract address and get back a plain-English verdict, a confidence score, an A–F grade, and nine layers of on-chain analysis — all in a few seconds.

Built on Next.js 16 + React 19 with native `fetch`, typed end-to-end, and zero heavyweight client dependencies.

---

## Quick start

```bash
cp .env.local.example .env.local   # fill in at least ETHERSCAN_API_KEY
npm install
npm run dev
```

Open <http://localhost:3000>.

---

## What's inside

### Intelligence layers

Every scan runs nine checks in parallel:

1. **Chain detection** — probes every supported chain's explorer and RPC to find where the contract lives.
2. **Token identity** — resolves name, symbol, market cap, website, issuer.
3. **SbSe Shield** — cross-references the live INFI MultiChain CDEX registry.
4. **Liquidity source** — DEX pair discovery via on-chain logic + DexScreener.
5. **Holder distribution** — top-holder concentration risk.
6. **Liquidity lock** — locker-signal detection in source + burn-address heuristics.
7. **Wallet traps** — concentration-based trap detection.
8. **Honeypot / owner / liquidity control** — bytecode-pattern analyzers with ethers.js.
9. **Rug-pull prediction** — heuristic scorer synthesizing the above signals.

### The verdict

The report is summarized into a single human-readable verdict card:

- **INSTITUTIONAL** — stablecoin or bluechip; bank-grade.
- **SAFE** — no major red flags.
- **CAUTION** — notable risk factors worth reviewing.
- **HIGH RISK** — do not interact without extreme caution.

Each verdict comes with a **plain-English sentence** explaining *why* — synthesized from the top two concerns discovered during the scan.

---

## Architecture

```
lib/
  constants.ts         ── single source of truth for token sets, regex, timeouts
  chainRegistry.ts     ── per-chain explorer + API key env mapping
  fetchHelpers.ts      ── fetchWithTimeout, explorerUrl(), rpcCall(), ChainInfo
  detectChain.ts       ── parallel chain-detection engine
  fetchTokenIdentity.ts
  checkHolderRisk.ts
  checkLiquiditySource.ts
  checkLiquidityLock.ts
  checkWalletTraps.ts
  fetchInfiProjects.ts ── 5-minute in-memory cache, stale-while-error fallback
  predictRugPull.ts
  rateLimit.ts         ── in-memory sliding window (15 req/min/ip)
  types.ts             ── shared AuditReport contract for frontend + backend
  analyzers/
    honeypotCheck.ts   ── ethers.js bytecode scan
    ownerCheck.ts
    liquidityCheck.ts
    riskScore.ts
    reportBuilder.ts

app/
  api/audit/route.ts   ── validated, rate-limited, parallel, typed
  layout.tsx
  globals.css          ── design tokens + animations (respects prefers-reduced-motion)
  page.tsx             ── state machine (empty → scanning → done)

components/
  ScannerHero.tsx      ── hero + input + example chips
  ScanProgress.tsx     ── step-by-step animated progress
  AuditReportView.tsx  ── unified report composer
  VerdictCard.tsx      ── the big plain-English answer
  MetricCards.tsx
  RiskDonut.tsx        ── accessible SVG donut (hand-rolled)
  SecurityRadar.tsx    ── accessible SVG radar (hand-rolled)
  FindingsList.tsx     ── severity-filtered findings
  RecentScans.tsx      ── localStorage-backed history
```

### Key principles

- **One source of truth.** Institutional token lists, regex, timeouts — all live in `lib/constants.ts`.
- **`ChainInfo` threaded everywhere.** No more hardcoded `api.etherscan.io` in analysis files.
- **Parallel by default.** Independent external calls run via `Promise.allSettled`.
- **Typed end-to-end.** `AuditReport` is shared between API and UI.
- **Graceful degradation.** Every external call has a timeout; failed sources reduce the confidence score but don't crash the scan.
- **Respect the user.** `prefers-reduced-motion`, keyboard shortcuts (⌘K, Enter, /), focus rings, ARIA labels, semantic HTML.

---

## Environment variables

See `.env.local.example` for the full list. The minimum useful setup is a single `ETHERSCAN_API_KEY` (it's used as a fallback for every chain). For production, supply per-chain keys (`BSCSCAN_API_KEY`, `POLYGONSCAN_API_KEY`, etc.) to avoid rate limits.

---

## Known caveats

- **Etherscan Pro endpoints.** `action=tokenholderlist` and `action=tokeninfo` are on Etherscan's Pro tier. On the free tier they return errors, which the analyzers handle gracefully by returning an "unable to fetch" finding. Upgrade to Pro if you need the holder concentration data to be real rather than graceful-fallback.
- **Rate limit is in-memory.** Fine for a single instance (Vercel preview, local dev). For multi-instance production, swap `lib/rateLimit.ts` for an Upstash/Redis-backed implementation.
- **Source-code keyword matching is still heuristic.** We use word boundaries to cut false positives (`mint` no longer matches `mintage`), but sophisticated obfuscation will beat it. Combine with a full static analyzer (Slither, Mythril) for production auditing.
- **Automated analysis is a signal, not a guarantee.** The verdict surfaces what we *can* see. A manual audit is still the gold standard for protocols holding serious value.

---

## Design decisions

The aesthetic is intentionally **editorial / intelligence-magazine** rather than generic dark-mode crypto:

- Warm near-black background (`#0a0807`) and cream text (`#f3eee8`) — easier on the eyes than pure #000/#fff.
- A single amber accent (`#f5a623`) — the detective's flashlight.
- **Fraunces** italic serif for display moments (headlines, verdicts, big numbers) — variable font with optical size and softness axes, distinctive without being precious.
- **Geist Sans** for body copy.
- **JetBrains Mono** for addresses, scores, labels, and any technical data.
- Film-grain SVG overlay across the whole app — keeps dark surfaces from feeling flat.

---

## Security note

If you forked this repo from the original zip, the previous `.env.local` contained a live API key. Rotate it at <https://etherscan.io/myapikey> before deploying anywhere public.

