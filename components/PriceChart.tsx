"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface Point { t: number; p: number }

interface PriceChartProps {
  contractAddress: string;
  chain: string;
  tokenSymbol?: string;
}

type Timeframe = 1 | 7 | 30;

export default function PriceChart({
  contractAddress,
  chain,
  tokenSymbol,
}: PriceChartProps) {
  const [tf, setTf] = useState<Timeframe>(1);
  const [points, setPoints] = useState<Point[]>([]);
  const [source, setSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/price-history?contract=${contractAddress}&chain=${encodeURIComponent(
            chain,
          )}&days=${tf}`,
        );
        if (!res.ok) {
          if (!cancelled) setError("Price data unavailable");
          return;
        }
        const data = await res.json();
        if (cancelled) return;

        const rawPoints: [number, number][] = data?.points || [];
        setPoints(rawPoints.map(([t, p]) => ({ t, p })));
        setSource(data?.source || "none");
      } catch (e) {
        if (!cancelled) setError("Could not load price history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [contractAddress, chain, tf]);

  const { minPrice, maxPrice, changePct, isUp } = useMemo(() => {
    if (points.length < 2) {
      return { minPrice: 0, maxPrice: 0, changePct: 0, isUp: true };
    }
    const prices = points.map((p) => p.p);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const first = points[0].p;
    const last = points[points.length - 1].p;
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    return { minPrice: min, maxPrice: max, changePct: change, isUp: change >= 0 };
  }, [points]);

  const lineColor = isUp ? "#4ade80" : "#f87171";
  const lineColorDim = isUp ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)";

  const hasData = points.length > 1;

  return (
    <div
      className="relative rounded-lg overflow-hidden border"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg-elevated)",
        minHeight: "340px",
      }}
    >
      {/* Header: timeframe toggle + change indicator */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--fg)" }}
          >
            Price {tokenSymbol ? `(${tokenSymbol})` : ""}
          </span>
          {hasData && (
            <span
              className="font-mono text-xs tabular-nums"
              style={{ color: isUp ? "var(--success)" : "var(--danger)" }}
            >
              {isUp ? "+" : ""}
              {changePct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setTf(d as Timeframe)}
              className="px-2.5 py-1 rounded-md font-mono text-[10px] tracking-wider uppercase transition hover:brightness-125"
              style={{
                background: tf === d ? "var(--accent-dim)" : "transparent",
                color: tf === d ? "var(--accent-soft)" : "var(--fg-dim)",
                border: `1px solid ${tf === d ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {d === 1 ? "24H" : `${d}D`}
            </button>
          ))}
        </div>
      </div>

      {/* Chart body */}
      <div className="relative" style={{ height: "280px" }}>
        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center text-sm"
            style={{ color: "var(--fg-dim)" }}
          >
            Loading price data…
          </div>
        )}
        {!loading && !hasData && !error && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
            style={{ color: "var(--fg-muted)" }}
          >
            <div className="mb-2 text-3xl" style={{ opacity: 0.4 }} aria-hidden>
              📊
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>
              No price data available
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--fg-dim)" }}>
              This token isn't indexed by CoinGecko or DexScreener.
            </p>
          </div>
        )}
        {!loading && error && (
          <div
            className="absolute inset-0 flex items-center justify-center text-sm"
            style={{ color: "var(--danger)" }}
          >
            {error}
          </div>
        )}
        {hasData && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 16, right: 12, bottom: 8, left: 8 }}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => formatTimeTick(t, tf)}
                stroke="var(--fg-dim)"
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--fg-dim)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                domain={[minPrice * 0.98, maxPrice * 1.02]}
                tickFormatter={formatPrice}
                stroke="var(--fg-dim)"
                tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--fg-dim)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                width={72}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                }}
                labelStyle={{ color: "var(--fg-dim)" }}
                itemStyle={{ color: "var(--fg)" }}
                labelFormatter={(t) => formatTimeFull(Number(t))}
                formatter={(v: number) => [formatPrice(v), "Price"]}
              />
              <Area
                type="monotone"
                dataKey="p"
                stroke={lineColor}
                strokeWidth={2}
                fill="url(#priceGradient)"
                dot={false}
                isAnimationActive={true}
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Source attribution */}
      {hasData && source && (
        <div
          className="px-4 py-2 text-[10px] font-mono tracking-wider uppercase border-t"
          style={{
            borderColor: "var(--border)",
            color: "var(--fg-dim)",
          }}
        >
          Source: {source === "coingecko" ? "CoinGecko" : source === "dexscreener" ? "DexScreener (fallback)" : "Unknown"}
        </div>
      )}
    </div>
  );
}

function formatPrice(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toPrecision(3)}`;
}

function formatTimeTick(t: number, tf: Timeframe): string {
  const d = new Date(t);
  if (tf === 1) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatTimeFull(t: number): string {
  const d = new Date(t);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
