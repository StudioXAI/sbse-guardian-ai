"use client";

import { useEffect, useRef, useState } from "react";
import ScannerHero from "@/components/ScannerHero";
import ScanProgress from "@/components/ScanProgress";
import AuditReportView from "@/components/AuditReportView";
import RecentScans, { addRecentScan } from "@/components/RecentScans";
import type { AuditReport, AuditApiResponse } from "@/lib/types";
import { CONTRACT_REGEX } from "@/lib/constants";

type Mode = "empty" | "scanning" | "done";

export default function Home() {
  const [contractAddress, setContractAddress] = useState("");
  const [result, setResult] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mode: Mode = loading ? "scanning" : result ? "done" : "empty";

  /* ⌘K / Ctrl+K to focus the input. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isSlash = e.key === "/" && !(e.target as HTMLElement)?.matches?.("input, textarea");
      if (isModK || isSlash) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const runScan = async (addrParam?: string) => {
    const addr = (addrParam ?? contractAddress).trim();
    setError(null);

    if (!addr) {
      setError("Enter a contract address to scan.");
      return;
    }
    if (!CONTRACT_REGEX.test(addr)) {
      setError("That doesn't look like a valid 0x address.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractAddress: addr }),
      });

      const data: AuditApiResponse = await res.json().catch(() => ({
        success: false,
        message: "Invalid response from server.",
      }));

      if (!res.ok || !("success" in data) || data.success !== true) {
        const msg = "message" in data && data.message ? data.message : `Scan failed (HTTP ${res.status}).`;
        setError(msg);
        return;
      }

      setResult(data);
      addRecentScan({
        address: data.contractAddress,
        project: data.project,
        chain: data.chain,
        grade: data.grade,
        verdict: data.verdict.label,
        scannedAt: data.scannedAt,
      });
    } catch (e) {
      setError("Couldn't reach the Guardian API. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setContractAddress("");
    /* Give React a tick to unmount the report before focusing */
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleRecentSelect = (address: string) => {
    setContractAddress(address);
    runScan(address);
  };

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav
        className="sticky top-0 z-50 backdrop-blur-xl border-b"
        style={{
          background: "rgba(10,8,7,0.75)",
          borderColor: "var(--border)",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="h-7 w-7 rounded-lg flex items-center justify-center relative"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-soft))",
                color: "#fff",
                boxShadow: "0 0 16px rgba(108,99,255,0.35)",
              }}
              aria-hidden
            >
              <span className="text-sm leading-none font-semibold">S</span>
            </div>
            <span className="font-mono text-sm tracking-[0.1em]" style={{ color: "var(--fg)" }}>
              SbSe <span style={{ color: "var(--fg-muted)" }}>Guardian</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-6 font-mono text-[10px] tracking-[0.3em] uppercase"
               style={{ color: "var(--fg-dim)" }}>
            <span>Mainnet</span>
            <span
              className="inline-flex items-center gap-2"
              style={{ color: "var(--success)" }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: "var(--success)",
                  boxShadow: "0 0 8px rgba(74,222,128,0.6), 0 0 14px rgba(74,222,128,0.3)",
                  animation: "pulse 2s ease-in-out infinite",
                }}
              />
              Online
            </span>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12 md:py-20">
        {mode === "empty" && (
          <>
            <ScannerHero
              ref={inputRef}
              value={contractAddress}
              onChange={setContractAddress}
              onSubmit={() => runScan()}
              loading={loading}
              error={error}
            />
            <RecentScans onSelect={handleRecentSelect} />
          </>
        )}

        {mode === "scanning" && (
          <div className="max-w-3xl mx-auto pt-8">
            <ScanProgress />
          </div>
        )}

        {mode === "done" && result && (
          <AuditReportView report={result} onScanAnother={reset} />
        )}
      </div>

      {/* Footer */}
      <footer className="mt-20 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase"
             style={{ color: "var(--fg-dim)" }}>
            SbSe Guardian · Smart Contract Intelligence
          </p>
          <p className="text-xs" style={{ color: "var(--fg-dim)" }}>
            Automated analysis is a signal, not a guarantee. Always DYOR.
          </p>
        </div>
      </footer>
    </main>
  );
}
