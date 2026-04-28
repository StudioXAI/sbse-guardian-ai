"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const AlphaPageContent = dynamic(
  () => import("@/components/alpha/AlphaPageContent"),
  { ssr: false },
);

export default function AlphaPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <main className="min-h-screen">
        <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
          <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
            Loading Alpha…
          </div>
        </div>
      </main>
    );
  }

  return <AlphaPageContent />;
}
