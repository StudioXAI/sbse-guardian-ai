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
  {
    label: "USDC",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  },
  {
    label: "WETH",
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  },
  {
    label: "UNI",
    address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
  },
];

const ScannerHero = forwardRef<HTMLInputElement, ScannerHeroProps>(
  function ScannerHero(
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
        {/* Top signal line */}
        <div
          className="flex items-center gap-3 label-xs mb-8 anim-fade-up"
          style={{ color: "var(--fg-muted)" }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--accent)",
              animation: "pulse 2.2s ease-in-out infinite",
              boxShadow: "0 0 12px var(--accent-glow)",
            }}
          />
          <span>35+ EVM Chains</span>
          <span style={{ color: "var(--fg-dim)" }}>/</span>
          <span>Real-time</span>
          <span style={{ color: "var(--fg-dim)" }}>/</span>
          <span>AI-Powered</span>
        </div>

        {/* Hero headline */}
        <h1
          className="anim-fade-up tracking-tight"
          style={{
            fontSize: "clamp(42px, 7vw, 88px)",
            fontWeight: 700,
            lineHeight: 0.98,
            letterSpacing: "-0.04em",
            marginBottom: "32px",
          }}
        >
          <span className="text-gradient block">Don&rsquo;t audit code.</span>
          <span
            className="text-gradient-accent block"
            style={{ animationDelay: "0.08s" }}
          >
            Ask the agent.
          </span>
        </h1>

        <p
          className="anim-fade-up leading-relaxed max-w-2xl mb-12"
          style={{
            fontSize: "19px",
            color: "var(--fg-muted)",
            animationDelay: "0.15s",
          }}
        >
          Paste any contract address. Our AI analyst returns a plain-English
          verdict backed by nine layers of on-chain intelligence — across
          Ethereum, Base, Arbitrum, Polygon, BSC, Optimism and{" "}
          <span style={{ color: "var(--fg)" }}>30+ other EVM chains</span>.
        </p>

        {/* Scanner card */}
        <div
          className="card card-glow anim-fade-up"
          style={{
            padding: "28px 32px",
            animationDelay: "0.25s",
          }}
        >
          <label
            htmlFor="contract-input"
            className="block label-xs mb-3"
            style={{ color: "var(--fg-dim)" }}
          >
            Contract Address
            <span
              className="ml-3 hidden md:inline"
              style={{ opacity: 0.7 }}
            >
              ⌘K to focus · Enter to scan
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
              className="flex-1 rounded-lg border px-4 py-3 font-mono outline-none transition-colors"
              style={{
                background: "var(--bg)",
                borderColor: error ? "var(--danger)" : "var(--border-strong)",
                color: "var(--fg)",
                fontSize: "15px",
              }}
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading || !value.trim()}
              className="px-7 py-3 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
              style={{
                background: "var(--accent)",
                color: "#fff",
                fontWeight: 500,
                fontSize: "14px",
                whiteSpace: "nowrap",
                boxShadow: "0 0 20px rgba(108,99,255,0.25)",
              }}
            >
              {loading ? "Scanning…" : "Run scan →"}
            </button>
          </div>

          {error && (
            <div
              id="contract-error"
              role="alert"
              className="mt-3 text-sm"
              style={{ color: "var(--danger)" }}
            >
              {error}
            </div>
          )}

          {/* Examples */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span
              className="label-xs mr-1"
              style={{ color: "var(--fg-dim)" }}
            >
              Try
            </span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.address}
                type="button"
                onClick={() => onChange(ex.address)}
                className="text-xs rounded-lg px-3 py-1.5 border transition-all hover:brightness-110"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-subtle)",
                  color: "var(--fg-muted)",
                  fontSize: "12px",
                }}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  },
);

export default ScannerHero;
