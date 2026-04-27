"use client";

export default function AlphaHero() {
  return (
    <section className="mb-8">
      <div
        className="flex items-center gap-3 label-xs mb-6 anim-fade-up"
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
        <span>Live Intelligence</span>
        <span style={{ color: "var(--fg-dim)" }}>/</span>
        <span>Whales &amp; Signals</span>
        <span style={{ color: "var(--fg-dim)" }}>/</span>
        <span>AI Predictions</span>
      </div>

      <h1
        className="anim-fade-up tracking-tight"
        style={{
          fontSize: "clamp(32px, 5vw, 56px)",
          fontWeight: 700,
          lineHeight: 1.0,
          letterSpacing: "-0.03em",
          marginBottom: "20px",
        }}
      >
        <span className="text-gradient block">Find market signals</span>
        <span className="text-gradient-accent block" style={{ animationDelay: "0.08s" }}>
          before they become news.
        </span>
      </h1>

      <p
        className="anim-fade-up leading-relaxed max-w-2xl"
        style={{
          fontSize: "17px",
          color: "var(--fg-muted)",
          animationDelay: "0.15s",
        }}
      >
        Beyond contract scanning — track whale wallets, regulatory filings, social
        signals, and the entire INFI MultiChain ecosystem. Every signal scored
        for impact, every prediction backed by reasoning.
      </p>
    </section>
  );
}
