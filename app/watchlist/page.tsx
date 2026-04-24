"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface Watch {
  contractAddress: string;
  chainId: number;
  chainName: string;
  projectName: string;
  createdAt: number;
  lastCheckedAt?: number;
}

function WatchlistPageInner() {
  const params = useSearchParams();
  const email = params.get("email") || "";
  const token = params.get("token") || "";
  const removeContract = params.get("contract") || "";
  const removeChainId = params.get("chainId") || "";

  const [watches, setWatches] = useState<Watch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "removing" | "removed" | "error">("loading");

  useEffect(() => {
    async function load() {
      if (!email || !token) {
        setStatus("error");
        setError("Missing email or token");
        return;
      }

      // If a contract+chainId was passed, remove it first
      if (removeContract && removeChainId) {
        setStatus("removing");
        try {
          await fetch(
            `/api/watchlist?email=${encodeURIComponent(email)}&token=${token}&contract=${removeContract}&chainId=${removeChainId}`,
            { method: "DELETE" },
          );
        } catch {
          /* ignore */
        }
      }

      try {
        const res = await fetch(
          `/api/watchlist?email=${encodeURIComponent(email)}&token=${token}`,
        );
        const data = await res.json();
        if (!data.success) {
          setStatus("error");
          setError(data.message || "Failed to load");
          return;
        }
        setWatches(data.watches || []);
        setStatus(removeContract ? "removed" : "loaded");
      } catch (e: any) {
        setStatus("error");
        setError("Request failed");
      }
    }
    void load();
  }, [email, token, removeContract, removeChainId]);

  const handleRemove = async (contract: string, chainId: number) => {
    try {
      const res = await fetch(
        `/api/watchlist?email=${encodeURIComponent(email)}&token=${token}&contract=${contract}&chainId=${chainId}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.success && watches) {
        setWatches(
          watches.filter(
            (w) => !(w.contractAddress === contract && w.chainId === chainId),
          ),
        );
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div
            className="flex items-center gap-2 label-sm mb-2"
            style={{ color: "var(--accent-soft)" }}
          >
            <img
              src="/logo.png"
              alt="SbSe Guardian"
              className="h-5 w-5 object-contain"
            />
            SbSe Guardian
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2" style={{ letterSpacing: "-0.02em" }}>
            Your Watchlist
          </h1>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Contracts you're watching for ownership and liquidity changes.
            Managed via email: <span className="font-mono">{email}</span>
          </p>
        </div>

        {status === "loading" && (
          <div className="card p-6 text-sm" style={{ color: "var(--fg-dim)" }}>
            Loading watches…
          </div>
        )}

        {status === "error" && (
          <div
            className="card p-6"
            style={{
              background: "var(--danger-dim)",
              border: "1px solid rgba(248,113,113,0.25)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error || "Something went wrong."}
            </p>
          </div>
        )}

        {status === "removed" && (
          <div
            className="card p-4 mb-4"
            style={{
              background: "var(--success-dim)",
              border: "1px solid rgba(74,222,128,0.3)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--success)" }}>
              Contract removed from watchlist.
            </p>
          </div>
        )}

        {(status === "loaded" || status === "removed") && watches && (
          <>
            {watches.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
                  No watches. Scan a contract and unlock premium to start watching.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {watches.map((w) => (
                  <li
                    key={`${w.chainId}:${w.contractAddress}`}
                    className="card p-5 flex items-center justify-between gap-4 flex-wrap"
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-medium mb-1"
                        style={{ color: "var(--fg)" }}
                      >
                        {w.projectName}
                      </div>
                      <div
                        className="font-mono text-xs mb-1 break-all"
                        style={{ color: "var(--fg-dim)" }}
                      >
                        {w.contractAddress}
                      </div>
                      <div className="text-xs" style={{ color: "var(--fg-muted)" }}>
                        {w.chainName}
                        {w.lastCheckedAt
                          ? ` · Last checked ${timeAgo(w.lastCheckedAt)}`
                          : " · Not yet checked"}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(w.contractAddress, w.chainId)}
                      className="px-3 py-1.5 rounded-md text-xs transition hover:brightness-110"
                      style={{
                        background: "transparent",
                        color: "var(--danger)",
                        border: "1px solid rgba(248,113,113,0.3)",
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="mt-10 text-xs text-center" style={{ color: "var(--fg-dim)" }}>
          <a
            href="/"
            className="hover:underline"
            style={{ color: "var(--accent-soft)" }}
          >
            ← Back to scanner
          </a>
        </div>
      </div>
    </div>
  );
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function WatchlistPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-12">Loading…</div>}>
      <WatchlistPageInner />
    </Suspense>
  );
}
