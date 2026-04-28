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
import AssistantWidget from "@/components/alpha/AssistantWidget";

interface AccessApiResponse {
  success: boolean;
  data?: AccessStatus;
}

export default function AlphaPageContent() {
  const [section, setSection] = useState<AlphaSection>("overview");
  const [status, setStatus] = useState<AccessStatus | null>(null);
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

  /* Two simple states:
     - Not connected: prompt to connect
     - Connected: every section is fully accessible */
  const showSection = isConnected && status?.state === "open";

  return (
    <main className="min-h-screen">
      <SiteNav active="alpha" />

      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        <AlphaHero />

        <div className="mb-5">
          <AccessBanner status={status} />
        </div>

        <div className="mb-6">
          <AlphaSubNav active={section} onChange={setSection} />
        </div>

        {/* Disconnected — prompt to connect */}
        {!showSection && (
          <div
            className="card p-8 text-center"
            style={{ borderLeft: "3px solid var(--accent)" }}
          >
            <p className="text-sm" style={{ color: "var(--fg-dim)" }}>
              Connect your wallet above to access Alpha. Everything below is
              free for everyone — the wallet is only used for non-custodial
              authentication.
            </p>
          </div>
        )}

        {/* All sections — fully unlocked */}
        {showSection && (
          <>
            {section === "overview" && (
              <OverviewSection onNavigate={(s) => setSection(s)} />
            )}
            {section === "signals" && <SignalsSection />}
            {section === "predictions" && <PredictionsSection />}
            {section === "liquidity" && <LiquiditySection />}
            {section === "whales" && <WhalesSection />}
            {section === "polymarket" && <PolymarketSection />}
            {section === "infi" && <InfiSection />}
            {section === "social" && <SocialSection />}
          </>
        )}
      </div>

      {/* Floating AI assistant — context-aware per section */}
      <AssistantWidget section={section} />

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
            Information aggregated from public market data. Not financial
            advice. Non-custodial — no execution, no custody, no KYC.
          </p>
        </div>
      </footer>
    </main>
  );
}
