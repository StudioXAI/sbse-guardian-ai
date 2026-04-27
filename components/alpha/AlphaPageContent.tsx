"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import SiteNav from "@/components/SiteNav";
import AlphaHero from "@/components/alpha/AlphaHero";
import AlphaSubNav, { type AlphaSection } from "@/components/alpha/AlphaSubNav";
import OverviewSection from "@/components/alpha/OverviewSection";
import SignalsSection from "@/components/alpha/SignalsSection";
import PredictionsSection from "@/components/alpha/PredictionsSection";
import LiquiditySection from "@/components/alpha/LiquiditySection";
import WhalesSection from "@/components/alpha/WhalesSection";
import PolymarketSection from "@/components/alpha/PolymarketSection";
import InfiSection from "@/components/alpha/InfiSection";
import SocialSection from "@/components/alpha/SocialSection";
import AccessBanner, { type AccessStatus } from "@/components/alpha/AccessBanner";
import LockedCard from "@/components/alpha/LockedCard";
import PlanSelector from "@/components/alpha/PlanSelector";

interface AccessApiResponse {
  success: boolean;
  data?: AccessStatus;
}

export default function AlphaPageContent() {
  const [section, setSection] = useState<AlphaSection>("overview");
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
  const { address, isConnected } = useAppKitAccount();

  const refreshStatus = useCallback(async () => {
    if (!address || !isConnected) {
      setStatus(null);
      return;
    }
    try {
      const res = await fetch(`/api/alpha/access?wallet=${address}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as AccessApiResponse;
      if (json.success && json.data) setStatus(json.data);
    } catch {
      /* keep last status */
    }
  }, [address, isConnected]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleSelectPlan = useCallback(
    async (tier: "trader" | "pro", billing: "monthly" | "annual") => {
      const planLabel = tier === "pro" ? "Pro" : "Trader";
      const billingLabel = billing === "annual" ? "annual" : "monthly";
      alert(
        `Selected: ${planLabel} (${billingLabel}).\n\n` +
          `Next step: complete a USDC or USDT payment from your connected wallet.\n` +
          `The on-chain payment activation flow uses the same infrastructure as the Scanner premium unlock.\n\n` +
          `(Implementation note: integrate with PremiumUnlock.tsx — pass tier='${tier}' billing='${billing}'.)`,
      );
      setPlanSelectorOpen(false);
    },
    [],
  );

  const openUpgrade = useCallback(() => setPlanSelectorOpen(true), []);

  /* Three high-level UI states:
     - Disconnected: show connect prompt
     - Free: show limited preview + locked premium sections
     - Plan/expired: show full sections (expired still allowed but with renew banner) */
  const isFree = status?.state === "free" || status?.state === "expired";
  const isPaid = status?.state === "plan";
  const showSection = isPaid || isFree;

  /* Sections locked for Free users. */
  const isLocked = (s: AlphaSection): boolean => {
    if (!isFree) return false;
    return s === "liquidity" || s === "whales" || s === "polymarket";
  };

  const sectionDescriptions: Record<AlphaSection, { title: string; desc: string }> = {
    overview: { title: "", desc: "" },
    signals: { title: "", desc: "" },
    predictions: { title: "", desc: "" },
    liquidity: {
      title: "Liquidity Map",
      desc: "DefiLlama TVL flows, real-time order book depth, Coinglass liquidations, and TradingView charts. Available on Trader and Pro plans.",
    },
    whales: {
      title: "Whale Tracker",
      desc: "Live $1M+ on-chain movements from tracked exchange wallets, with bullish/bearish direction inferred from flow context. Available on Trader and Pro plans.",
    },
    polymarket: {
      title: "Polymarket Consensus",
      desc: "Real-money prediction market consensus from clob.polymarket.com — strong signals when a market exceeds 65% YES with substantial volume. Available on Trader and Pro plans.",
    },
    infi: { title: "", desc: "" },
    social: { title: "", desc: "" },
  };

  return (
    <main className="min-h-screen">
      <SiteNav active="alpha" />

      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        <AlphaHero />

        <div className="mb-5">
          <AccessBanner status={status} onUpgrade={openUpgrade} />
        </div>

        <div className="mb-6">
          <AlphaSubNav active={section} onChange={setSection} />
        </div>

        {/* Disconnected — no sections */}
        {!showSection && status?.state !== "none" && (
          <div className="card p-8 text-center" style={{ borderLeft: "3px solid var(--accent)" }}>
            <p className="text-sm" style={{ color: "var(--fg-dim)" }}>
              Connect your wallet above to access Alpha.
            </p>
          </div>
        )}

        {/* Locked premium section for Free users */}
        {showSection && isLocked(section) && (
          <LockedCard
            title={sectionDescriptions[section].title}
            description={sectionDescriptions[section].desc}
            onUpgrade={openUpgrade}
          />
        )}

        {/* Allowed sections (Free + Paid) */}
        {showSection && !isLocked(section) && (
          <>
            {section === "overview" && (
              <OverviewSection
                freeMode={isFree}
                onNavigate={(s) => setSection(s)}
                onUpgrade={openUpgrade}
              />
            )}
            {section === "signals" && (
              <SignalsSection freeMode={isFree} onUpgrade={openUpgrade} />
            )}
            {section === "predictions" && (
              <PredictionsSection freeMode={isFree} onUpgrade={openUpgrade} />
            )}
            {section === "liquidity" && <LiquiditySection />}
            {section === "whales" && <WhalesSection />}
            {section === "polymarket" && <PolymarketSection />}
            {section === "infi" && <InfiSection />}
            {section === "social" && <SocialSection />}
          </>
        )}
      </div>

      <PlanSelector
        open={planSelectorOpen}
        onClose={() => setPlanSelectorOpen(false)}
        onSelect={handleSelectPlan}
      />

      <footer className="mt-20 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="SbSe Guardian" className="h-5 w-5 object-contain" />
            <p
              className="font-mono text-[10px] tracking-[0.3em] uppercase"
              style={{ color: "var(--fg-dim)" }}
            >
              SbSe Guardian · Alpha
            </p>
          </div>
          <p className="text-xs" style={{ color: "var(--fg-dim)" }}>
            Predictions are signals, not financial advice. Always DYOR.
          </p>
        </div>
      </footer>
    </main>
  );
}
