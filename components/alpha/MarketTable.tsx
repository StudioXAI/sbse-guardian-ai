"use client";

import { useMemo, useState } from "react";

export type MarketRow = {
  rank: number;
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  marketCapUsd: number;
  imageUrl?: string;
  /** Crypto only — 7d change. */
  change7dPct?: number;
};

interface Props {
  title: string;
  subtitle?: string;
  rows: MarketRow[];
  type: "crypto" | "stocks";
}

function fmtPrice(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function fmtCap(v: number): string {
  if (v <= 0) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return `$${(v / 1e3).toFixed(0)}K`;
}

export default function MarketTable({ title, subtitle, rows, type }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.symbol.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const isCrypto = type === "crypto";

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div>
          <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
            {title}
          </div>
          {subtitle && (
            <div className="text-[11px] mt-1" style={{ color: "var(--fg-dim)" }}>
              {subtitle}
            </div>
          )}
        </div>
        <input
          type="search"
          placeholder={`Search ${isCrypto ? "ticker or name" : "stock"}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="px-3 py-1.5 rounded-md"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontSize: "12px",
            outline: "none",
            width: "200px",
            fontFamily: "var(--font-sans)",
          }}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--fg-dim)" }}>
          {isCrypto
            ? "Top 50 crypto unavailable — CoinGecko did not respond."
            : "Top 50 stocks unavailable — Yahoo Finance did not respond. Stock data sometimes restricts based on serverless region. If this persists, try refreshing in a few minutes."}
        </p>
      ) : (
        <div
          className="overflow-y-auto rounded-lg"
          style={{
            maxHeight: "440px",
            border: "1px solid var(--border)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead
              style={{
                position: "sticky",
                top: 0,
                background: "var(--bg-elevated)",
                zIndex: 1,
              }}
            >
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <Th>#</Th>
                <Th>Asset</Th>
                <Th align="right">Price</Th>
                <Th align="right">24h</Th>
                {isCrypto && <Th align="right">7d</Th>}
                <Th align="right">Market cap</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const dir24 =
                  r.change24hPct > 0
                    ? "var(--success)"
                    : r.change24hPct < 0
                    ? "var(--danger)"
                    : "var(--fg-muted)";
                const dir7 =
                  (r.change7dPct ?? 0) > 0
                    ? "var(--success)"
                    : (r.change7dPct ?? 0) < 0
                    ? "var(--danger)"
                    : "var(--fg-muted)";
                return (
                  <tr
                    key={r.symbol}
                    style={{
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <Td>
                      <span
                        className="font-mono"
                        style={{ color: "var(--fg-dim)", fontSize: "11px" }}
                      >
                        {r.rank}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {r.imageUrl && (
                          <img
                            src={r.imageUrl}
                            alt=""
                            width={18}
                            height={18}
                            style={{ borderRadius: "50%" }}
                          />
                        )}
                        <div>
                          <div
                            className="font-medium"
                            style={{
                              color: "var(--fg)",
                              fontSize: "13px",
                              lineHeight: 1.2,
                            }}
                          >
                            {r.symbol}
                          </div>
                          <div
                            style={{
                              color: "var(--fg-dim)",
                              fontSize: "10px",
                              lineHeight: 1.2,
                            }}
                          >
                            {r.name}
                          </div>
                        </div>
                      </div>
                    </Td>
                    <Td align="right">
                      <span
                        className="font-mono"
                        style={{ color: "var(--fg)", fontSize: "12px" }}
                      >
                        {fmtPrice(r.priceUsd)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className="font-mono"
                        style={{ color: dir24, fontSize: "12px" }}
                      >
                        {r.change24hPct >= 0 ? "+" : ""}
                        {r.change24hPct.toFixed(2)}%
                      </span>
                    </Td>
                    {isCrypto && (
                      <Td align="right">
                        <span
                          className="font-mono"
                          style={{ color: dir7, fontSize: "12px" }}
                        >
                          {(r.change7dPct ?? 0) >= 0 ? "+" : ""}
                          {(r.change7dPct ?? 0).toFixed(2)}%
                        </span>
                      </Td>
                    )}
                    <Td align="right">
                      <span
                        className="font-mono"
                        style={{ color: "var(--fg-muted)", fontSize: "11px" }}
                      >
                        {fmtCap(r.marketCapUsd)}
                      </span>
                    </Td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <Td colSpan={isCrypto ? 6 : 5}>
                    <span
                      className="text-[12px]"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      No matches.
                    </span>
                  </Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "10px 12px",
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--fg-dim)",
        fontWeight: 500,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: align,
        padding: "8px 12px",
        verticalAlign: "middle",
      }}
    >
      {children}
    </td>
  );
}
