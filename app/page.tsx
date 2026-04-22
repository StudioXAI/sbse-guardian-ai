"use client";

import { useState } from "react";
import InstitutionalAuditDashboardV2 from "@/components/InstitutionalAuditDashboardV2";
import AuditVisualDashboard from "@/components/AuditVisualDashboard";

export default function Home() {
  const [contractAddress, setContractAddress] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleScan = async () => {
    if (!contractAddress) return;

    setLoading(true);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contractAddress,
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch (error) {
      console.error("Scan failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      {/* NAVBAR */}
      <nav className="w-full border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              SbSe Guardian AI
            </h1>
            <p className="text-xs text-white/60">
              Smart Contract Auditor Agent
            </p>
          </div>

          <button className="px-5 py-2 rounded-xl bg-white text-black font-medium">
            Launch App
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20">
        <h2 className="text-5xl md:text-6xl font-bold leading-tight">
          Don’t Audit Code.
          <br />
          Ask the Agent.
        </h2>

        <p className="mt-6 text-white/70 max-w-2xl text-lg">
          Analyze any smart contract across any chain with
          institutional-grade security intelligence powered
          by the SbSe Protocol.
        </p>
      </section>

      {/* SCANNER */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          <h3 className="text-3xl font-bold mb-4">
            Analyze Any Smart Contract
          </h3>

          <input
            type="text"
            value={contractAddress}
            onChange={(e) =>
              setContractAddress(e.target.value)
            }
            placeholder="Paste contract address..."
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none focus:border-white/30"
          />

          <button
            onClick={handleScan}
            disabled={loading}
            className="mt-4 px-6 py-4 rounded-2xl bg-white text-black font-semibold transition hover:scale-[1.02] disabled:opacity-60"
          >
            {loading ? "Scanning..." : "Scan Contract"}
          </button>
        </div>
      </section>

      {/* DYNAMIC INSTITUTIONAL DASHBOARD */}
      {result && (
        <section className="max-w-7xl mx-auto px-6 pb-24">
          <InstitutionalAuditDashboardV2 report={result} />
        </section>
      )}

      {/* PREMIUM VISUAL DASHBOARD — NOW FULLY DYNAMIC */}
      {result && (
        <section className="max-w-7xl mx-auto px-6 pb-24">
          <AuditVisualDashboard report={result} />
        </section>
      )}
    </main>
  );
}