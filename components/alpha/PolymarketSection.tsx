"use client";

import { useEffect, useMemo, useState } from "react";
import type { PolymarketBet } from "@/lib/alpha/types";
import type { PolymarketSplit } from "@/lib/alpha/polymarketClient";
import { alphaGet } from "@/lib/alpha/client";
import { directionFillVar } from "./DirectionBadge";
import { formatUsd } from "@/lib/alpha/format";
import { computeMarketImpact } from "@/lib/alpha/marketImpactEngine";

export default function PolymarketSection() {
  const [data, setData] = useState<PolymarketSplit | null>(null);
  const [tab, setTab] = useState<"ongoing" | "closed">("ongoing");
  const [filter, setFilter] = useState<"all" | "yes" | "no">("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = await alphaGet<PolymarketSplit>("/api/alpha/polymarket");
      if (!cancelled) setData(d ?? { ongoing: [], closed: [] });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeBets = tab === "ongoing" ? data?.ongoing ?? [] : data?.closed ?? [];

  const impact = useMemo(
    () => (data ? computeMarketImpact(data.ongoing) : null),
    [data],
  );

  const filteredBets = useMemo(() => {
    if (!activeBets.length) return [];
    if (filter === "all") return activeBets;
    if (filter === "yes") return activeBets.filter((b) => b.yesPct >= 60);
    return activeBets.filter((b) => b.yesPct <= 40);
  }, [activeBets, filter]);

  /* Top 5 highest-volume bets in current tab. */
  const highestBets = useMemo(() => {
    return [...activeBets].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 5);
  }, [activeBets]);

  /* YES / NO dominance counts. */
  const dominance = useMemo(() => {
    let yesWins = 0;
    let noWins = 0;
    let toss = 0;
    for (const b of activeBets) {
      if (b.yesPct >= 60) yesWins++;
      else if (b.yesPct <= 40) noWins++;
      else toss++;
    }
    return { yesWins, noWins, toss };
  }, [activeBets]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div
        className="card p-4 flex items-center justify-between flex-wrap gap-2"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <div>
          <div className="label-xs" style={{ color: "var(--accent-soft)" }}>
            Real-money prediction markets
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--fg-muted)" }}>
            {data === null
              ? "Loading…"
              : `${data.ongoing.length} ongoing · ${data.closed.length} closed`}
          </div>
        </div>
      </div>

      {/* Market impact (computed from ongoing markets) */}
      {impact && data && data.ongoing.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          <ImpactCard
            label="Crypto market impact"
            score={impact.cryptoImpact}
            direction={impact.cryptoDirection}
            volumeUsd={impact.cryptoVolumeUsd}
            count={impact.cryptoRelevant.length}
            narrative={impact.cryptoNarrative}
          />
          <ImpactCard
            label="Stock market impact"
            score={impact.stockImpact}
            direction={impact.stockDirection}
            volumeUsd={impact.stockVolumeUsd}
            count={impact.stockRelevant.length}
            narrative={impact.stockNarrative}
          />
        </div>
      )}

      {/* Ongoing / Closed tabs */}
      <div className="flex flex-wrap gap-2">
        <SubTab
          active={tab === "ongoing"}
          label="Ongoing markets"
          sub={`Top ${data?.ongoing.length ?? 0} live`}
          onClick={() => setTab("ongoing")}
        />
        <SubTab
          active={tab === "closed"}
          label="Closed markets"
          sub={`Top ${data?.closed.length ?? 0} settled`}
          onClick={() => setTab("closed")}
        />
      </div>

      {/* Dominance + highest bets summary */}
      {activeBets.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card p-4">
            <div className="label-xs mb-3" style={{ color: "var(--fg-muted)" }}>
              {tab === "ongoing" ? "YES vs NO leaning" : "YES vs NO outcomes"}
            </div>
            <DominanceBar
              yesWins={dominance.yesWins}
              noWins={dominance.noWins}
              toss={dominance.toss}
              isClosed={tab === "closed"}
            />
          </div>
          <div className="card p-4">
            <div className="label-xs mb-3" style={{ color: "var(--fg-muted)" }}>
              Highest bets · top 5 by volume
            </div>
            <div className="space-y-1.5">
              {highestBets.map((b, i) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="font-mono text-[10px] flex-shrink-0"
                      style={{ color: "var(--fg-dim)", width: "16px" }}
                    >
                      #{i + 1}
                    </span>
                    <span
                      className="truncate text-[12px]"
                      style={{ color: "var(--fg)" }}
                    >
                      {b.question}
                    </span>
                  </div>
                  <span
                    className="font-mono flex-shrink-0"
                    style={{ color: "var(--accent-soft)", fontSize: "11px" }}
                  >
                    {formatUsd(b.volumeUsd)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bet list with filter */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
            {tab === "ongoing" ? "Top 50 ongoing" : "Top 50 closed"} ·{" "}
            {filteredBets.length} shown
          </div>
          <div
            className="inline-flex p-0.5 rounded-md"
            style={{
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
            }}
          >
            {(
              [
                ["all", "All"],
                ["yes", tab === "ongoing" ? "YES leaning" : "YES won"],
                ["no", tab === "ongoing" ? "NO leaning" : "NO won"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className="px-2.5 py-1 rounded font-mono"
                style={{
                  background: filter === k ? "var(--accent)" : "transparent",
                  color: filter === k ? "#fff" : "var(--fg-muted)",
                  fontSize: "10px",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {data === null && (
          <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
            Loading prediction market consensus…
          </div>
        )}

        {data && activeBets.length === 0 && (
          <div
            className="p-4 rounded-lg"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div
              className="font-mono text-[11px] mb-2"
              style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
            >
              {tab === "ongoing"
                ? "NO ONGOING MARKETS RIGHT NOW"
                : "NO CLOSED MARKETS IN RECENT WINDOW"}
            </div>
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              {tab === "ongoing"
                ? "Live markets are temporarily unreachable. The feed refreshes every 5 minutes."
                : "No recently-settled markets to display. Switch to Ongoing for live consensus."}
            </p>
          </div>
        )}

        {data && filteredBets.length === 0 && activeBets.length > 0 && (
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            No markets match this filter. Try All to see everything.
          </p>
        )}

        {data && filteredBets.length > 0 && (
          <div
            className="overflow-y-auto space-y-2"
            style={{ maxHeight: "640px" }}
          >
            {filteredBets.map((b) => (
              <BetRow key={b.id} bet={b} />
            ))}
          </div>
        )}
      </div>

      {/* Decentralization disclaimer */}
      <div
        className="card p-3"
        style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
      >
        <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          Prediction-market data aggregated from public blockchain consensus.
          Not financial advice. SbSe Guardian Alpha provides intelligence,
          not execution — no betting, no custody, no KYC.
        </p>
      </div>
    </div>
  );
}

function SubTab({
  active,
  label,
  sub,
  onClick,
}: {
  active: boolean;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 rounded-md text-left transition-colors"
      style={{
        background: active ? "var(--accent-dim)" : "var(--bg-subtle)",
        border: active
          ? "1px solid var(--border-accent)"
          : "1px solid var(--border)",
        color: active ? "var(--accent-soft)" : "var(--fg-muted)",
        cursor: "pointer",
      }}
    >
      <div className="font-mono" style={{ fontSize: "11px", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
        {sub}
      </div>
    </button>
  );
}

function DominanceBar({
  yesWins,
  noWins,
  toss,
  isClosed,
}: {
  yesWins: number;
  noWins: number;
  toss: number;
  isClosed: boolean;
}) {
  const total = yesWins + noWins + toss;
  if (total === 0)
    return (
      <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
        No markets to analyze.
      </p>
    );
  const yesPct = (yesWins / total) * 100;
  const noPct = (noWins / total) * 100;
  const tossPct = (toss / total) * 100;

  return (
    <div>
      <div
        className="flex h-[10px] rounded-full overflow-hidden mb-3"
        style={{ background: "var(--bg-subtle)" }}
      >
        {yesPct > 0 && (
          <div
            style={{
              width: `${yesPct}%`,
              background: "var(--success)",
            }}
          />
        )}
        {tossPct > 0 && (
          <div
            style={{
              width: `${tossPct}%`,
              background: "var(--accent)",
            }}
          />
        )}
        {noPct > 0 && (
          <div
            style={{
              width: `${noPct}%`,
              background: "var(--danger)",
            }}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "var(--success)" }}
          />
          <span style={{ color: "var(--success)" }}>
            {isClosed ? "YES won" : "YES leaning"} · {yesWins}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "var(--accent)" }}
          />
          <span style={{ color: "var(--fg-muted)" }}>Toss-up · {toss}</span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "var(--danger)" }}
          />
          <span style={{ color: "var(--danger)" }}>
            {isClosed ? "NO won" : "NO leaning"} · {noWins}
          </span>
        </div>
      </div>
    </div>
  );
}

function ImpactCard({
  label,
  score,
  direction,
  volumeUsd,
  count,
  narrative,
}: {
  label: string;
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  volumeUsd: number;
  count: number;
  narrative: string;
}) {
  const fill = directionFillVar(direction);
  const borderColor =
    direction === "bullish"
      ? "var(--success)"
      : direction === "bearish"
      ? "var(--danger)"
      : "var(--accent)";
  const dirLabel =
    direction === "bullish"
      ? "POSITIVE"
      : direction === "bearish"
      ? "NEGATIVE"
      : "NEUTRAL";

  return (
    <div className="card p-4" style={{ borderLeft: `3px solid ${borderColor}` }}>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="label-xs" style={{ color: "var(--fg-muted)" }}>
          {label}
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-mono"
          style={{
            background:
              direction === "bullish"
                ? "var(--success-dim)"
                : direction === "bearish"
                ? "var(--danger-dim)"
                : "var(--accent-dim)",
            color: fill,
            letterSpacing: "0.05em",
          }}
        >
          {dirLabel}
        </span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="font-mono font-medium"
          style={{ fontSize: "26px", color: fill, letterSpacing: "-0.02em" }}
        >
          {score >= 0 ? "+" : ""}
          {score}
        </span>
        <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          impact score
        </span>
      </div>
      <div
        className="relative h-[3px] rounded-full mb-3"
        style={{ background: "var(--border)" }}
      >
        <div
          className="absolute top-0 h-full"
          style={{ background: "var(--fg-dim)", left: "50%", width: "1px" }}
        />
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            background: fill,
            left: score >= 0 ? "50%" : `${50 + score / 2}%`,
            width: `${Math.abs(score) / 2}%`,
          }}
        />
      </div>
      <p className="text-[12px] leading-relaxed mb-2" style={{ color: "var(--fg)" }}>
        {narrative}
      </p>
      <div className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
        {count} relevant {count === 1 ? "market" : "markets"} · {formatUsd(volumeUsd)} total volume
      </div>
    </div>
  );
}

function BetRow({ bet }: { bet: PolymarketBet }) {
  const fill = directionFillVar(bet.signalDirection);
  const borderColor =
    bet.signalDirection === "bullish"
      ? "var(--success)"
      : bet.signalDirection === "bearish"
      ? "var(--danger)"
      : "var(--accent)";

  /* Pill label based on whether market is closed and YES%. */
  let pillLabel: string;
  let pillBg: string;
  let pillFg: string;
  if (bet.isClosed) {
    if (bet.yesPct >= 50) {
      pillLabel = "YES WON";
      pillBg = "var(--success-dim)";
      pillFg = "var(--success)";
    } else {
      pillLabel = "NO WON";
      pillBg = "var(--danger-dim)";
      pillFg = "var(--danger)";
    }
  } else {
    if (bet.yesPct >= 60) {
      pillLabel = "YES";
      pillBg = "var(--success-dim)";
      pillFg = "var(--success)";
    } else if (bet.yesPct <= 40) {
      pillLabel = "NO";
      pillBg = "var(--danger-dim)";
      pillFg = "var(--danger)";
    } else {
      pillLabel = "TOSS-UP";
      pillBg = "var(--bg-subtle)";
      pillFg = "var(--fg-muted)";
    }
  }

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        background: "var(--bg-elevated)",
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p
          className="text-[13px] font-medium leading-snug flex-1"
          style={{ color: "var(--fg)" }}
        >
          {bet.question}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-mono"
            style={{
              background: pillBg,
              color: pillFg,
              letterSpacing: "0.05em",
            }}
          >
            {pillLabel}
          </span>
          <div className="text-right">
            <div className="font-mono font-medium" style={{ fontSize: "14px", color: fill }}>
              {bet.yesPct}%
            </div>
            <div className="text-[9px]" style={{ color: "var(--fg-dim)" }}>
              YES
            </div>
          </div>
        </div>
      </div>

      <div
        className="h-[2px] rounded-full mb-2"
        style={{ background: "var(--border)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${bet.yesPct}%`, background: fill }}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
          {bet.signalNote}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="font-mono text-[10px]"
            style={{ color: "var(--fg-dim)" }}
          >
            {formatUsd(bet.volumeUsd)}
          </span>
          {bet.link && (
            <a
              href={bet.link}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-0.5 rounded font-mono"
              style={{
                background: "var(--bg-subtle)",
                color: "var(--accent-soft)",
                border: "1px solid var(--border-accent)",
                fontSize: "10px",
                letterSpacing: "0.05em",
                textDecoration: "none",
              }}
            >
              OPEN ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
