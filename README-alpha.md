# SbSe Guardian Alpha — Integration Guide

Adds the **SbSe Guardian Alpha** tab to your existing `sbse-guardian-ai` site as a market intelligence layer. Smart Contract Scanner is preserved exactly as it is.

---

## Three public tiers + silent owner access

| Tier | Cost | Access |
| --- | --- | --- |
| **Free** | $0, no payment | 3 most-recent signals (1h delay), AI summary, INFI tracking, social channel links, read-only Overview |
| **Trader** | $29 / 30 days ($278/yr) | Real-time signals, multi-asset predictions, whale tracker, Polymarket, full liquidity map (DefiLlama + Order Book + Coinglass + TradingView), 5 Telegram alerts/day |
| **Pro** | $79 / 30 days ($758/yr) | Everything in Trader + 25 custom whale wallets, 10K API calls/day, Slack & Email integrations, competitor tracking, priority support, 3 team seats |

**Silent owner access:** the wallet matching `PAYMENT_RECEIVER_WALLET` is internally mapped to a Pro plan with a far-future expiration. The API and the UI render this state **identically to a paid Pro user** — no "OWNER" labels, no "FREE" labels, no "UNLIMITED" labels anywhere in the bundle. The receiver's privilege is not observable to other users; they only see Free / Trader / Pro tiers exist.

**Payment:** dual-rail USDC/USDT across Ethereum, BSC, Polygon, Base, Arbitrum, Optimism — using your existing `lib/verifyPayment.ts` infrastructure. No card. No auto-renewal. After 30 days the user re-pays.

---

## Free tier — what's included

When a wallet connects without a paid plan, they see Alpha in **limited preview mode**:

- **Overview:** 3 stats visible (signals, ecosystem health), 3 stats locked with upgrade prompt (threats, wallets, whales). Quick-action buttons for premium sections lead to the upgrade modal.
- **Signals:** 3 most-recent market signals + 3 most-recent INFI signals, filtered to events that happened ≥ 1 hour ago. Banner explains the delay.
- **Predictions:** AI summary text only. Per-asset cards and multi-timeframe BTC are paid-only.
- **Liquidity:** Locked. Tap shows upgrade modal.
- **Whales:** Locked.
- **Polymarket:** Locked.
- **INFI:** Full access (status info, public).
- **Social:** Full access (just public profile links).

Premium sections render a `LockedCard` component with a clear description and upgrade button — no fake teaser data behind the lock.

---

## Live data sources — every section is real

| Section | Source | Free? | Auth |
| --- | --- | --- | --- |
| **Predictions** | Anthropic Claude grounded with real CoinGecko spot prices | ✅ | uses your existing keys |
| **Liquidity → DefiLlama** | `api.llama.fi` — DeFi TVL + flows | ✅ free, no auth | none |
| **Liquidity → Order Book** | Binance public REST API — Bookmap-style depth | ✅ free, no auth | none |
| **Liquidity → Coinglass** | Liquidations, OI, funding rates | ✅ free tier | optional `COINGLASS_API_KEY` |
| **Liquidity → TradingView** | Free embedded chart widget (Pine Scripts open inside TradingView itself) | ✅ free | none |
| **Polymarket** | `clob.polymarket.com` real-money prediction markets | ✅ free | none |
| **Whales** | Etherscan large-tx queries on tracked exchange wallets | ✅ uses existing key | `ETHERSCAN_API_KEY` |
| **Signals** | Composed from whales + Polymarket + DefiLlama + INFI | ✅ transitive | (the above) |
| **INFI** | INFI Launchpad API + status tiers (InvertX upcoming Q2–Q3 2026, INFI Decentralized Blockchain in concept stage) | ✅ free | none |
| **Social → X** | X API v2 fetches `@INFI_MultiChain` if token configured, otherwise tap-to-open card | ⚠️ paid X tier optional | optional `X_BEARER_TOKEN` |
| **Social → LinkedIn** | Tap-to-open card to `https://www.linkedin.com/company/infi-multichain-cdex/` (no public API exists) | ⚠️ link-only | impossible |

**Zero fake data.** When a service is unavailable, the affected section returns empty or shows a clear unavailable state — never fabricated content.

---

## Files added or modified

**45 files total: 44 new, 1 modified.**

Key additions:
- `app/page.tsx` — modified (only swaps inline nav for `<SiteNav />`, scan flow untouched)
- `app/alpha/page.tsx` — new (free-mode + paywall logic)
- `app/api/alpha/access/route.ts` — new (returns plan/expired/free/none)
- `app/api/alpha/coinglass/route.ts` — new (live, with config prompt fallback)
- `app/api/alpha/liquidity/route.ts` — new (DefiLlama live)
- `app/api/alpha/orderbook/route.ts` — new (Binance order book live)
- `app/api/alpha/overview/route.ts` — new
- `app/api/alpha/plan/route.ts` — new (verifies USDC/USDT payment via existing infrastructure)
- `app/api/alpha/polymarket/route.ts` — new (live)
- `app/api/alpha/predict/route.ts` — new (AI grounded with CoinGecko)
- `app/api/alpha/signals/route.ts` — new (real-data only)
- `app/api/alpha/social/route.ts` — new
- `app/api/alpha/whales/route.ts` — new (Etherscan live)
- `components/SiteNav.tsx` — new
- `components/alpha/AccessBanner.tsx` — public tiers only, no owner-specific UI
- `components/alpha/AlphaHero.tsx`, `AlphaSubNav.tsx`, `DirectionBadge.tsx`, `SignalRow.tsx`, `PredictionCard.tsx` — new primitives
- `components/alpha/OverviewSection.tsx`, `SignalsSection.tsx`, `PredictionsSection.tsx` — free-mode aware
- `components/alpha/LiquiditySection.tsx` — 4 sub-tabs (DefiLlama, Order Book, Coinglass, TradingView)
- `components/alpha/OrderBookDepth.tsx`, `CoinglassPanel.tsx`, `TradingViewWidget.tsx` — new
- `components/alpha/WhalesSection.tsx`, `PolymarketSection.tsx`, `InfiSection.tsx`, `SocialSection.tsx` — new
- `components/alpha/LockedCard.tsx` — new (paywall card for premium sections)
- `components/alpha/PlanSelector.tsx` — shows Free + Trader + Pro
- `lib/alpha/accessStore.ts` — new (silent owner mapping + Free tier handling)
- `lib/alpha/cache.ts`, `client.ts`, `format.ts`, `types.ts` — primitives
- `lib/alpha/coinglassClient.ts`, `liquidityClient.ts`, `orderbookClient.ts`, `polymarketClient.ts`, `whaleTracker.ts`, `marketPrices.ts`, `socialFetcher.ts` — live data clients
- `lib/alpha/predictEngine.ts` — AI predictions
- `lib/alpha/signalEngine.ts` — composes real sources

---

## Environment variables

All existing env vars are reused. Two **optional** new variables enable additional integrations:

```
X_BEARER_TOKEN=<your X API v2 bearer token>     ← optional, enables live X feed
COINGLASS_API_KEY=<your Coinglass v3 API key>   ← optional, enables Coinglass tab
```

Without either, the affected section gracefully shows a configuration prompt with a direct link to register. **No fake data is ever shown when a service isn't configured.**

The receiver-wallet detection uses your existing `PAYMENT_RECEIVER_WALLET` env var — no new variable needed.

---

## INFI ecosystem status

🟢 **Live now** — INFI Launchpad, Accelerator Programme (Alex Nasybullin & CEO Laszlo Kellner), SbSe Protocol governance

🟡 **Upcoming · Q2–Q3 2026** — InvertX (decentralized liquidity engine, design final, build in progress)

🔵 **Concept stage · no launch date** — INFI Decentralized Blockchain (architecture exploration, no testnet, no committed timeline)

Plus official channel links: `@INFI_MultiChain` on X and INFI MultiChain CDEX on LinkedIn.

---

## Caching

All API routes use in-memory TTL caches matching your existing `lib/aiSummary.ts` pattern:

- Liquidity (DefiLlama): 5 minutes
- Order book (Binance): 5 seconds (refreshes every 5s in UI)
- Coinglass: 60 seconds
- Whales: 90 seconds
- Polymarket: 5 minutes
- Predictions: 5 minutes
- Market prices (CoinGecko): 60 seconds
- Social: 10 minutes
- Signals: 60 seconds

Plan store is in-memory; swap for Vercel KV at scale.

---

## Deploy

```bash
cd /path/to/sbse-guardian-ai
unzip sbse-guardian-alpha.zip
git checkout -b feat/alpha
git add app/page.tsx app/alpha app/api/alpha components/SiteNav.tsx components/alpha lib/alpha
git commit -m "feat: SbSe Guardian Alpha — Free + Trader + Pro tiers, live data"
git push -u origin feat/alpha
```

Open the PR, merge to `main`, Vercel auto-deploys in ~90 seconds.

---

## What's preserved

- Smart Contract Scanner page — only the inline nav is swapped for `<SiteNav />`. Scan flow untouched.
- All existing API routes untouched.
- All existing components and libs untouched.
- `globals.css` untouched. Alpha reuses your existing CSS variables.
- `package.json` untouched. No new dependencies.
- `lib/verifyPayment.ts` used as-is for plan payment verification.
- `RECEIVER_WALLET` (exported from `lib/verifyPayment.ts`) is the basis for silent owner-access detection.

---

## Cross-browser & cross-device

- Tab strips use `overflow-x: auto` — touch-friendly.
- Grids use `repeat(auto-fit, minmax(...))` — collapse cleanly on mobile.
- All buttons have proper ARIA roles for screen readers.
- All `useEffect` calls clean up on unmount.
- All API responses tolerate failure — pages render with `null` states + clear copy when an upstream is down.
- Plan modal is keyboard-dismissible with `role="dialog"` + `aria-modal`.
- TradingView iframe uses `loading="lazy"`.
- Order book auto-refresh interval is cleared on unmount.

---

## Removing Alpha

```
app/alpha/
app/api/alpha/
components/alpha/
components/SiteNav.tsx
lib/alpha/
```

Then revert `app/page.tsx` to the original.
