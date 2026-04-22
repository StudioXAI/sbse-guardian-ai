"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { label: "Detecting blockchain", duration: 1200 },
  { label: "Resolving token identity", duration: 1800 },
  { label: "Analyzing liquidity sources", duration: 1800 },
  { label: "Checking holder distribution", duration: 1500 },
  { label: "Verifying liquidity lock", duration: 1500 },
  { label: "Scanning for honeypots", duration: 1800 },
  { label: "Detecting wallet traps", duration: 1500 },
  { label: "Running rug-pull prediction", duration: 1500 },
  { label: "Compiling intelligence report", duration: 1200 },
];

export default function ScanProgress() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let idx = 0;

    const tick = () => {
      if (cancelled) return;
      if (idx >= STEPS.length - 1) {
        setCurrent(STEPS.length - 1);
        return;
      }
      idx += 1;
      setCurrent(idx);
      setTimeout(tick, STEPS[idx].duration);
    };

    const timeout = setTimeout(tick, STEPS[0].duration);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  return (
    <section
      className="rounded-[28px] border p-8 md:p-10 anim-fade-in"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-elevated)",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 mb-8">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: "var(--amber)", animation: "breathe 1.4s ease-in-out infinite" }}
        />
        <span
          className="font-mono text-xs tracking-[0.3em] uppercase"
          style={{ color: "var(--amber)" }}
        >
          Guardian agent working
        </span>
      </div>

      <p className="font-display italic text-3xl md:text-4xl leading-tight mb-10"
         style={{ color: "var(--fg)" }}>
        {STEPS[current]?.label}…
      </p>

      <ol className="space-y-3" role="list">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={step.label}
              className="flex items-center gap-4 transition-all"
              style={{ opacity: done || active ? 1 : 0.38 }}
            >
              <span
                className="shrink-0 h-5 w-5 rounded-full flex items-center justify-center font-mono text-[10px]"
                style={{
                  background: done
                    ? "var(--green)"
                    : active
                    ? "var(--amber)"
                    : "transparent",
                  borderWidth: done || active ? 0 : 1,
                  borderStyle: "solid",
                  borderColor: "var(--border-strong)",
                  color: "var(--bg)",
                  animation: active ? "pulse 1.4s ease-in-out infinite" : undefined,
                }}
              >
                {done ? "✓" : ""}
              </span>
              <span
                className="text-sm"
                style={{ color: active ? "var(--fg)" : "var(--fg-muted)" }}
              >
                {step.label}
              </span>
              {active && (
                <span className="ml-auto font-mono text-xs" style={{ color: "var(--amber)" }}>
                  running
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
