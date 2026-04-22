"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "sbse.recent.scans";
const MAX = 6;

export interface RecentScan {
  address: string;
  project: string;
  chain: string;
  grade: string;
  verdict: string;
  scannedAt: string;
}

export function addRecentScan(scan: RecentScan) {
  if (typeof window === "undefined") return;
  try {
    const existing = readRecentScans();
    const deduped = existing.filter(
      (s) => s.address.toLowerCase() !== scan.address.toLowerCase(),
    );
    const next = [scan, ...deduped].slice(0, MAX);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    /* Custom event lets sibling components react in real time. */
    window.dispatchEvent(new CustomEvent("sbse:recent-scans-updated"));
  } catch {
    /* storage disabled; ignore */
  }
}

export function readRecentScans(): RecentScan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function RecentScans({
  onSelect,
}: {
  onSelect: (address: string) => void;
}) {
  const [items, setItems] = useState<RecentScan[]>([]);

  useEffect(() => {
    setItems(readRecentScans());
    const handler = () => setItems(readRecentScans());
    window.addEventListener("sbse:recent-scans-updated", handler);
    return () => window.removeEventListener("sbse:recent-scans-updated", handler);
  }, []);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="recent-label" className="mt-6">
      <div
        id="recent-label"
        className="font-mono text-[10px] tracking-[0.3em] uppercase mb-3"
        style={{ color: "var(--fg-dim)" }}
      >
        Recent scans
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.address}
            onClick={() => onSelect(item.address)}
            className="group flex items-center gap-3 rounded-full border px-4 py-2 text-left transition-all hover:bg-white/5"
            style={{ borderColor: "var(--border)" }}
            title={`${item.project} — ${item.chain}`}
          >
            <span
              className="font-display italic text-sm"
              style={{ color: "var(--amber)" }}
            >
              {item.grade}
            </span>
            <span className="text-xs truncate max-w-[160px]"
                  style={{ color: "var(--fg-muted)" }}>
              {item.project || shortAddr(item.address)}
            </span>
            <span className="font-mono text-[10px]" style={{ color: "var(--fg-dim)" }}>
              {item.chain}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
