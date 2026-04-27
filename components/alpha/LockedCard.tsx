"use client";

interface Props {
  title: string;
  description: string;
  onUpgrade: () => void;
}

export default function LockedCard({ title, description, onUpgrade }: Props) {
  return (
    <div
      className="card p-8 text-center"
      style={{ borderLeft: "3px solid var(--accent)" }}
    >
      <div
        className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
        style={{ background: "var(--accent-dim)", color: "var(--accent-soft)" }}
        aria-hidden
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="11" x="3" y="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <div className="label-xs mb-2" style={{ color: "var(--accent-soft)" }}>
        Premium section
      </div>
      <h2
        className="font-medium tracking-tight mb-3"
        style={{
          fontSize: "20px",
          color: "var(--fg)",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>
      <p
        className="text-[13px] mb-5 max-w-md mx-auto"
        style={{ color: "var(--fg-muted)" }}
      >
        {description}
      </p>
      <button
        type="button"
        onClick={onUpgrade}
        className="px-5 py-2.5 rounded-md"
        style={{
          background: "var(--accent)",
          color: "#fff",
          fontSize: "13px",
          fontWeight: 500,
          border: "none",
          cursor: "pointer",
          boxShadow: "0 0 24px rgba(108,99,255,0.25)",
        }}
      >
        Upgrade →
      </button>
    </div>
  );
}
