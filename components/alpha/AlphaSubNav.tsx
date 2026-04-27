"use client";

export type AlphaSection =
  | "overview"
  | "signals"
  | "predictions"
  | "liquidity"
  | "whales"
  | "polymarket"
  | "infi"
  | "social";

interface Props {
  active: AlphaSection;
  onChange: (s: AlphaSection) => void;
}

const SECTIONS: Array<{ id: AlphaSection; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "signals", label: "Signals" },
  { id: "predictions", label: "Predictions" },
  { id: "liquidity", label: "Liquidity" },
  { id: "whales", label: "Whales" },
  { id: "polymarket", label: "Polymarket" },
  { id: "infi", label: "INFI" },
  { id: "social", label: "Social" },
];

export default function AlphaSubNav({ active, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Alpha sections"
      className="flex items-center gap-1 -mb-px overflow-x-auto scrollbar-none border-b"
      style={{ borderColor: "var(--border)" }}
    >
      {SECTIONS.map((s) => {
        const isActive = s.id === active;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(s.id)}
            className="relative px-4 py-3 transition-colors whitespace-nowrap font-mono"
            style={{
              color: isActive ? "var(--fg)" : "var(--fg-dim)",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: "transparent",
            }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
