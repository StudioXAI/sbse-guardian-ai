"use client";

import Link from "next/link";
import InfiLogo from "./InfiLogo";

interface SiteNavProps {
  /** Which tab is currently active. */
  active: "scanner" | "alpha" | "watchlist";
}

const TABS: Array<{ id: SiteNavProps["active"]; label: string; href: string; isNew?: boolean }> = [
  { id: "scanner", label: "Scanner", href: "/" },
  { id: "alpha", label: "SbSe Guardian Alpha", href: "/alpha", isNew: true },
];

/**
 * Shared top navigation across the whole site.
 * Adds a tab strip while keeping the existing brand mark and status pill.
 */
export default function SiteNav({ active }: SiteNavProps) {
  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-xl border-b"
      style={{
        background: "rgba(10,8,7,0.75)",
        borderColor: "var(--border)",
      }}
    >
      {/* Powered-by attribution — sits at the very top of every page */}
      <div
        className="border-b"
        style={{
          background: "rgba(0,0,0,0.25)",
          borderColor: "var(--border)",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-1.5 flex items-center justify-center gap-2">
          <InfiLogo size={16} />
          <span
            className="font-mono text-[10px] tracking-[0.15em] uppercase"
            style={{ color: "var(--fg-dim)" }}
          >
            Powered by{" "}
            <span style={{ color: "var(--fg-muted)" }}>
              INFI MultiChain Ecosystem
            </span>
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6">
        {/* Top row: brand + status */}
        <div className="py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
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
            <span
              className="font-mono text-sm tracking-[0.1em]"
              style={{ color: "var(--fg)" }}
            >
              SbSe <span style={{ color: "var(--fg-muted)" }}>Guardian</span>
            </span>
          </Link>

          <div
            className="hidden md:flex items-center gap-6 font-mono text-[10px] tracking-[0.3em] uppercase"
            style={{ color: "var(--fg-dim)" }}
          >
            <span>Mainnet</span>
            <span
              className="inline-flex items-center gap-2"
              style={{ color: "var(--success)" }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: "var(--success)",
                  boxShadow:
                    "0 0 8px rgba(74,222,128,0.6), 0 0 14px rgba(74,222,128,0.3)",
                  animation: "pulse 2s ease-in-out infinite",
                }}
              />
              Online
            </span>
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex items-center gap-1 -mb-px overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const isActive = tab.id === active;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className="relative px-4 py-3 text-sm transition-colors flex items-center gap-2 whitespace-nowrap font-mono tracking-[0.05em]"
                style={{
                  color: isActive ? "var(--fg)" : "var(--fg-dim)",
                  borderBottom: isActive
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                  fontSize: "12px",
                }}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.label}
                {tab.isNew && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full font-mono tracking-[0.05em]"
                    style={{
                      background: "var(--accent-dim)",
                      color: "var(--accent-soft)",
                      border: "1px solid var(--border-accent)",
                    }}
                  >
                    NEW
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
