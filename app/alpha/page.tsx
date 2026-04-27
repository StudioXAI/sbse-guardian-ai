"use client";

/* ─────────────────────────────────────────────────────────────
   Alpha page wrapper — defers the AppKit-using inner component
   until after client mount so Vercel's prerender pass never
   touches AppKit hooks (which throw before createAppKit runs).
   ───────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import SiteNav from "@/components/SiteNav";
import AlphaPageContent from "@/components/alpha/AlphaPageContent";

export default function AlphaPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className="min-h-screen">
        <SiteNav active="alpha" />
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          <p
            className="font-mono"
            style={{
              color: "var(--fg-dim)",
              fontSize: "11px",
              letterSpacing: "0.1em",
            }}
          >
            LOADING ALPHA…
          </p>
        </div>
      </main>
    );
  }

  return <AlphaPageContent />;
}
