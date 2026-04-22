"use client";

import { useState } from "react";
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

              <p>
                <strong>SbSe Score:</strong> {result.sbseScore}+
              </p>

              <div className="mt-4">
                <strong>Findings:</strong>

                <ul className="list-disc ml-6 mt-2">
                  {result.findings?.map((item: string, index: number) => (
                    <li key={index}>{item}</li>
                  ))}
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