"use client";

import { forwardRef } from "react";

interface ScannerHeroProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  error?: string | null;
}

const EXAMPLES = [
  { label: "USDC (Ethereum)", address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  { label: "USDT (Ethereum)", address: "0xdac17f958d2ee523a2206206994597c13d831ec7" },
  { label: "DAI (Ethereum)",  address: "0x6b175474e89094c44da98b954eedeac495271d0f" },
];

const ScannerHero = forwardRef<HTMLInputElement, ScannerHeroProps>(function ScannerHero(
  { value, onChange, onSubmit, loading, error },
  inputRef,
) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !loading) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <section className="relative">
      {/* Tagline */}
      <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.35em] uppercase mb-6"
           style={{ color: "var(--fg-dim)" }}>
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--amber)", animation: "pulse 2.2s ease-in-out infinite" }}
        />
        <span>Multichain · Real-time · Institutional-grade</span>
      </div>

      {/* Hero headline */}
      <h1 className="font-display text-5xl md:text-7xl lg:text-[5.5rem] leading-[0.95] tracking-tight mb-8 anim-fade-up">
        <span style={{ color: "var(--fg)" }}>Don&rsquo;t audit code.</span>
        <br />
        <span className="italic" style={{ color: "var(--amber)" }}>Ask the agent.</span>
      </h1>

      <p className="text-lg md:text-xl leading-relaxed max-w-2xl mb-12 anim-fade-up"
         style={{ color: "var(--fg-muted)", animationDelay: "0.1s" }}>
        Paste any contract on Ethereum, BSC, Polygon, Base, Arbitrum, or
        Avalanche. The Guardian agent returns a plain-English verdict in
        seconds — backed by nine layers of on-chain intelligence.
      </p>

      {/* Scanner card */}
      <div
        className="rounded-[28px] border p-6 md:p-8 anim-fade-up"
        style={{
          borderColor: "var(--border-strong)",
          background: "var(--bg-elevated)",
          animationDelay: "0.2s",
        }}
      >
        <label
          htmlFor="contract-input"
          className="block font-mono text-[10px] tracking-[0.3em] uppercase mb-3"
          style={{ color: "var(--fg-dim)" }}
        >
          Contract Address
          <span className="ml-3 hidden md:inline" style={{ opacity: 0.7 }}>
            Press ⌘K to focus · Enter to scan
          </span>
        </label>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            ref={inputRef}
            id="contract-input"
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!!error}
            aria-describedby={error ? "contract-error" : undefined}
            className="flex-1 rounded-xl border px-5 py-4 font-mono text-base outline-none transition-colors"
            style={{
              background: "var(--bg)",
              borderColor: error ? "var(--red)" : "var(--border-strong)",
              color: "var(--fg)",
            }}
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading || !value.trim()}
            className="px-8 py-4 rounded-xl font-mono text-xs tracking-[0.2em] uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            style={{
              background: "var(--amber)",
              color: "var(--bg)",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Scanning…" : "Run scan"}
          </button>
        </div>

        {error && (
          <div
            id="contract-error"
            role="alert"
            className="mt-3 text-sm"
            style={{ color: "var(--red)" }}
          >
            {error}
          </div>
        )}

        {/* Example contracts */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase mr-1"
                style={{ color: "var(--fg-dim)" }}>
            Try
          </span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.address}
              type="button"
              onClick={() => onChange(ex.address)}
              className="text-xs rounded-full px-3 py-1.5 border transition-colors hover:bg-white/5"
              style={{
                borderColor: "var(--border)",
                color: "var(--fg-muted)",
              }}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
});

export default ScannerHero;
