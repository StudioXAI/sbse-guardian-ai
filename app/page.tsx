"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
      console.error(error);
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <nav className="w-full border-b border-white/10 bg-black/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">SbSe Guardian AI</h1>
            <p className="text-xs text-white/60">
              Smart Contract Auditor Agent
            </p>
          </div>

          <button className="px-5 py-2 rounded-xl bg-white text-black font-medium">
            Launch App
          </button>
        </div>
      </nav>

      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20">
        <h2 className="text-5xl font-bold">
          Don’t Audit Code. Ask the Agent.
        </h2>

        <p className="mt-6 text-white/70 max-w-2xl">
          Analyze any smart contract across any chain.
        </p>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-8">
          <h3 className="text-3xl font-bold mb-4">
            Analyze Any Smart Contract
          </h3>

          <input
            type="text"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            placeholder="Paste contract address..."
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none"
          />

          <button
            onClick={handleScan}
            className="mt-4 px-6 py-4 rounded-2xl bg-white text-black font-semibold"
          >
            {loading ? "Scanning..." : "Scan Contract"}
          </button>

          {result && (
            <div className="mt-8 rounded-2xl border border-white/10 p-6">
              <h4 className="text-2xl font-bold mb-4">
                Audit Report
              </h4>

              <p>
                <strong>Project:</strong> {result.project}
              </p>

              <p>
                <strong>Risk Score:</strong> {result.riskScore}/10
              </p>

              {/* ONLY show shield if verified */}
              {result.isSbSeVerified && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="mt-6 rounded-3xl border border-green-400/30 bg-green-500/5 p-6 backdrop-blur-xl shadow-[0_0_40px_rgba(34,197,94,0.08)]"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-4xl">
                      🛡
                    </div>

                    <div>
                      <h3 className="text-2xl font-bold text-green-400">
                        SbSe Shield Active
                      </h3>

                      <p className="text-white/70 mt-1">
                        Protected by SbSe Protocol
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-sm text-white/60">
                        Verification Status
                      </p>

                      <p className="text-white font-semibold mt-1">
                        Verified Launchpad Project
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-sm text-white/60">
                        SbSe Score
                      </p>

                      <p className="text-green-400 font-bold text-xl mt-1">
                        {result.sbseScore}+
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-white/70">
                    Enhanced Investor Protection Enabled
                  </p>
                </motion.div>
              )}

              {/* Optional warning for non-verified projects */}
              {!result.isSbSeVerified && (
                <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-yellow-500/5 p-5">
                  <p className="text-yellow-300 font-semibold">
                    ⚠ This project is not currently verified by SbSe Protocol
                  </p>

                  <p className="text-white/60 mt-2 text-sm">
                    This token is not listed on INFI MultiChain CDEX or the
                    INFI Launchpad. Always perform additional due diligence.
                  </p>
                </div>
              )}

              <div className="mt-6">
                <strong>Findings:</strong>

                <ul className="list-disc ml-6 mt-2">
                  {result.findings?.map(
                    (item: string, index: number) => (
                      <li key={index}>{item}</li>
                    )
                  )}
                </ul>
              </div>

              <p className="mt-4 text-white/70">
                {result.beginnerExplanation}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Professional Visual Dashboard */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <AuditVisualDashboard />
      </section>
    </main>
  );
}