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

  const pct = ((current + 1) / STEPS.length) * 100;

  return (
    <section
      className="card card-glow relative overflow-hidden anim-fade-in"
      style={{ padding: "40px 44px" }}
      aria-busy="true"
      aria-live="polite"
    >
      {/* Ambient orbit glow behind content */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-40%",
          right: "-20%",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(108,99,255,0.12), transparent 60%)",
          filter: "blur(40px)",
          animation: "orbit 8s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* Top pill — live indicator */}
      <div className="relative flex items-center justify-between flex-wrap gap-4 mb-8">
        <div className="inline-flex items-center gap-3">
          <span className="relative inline-flex">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: "var(--accent)",
                boxShadow:
                  "0 0 10px rgba(108,99,255,0.8), 0 0 20px rgba(108,99,255,0.4)",
              }}
            />
            <span
              className="absolute inset-0 inline-block h-2 w-2 rounded-full"
              style={{
                background: "var(--accent)",
                animation: "ping 1.6s cubic-bezier(0,0,0.2,1) infinite",
              }}
            />
          </span>
          <span
            className="font-mono text-[10px] tracking-[0.3em] uppercase"
            style={{ color: "var(--accent-soft)" }}
          >
            Guardian Agent Working
          </span>
        </div>

        {/* Percentage readout */}
        <div className="font-mono text-xs" style={{ color: "var(--fg-muted)" }}>
          <span style={{ color: "var(--success)" }}>
            {String(current + 1).padStart(2, "0")}
          </span>
          <span style={{ color: "var(--fg-dim)" }}> / </span>
          <span>{String(STEPS.length).padStart(2, "0")}</span>
        </div>
      </div>

      {/* Current step headline */}
      <div className="relative mb-8">
        <h2
          className="text-gradient tracking-tight"
          style={{
            fontSize: "clamp(28px, 4.5vw, 44px)",
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
          }}
        >
          {STEPS[current]?.label}
          <span
            style={{
              color: "var(--accent)",
              animation: "blink 1s steps(2) infinite",
            }}
          >
            …
          </span>
        </h2>
      </div>

      {/* Progress bar */}
      <div
        className="relative mb-10 rounded-full overflow-hidden"
        style={{
          height: "3px",
          background: "var(--border)",
        }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(90deg, var(--accent), var(--success))",
            boxShadow: "0 0 12px rgba(108,99,255,0.6)",
            transition: "width 0.5s var(--ease)",
          }}
        />
        {/* Shimmer glint */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: "100%",
            width: "80px",
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
            animation: "glint 2s linear infinite",
          }}
        />
      </div>

      {/* Steps list */}
      <ol className="space-y-2.5 relative" role="list">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          const pending = i > current;

          return (
            <li
              key={step.label}
              className="flex items-center gap-4 transition-all duration-300"
              style={{
                opacity: pending ? 0.35 : 1,
              }}
            >
              {/* Indicator */}
              <span
                className="relative shrink-0 h-5 w-5 rounded-full flex items-center justify-center"
                style={{
                  background: done
                    ? "var(--success)"
                    : active
                    ? "var(--accent)"
                    : "transparent",
                  borderWidth: pending ? 1 : 0,
                  borderStyle: "solid",
                  borderColor: "var(--border-strong)",
                  boxShadow: done
                    ? "0 0 10px rgba(74,222,128,0.5)"
                    : active
                    ? "0 0 14px rgba(108,99,255,0.7), 0 0 24px rgba(108,99,255,0.3)"
                    : "none",
                  transition: "all 0.3s var(--ease)",
                }}
              >
                {done && (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="var(--bg)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M1.5 5L4 7.5L8.5 2.5" />
                  </svg>
                )}
                {active && (
                  <>
                    {/* Inner pulsing dot */}
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{
                        background: "#fff",
                        animation: "pulse 1.2s ease-in-out infinite",
                      }}
                    />
                    {/* Orbiting ring */}
                    <span
                      aria-hidden
                      style={{
                        position: "absolute",
                        inset: "-4px",
                        borderRadius: "50%",
                        border: "1px solid rgba(108,99,255,0.4)",
                        animation: "spin 2s linear infinite",
                      }}
                    />
                  </>
                )}
              </span>

              {/* Label */}
              <span
                className="text-sm transition-colors"
                style={{
                  color: active
                    ? "var(--fg)"
                    : done
                    ? "var(--fg-muted)"
                    : "var(--fg-dim)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {step.label}
              </span>

              {/* Status tag */}
              {active && (
                <span className="ml-auto inline-flex items-center gap-1.5">
                  <DotsLoader />
                  <span
                    className="font-mono text-[10px] tracking-[0.2em] uppercase"
                    style={{ color: "var(--accent-soft)" }}
                  >
                    running
                  </span>
                </span>
              )}
              {done && (
                <span
                  className="ml-auto font-mono text-[10px] tracking-[0.2em] uppercase"
                  style={{ color: "var(--success)" }}
                >
                  done
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Keyframes injected via style tag — keeps the component self-contained */}
      <style jsx>{`
        @keyframes ping {
          0% { transform: scale(1); opacity: 0.8; }
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0.2; }
        }
        @keyframes glint {
          0% { transform: translateX(-80px); }
          100% { transform: translateX(calc(100vw)); }
        }
        @keyframes orbit {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-30px, 20px); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}

/**
 * Three-dot bouncing loader — neon indigo dots.
 */
function DotsLoader() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 rounded-full"
          style={{
            background: "var(--accent)",
            boxShadow: "0 0 6px rgba(108,99,255,0.8)",
            animation: `dotBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes dotBounce {
          0%, 80%, 100% {
            transform: scale(0.6);
            opacity: 0.4;
          }
          40% {
            transform: scale(1.2);
            opacity: 1;
          }
        }
      `}</style>
    </span>
  );
}
