"use client";

import { useState } from "react";
import type { ThreatsPayload } from "@/lib/alpha/threatTracker";
import type { SuspiciousActivity, RiskReason } from "@/lib/alpha/threatTypes";
import { formatUsd, timeAgo } from "@/lib/alpha/format";

interface Props {
  data: ThreatsPayload | null;
}

interface GroupConfig {
  key: keyof ThreatsPayload["groups"];
  title: string;
  description: string;
  emptyMessage: string;
  accentColor: string;
}

const GROUPS: GroupConfig[] = [
  {
    key: "dexSwaps",
    title: "DEX Swaps",
    description: "Uniswap V2/V3 + Curve + Balancer · suspicious sells",
    emptyMessage:
      "No suspicious DEX swaps in the last scan window.",
    accentColor: "var(--danger)",
  },
  {
    key: "liquidityRemovals",
    title: "Liquidity Removals",
    description: "V2/V3 LP withdrawals · the archetypal rug-pull signal",
    emptyMessage:
      "No notable liquidity withdrawals in the last scan window.",
    accentColor: "var(--warning, #f59e0b)",
  },
  {
    key: "lendingActivity",
    title: "Lending Activity",
    description: "Aave V3 borrows + liquidations across enabled chains",
    emptyMessage: "No notable lending events in the last scan window.",
    accentColor: "#a855f7",
  },
  {
    key: "largeTransfers",
    title: "Large Transfers",
    description: "ERC20 Transfer events ≥ $50K · CEX flows + treasury moves",
    emptyMessage: "No large transfers above the threshold this scan.",
    accentColor: "var(--accent-soft)",
  },
];

export default function SuspiciousSellsPanel({ data }: Props) {
  if (data === null) {
    return (
      <div className="card p-5">
        <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
          Scanning live blockchain activity across DEX swaps, lending, LP
          removals, and large transfers…
        </div>
      </div>
    );
  }

  /* QuickNode not configured — show actionable guidance. */
  if (!data.scannerStatus.quicknodeConfigured) {
    return (
      <div
        className="card p-5"
        style={{ borderLeft: "3px solid var(--warning, #f59e0b)" }}
      >
        <div
          className="label-xs mb-2"
          style={{ color: "var(--warning, #f59e0b)" }}
        >
          Live blockchain scanner not configured
        </div>
        <p
          className="text-[13px] mb-3 leading-relaxed"
          style={{ color: "var(--fg-muted)" }}
        >
          The Threats tab needs a QuickNode RPC endpoint to scan live
          blockchain activity. Without it, only the Risk Events sub-tab
          (Etherscan-based) is operational.
        </p>
        <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
          To enable: register a free or $10/mo QuickNode account at{" "}
          <a
            href="https://www.quicknode.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent-soft)" }}
          >
            quicknode.com
          </a>
          , create a multi-chain endpoint, and add{" "}
          <code style={{ color: "var(--accent-soft)" }}>
            QUICKNODE_BASE_URL
          </code>{" "}
          to your Vercel environment variables.
        </p>
      </div>
    );
  }

  /* Aggregate stats across all groups for the header strip. */
  const totalActivities =
    data.groups.dexSwaps.length +
    data.groups.liquidityRemovals.length +
    data.groups.lendingActivity.length +
    data.groups.largeTransfers.length;

  /* Recent buffer counts (across all categories). */
  const recent = data.recent ?? {
    groups: {
      dexSwaps: [],
      liquidityRemovals: [],
      lendingActivity: [],
      largeTransfers: [],
    },
    oldestEntryAt: null,
    bufferSize: 0,
  };
  const recentTotal =
    recent.groups.dexSwaps.length +
    recent.groups.liquidityRemovals.length +
    recent.groups.lendingActivity.length +
    recent.groups.largeTransfers.length;

  /* Mode toggle — Live (current scan) vs Recent (session buffer). */
  const [mode, setMode] = useState<"live" | "recent">("live");
  const displayedGroups = mode === "live" ? data.groups : recent.groups;
  const displayedTotal = mode === "live" ? totalActivities : recentTotal;

  return (
    <div className="space-y-3">
      {/* Top stats strip */}
      <div className="card p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="label-xs"
            style={{ color: "var(--fg-muted)" }}
          >
            Live multi-protocol scan · {data.chainsScanned.length}{" "}
            {data.chainsScanned.length === 1 ? "chain" : "chains"}
          </span>
          <span
            className="text-[10px] px-2 py-1 rounded-full font-mono"
            style={{
              background: "rgba(239,68,68,0.15)",
              color: "var(--danger)",
              letterSpacing: "0.05em",
            }}
          >
            {totalActivities} FLAGGED
          </span>
        </div>
        <div
          className="text-[10px] font-mono flex flex-wrap gap-x-3 gap-y-1"
          style={{ color: "var(--fg-dim)" }}
        >
          <span>{data.scanStats.dexSwapsSeen.toLocaleString()} DEX events</span>
          <span>·</span>
          <span>
            {data.scanStats.liquidityRemovalsSeen.toLocaleString()} burns
          </span>
          <span>·</span>
          <span>
            {data.scanStats.lendingEventsSeen.toLocaleString()} lending
          </span>
          <span>·</span>
          <span>
            {data.scanStats.transfersSeen.toLocaleString()} transfers
          </span>
        </div>
      </div>

      {/* Live / Recent (session) toggle — small mode switch above groups */}
      <div className="card p-2 flex items-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => setMode("live")}
          className="font-mono text-[11px] px-3 py-1.5 rounded transition-colors"
          style={{
            background:
              mode === "live" ? "var(--bg-elevated)" : "transparent",
            color: mode === "live" ? "var(--fg)" : "var(--fg-dim)",
            border: "none",
            cursor: "pointer",
            letterSpacing: "0.05em",
          }}
        >
          LIVE NOW
          <span
            className="ml-2 text-[9px] px-1.5 py-0.5 rounded"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--fg-muted)",
            }}
          >
            {totalActivities}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("recent")}
          className="font-mono text-[11px] px-3 py-1.5 rounded transition-colors"
          style={{
            background:
              mode === "recent" ? "var(--bg-elevated)" : "transparent",
            color: mode === "recent" ? "var(--fg)" : "var(--fg-dim)",
            border: "none",
            cursor: "pointer",
            letterSpacing: "0.05em",
          }}
        >
          RECENT (SESSION)
          <span
            className="ml-2 text-[9px] px-1.5 py-0.5 rounded"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--fg-muted)",
            }}
          >
            {recentTotal}
          </span>
        </button>
        <div
          className="ml-auto text-[10px] font-mono pl-2"
          style={{ color: "var(--fg-dim)" }}
        >
          {mode === "live"
            ? "Last scan window (~30 blocks)"
            : recent.oldestEntryAt
            ? `Buffered since ${timeAgo(recent.oldestEntryAt)} · resets on instance restart`
            : "Buffer empty — populates as scans run"}
        </div>
      </div>

      {displayedTotal === 0 && (
        <div className="card p-5">
          <div
            className="font-mono text-[11px] mb-2"
            style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
          >
            {mode === "live"
              ? "NOTHING SUSPICIOUS IN THE LAST SCAN WINDOW"
              : "NO BUFFERED WARNINGS YET"}
          </div>
          <p
            className="text-[13px]"
            style={{ color: "var(--fg-muted)" }}
          >
            {mode === "live"
              ? "All scanners ran and found no activity meeting suspicion thresholds. Refreshes every 90 seconds — if a chain is quiet, empty results are expected and normal."
              : "The recent-warnings buffer accumulates flagged activity from each scan and persists for the lifetime of this serverless instance. As scans run, this view will fill up. Buffer resets on deploys or cold starts — it's not a real 24h history."}
          </p>
        </div>
      )}

      {/* Render each group from the currently-selected dataset */}
      {GROUPS.map((groupCfg) => (
        <Group
          key={groupCfg.key}
          config={groupCfg}
          activities={displayedGroups[groupCfg.key]}
        />
      ))}

      {/* Scanner diagnostics — visible by default when something looks
          off (e.g. all zeros), collapsed by default when everything is
          working cleanly. */}
      {data.diagnostics && data.diagnostics.length > 0 && (
        <ScannerDiagnostics
          diagnostics={data.diagnostics}
          tipBlocks={data.tipBlocks ?? []}
          providerStats={data.providerStats ?? []}
          providerRoutes={data.providerRoutes ?? []}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Scanner diagnostics — per-scanner status with errors visible
   ───────────────────────────────────────────────────────────── */

function ScannerDiagnostics({
  diagnostics,
  tipBlocks,
  providerStats,
  providerRoutes,
}: {
  diagnostics: NonNullable<ThreatsPayload["diagnostics"]>;
  tipBlocks: NonNullable<ThreatsPayload["tipBlocks"]>;
  providerStats: NonNullable<ThreatsPayload["providerStats"]>;
  providerRoutes: NonNullable<ThreatsPayload["providerRoutes"]>;
}) {
  const hasErrors = diagnostics.some((d) => !d.ok);
  const hasNoEvents = diagnostics.every((d) => d.eventsSeen === 0);
  /* Provider failover detected — show this as a prominent state. */
  const usedFallback = providerStats.some(
    (p) => p.provider !== "QuickNode" && p.successes > 0,
  );
  /* Auto-expand if there are errors or every scanner returned zero
     events (suggests a deeper config issue). */
  const [expanded, setExpanded] = useState(
    hasErrors || hasNoEvents || usedFallback,
  );

  return (
    <div
      className="card overflow-hidden"
      style={{
        borderLeft: hasErrors
          ? "3px solid var(--danger)"
          : "3px solid var(--border)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between gap-2 transition-colors hover:bg-[var(--bg-elevated)]"
        style={{ background: "transparent", border: "none", cursor: "pointer" }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="label-xs"
            style={{
              color: hasErrors ? "var(--danger)" : "var(--fg-muted)",
            }}
          >
            Scanner diagnostics
          </span>
          {hasErrors && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-mono"
              style={{
                background: "rgba(239,68,68,0.15)",
                color: "var(--danger)",
                letterSpacing: "0.05em",
              }}
            >
              ERROR
            </span>
          )}
          {!hasErrors && hasNoEvents && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-mono"
              style={{
                background: "rgba(245,158,11,0.15)",
                color: "var(--warning, #f59e0b)",
                letterSpacing: "0.05em",
              }}
            >
              NO EVENTS
            </span>
          )}
          {!hasErrors && usedFallback && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-mono"
              style={{
                background: "rgba(108,99,255,0.15)",
                color: "var(--accent-soft)",
                letterSpacing: "0.05em",
              }}
              title="Fallback RPC provider answered some calls — primary provider may be degraded"
            >
              FALLBACK ACTIVE
            </span>
          )}
        </div>
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--fg-dim)" }}
        >
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* RPC provider stats — which providers actually answered */}
          {providerStats.length > 0 && (
            <div className="space-y-1">
              <div
                className="text-[10px] font-mono"
                style={{
                  color: "var(--fg-muted)",
                  letterSpacing: "0.05em",
                }}
              >
                RPC PROVIDER USAGE THIS SCAN
              </div>
              <div className="flex flex-wrap gap-2">
                {providerStats.map((p) => {
                  const total = p.successes + p.failures;
                  const isPrimary = p.provider === "QuickNode";
                  const isFallback = !isPrimary && p.successes > 0;
                  const color = isFallback
                    ? "var(--accent-soft)"
                    : p.failures > p.successes
                    ? "var(--danger)"
                    : "var(--success, #10b981)";
                  return (
                    <div
                      key={p.provider}
                      className="font-mono text-[10px] px-2 py-1 rounded"
                      style={{
                        background: "var(--bg-subtle)",
                        border: `1px solid ${color}`,
                        color,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{p.provider}</span>
                      <span
                        style={{ color: "var(--fg-dim)", marginLeft: 6 }}
                      >
                        {p.successes}/{total}
                      </span>
                    </div>
                  );
                })}
              </div>
              {usedFallback && (
                <p
                  className="text-[10px] mt-1 leading-relaxed"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Fallback provider answered some calls — your primary
                  (QuickNode) may be degraded, rate-limited, or
                  misconfigured. Check the per-scanner status below for
                  specific errors.
                </p>
              )}
            </div>
          )}

          {/* Configured provider routes per chain */}
          {providerRoutes.length > 0 && (
            <details className="text-[10px]">
              <summary
                className="cursor-pointer font-mono"
                style={{
                  color: "var(--fg-muted)",
                  letterSpacing: "0.05em",
                }}
              >
                CONFIGURED ROUTES
              </summary>
              <div className="mt-2 space-y-1">
                {providerRoutes.map((r) => (
                  <div key={r.chain} className="flex flex-wrap gap-1">
                    <span style={{ color: "var(--fg-dim)", minWidth: 80 }}>
                      {r.chain}:
                    </span>
                    <span style={{ color: "var(--fg-muted)" }}>
                      {r.providers.length === 0
                        ? "no providers configured"
                        : r.providers
                            .map((p) => `${p.provider} → ${p.redactedUrl}`)
                            .join("  ·  ")}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Tip blocks */}
          {tipBlocks.length > 0 && (
            <div
              className="text-[10px] font-mono flex flex-wrap gap-x-3 gap-y-1"
              style={{ color: "var(--fg-dim)" }}
            >
              <span style={{ color: "var(--fg-muted)" }}>Tip blocks:</span>
              {tipBlocks.map((tb) => (
                <span key={tb.chain}>
                  {tb.chain} #{tb.block.toLocaleString()}
                </span>
              ))}
            </div>
          )}

          {/* Per-scanner status */}
          <div className="space-y-1">
            {diagnostics.map((d) => (
              <div
                key={d.name}
                className="flex items-start justify-between gap-2 flex-wrap text-[11px] p-2 rounded"
                style={{ background: "var(--bg-subtle)" }}
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                  <span
                    className="font-mono"
                    style={{
                      color: d.ok ? "var(--success, #10b981)" : "var(--danger)",
                      fontSize: "10px",
                    }}
                  >
                    {d.ok ? "✓" : "✗"}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      color: "var(--fg)",
                      fontSize: "11px",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {d.name}
                  </span>
                  <span
                    className="font-mono"
                    style={{ color: "var(--fg-dim)", fontSize: "10px" }}
                  >
                    {d.eventsSeen.toLocaleString()} seen · {d.flagged} flagged
                    · {d.durationMs}ms
                  </span>
                </div>
                {d.error && (
                  <div
                    className="font-mono text-[10px]"
                    style={{ color: "var(--danger)" }}
                  >
                    {d.error}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Helpful hint when nothing was found */}
          {!hasErrors && hasNoEvents && (
            <p
              className="text-[11px] leading-relaxed mt-2"
              style={{ color: "var(--fg-muted)" }}
            >
              All scanners ran cleanly but the chain returned zero events
              in the scan window. This is unusual — Ethereum produces
              hundreds of events per minute. Check that{" "}
              <code style={{ color: "var(--accent-soft)" }}>
                QUICKNODE_BASE_URL
              </code>{" "}
              actually points at a working endpoint by visiting the URL
              directly (it should respond to JSON-RPC POST requests).
              Common causes: typo in the env var, accidentally exposed
              the URL elsewhere and the rate limiter blocked it, or the
              endpoint is paused in the QuickNode dashboard.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Group section — collapsible, with header + list of activities
   ───────────────────────────────────────────────────────────── */

function Group({
  config,
  activities,
}: {
  config: GroupConfig;
  activities: SuspiciousActivity[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasItems = activities.length > 0;

  return (
    <div
      className="card overflow-hidden"
      style={{ borderLeft: `3px solid ${config.accentColor}` }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full p-4 flex items-center justify-between gap-2 flex-wrap text-left transition-colors hover:bg-[var(--bg-elevated)]"
        style={{ background: "transparent", border: "none", cursor: "pointer" }}
      >
        <div>
          <div
            className="label-sm flex items-center gap-2 flex-wrap"
            style={{ color: config.accentColor }}
          >
            <span>{config.title}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{
                background: "var(--bg-subtle)",
                color: "var(--fg-muted)",
              }}
            >
              {activities.length}
            </span>
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
            {config.description}
          </div>
        </div>
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--fg-dim)" }}
        >
          {collapsed ? "+" : "−"}
        </span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-4 pb-4">
          {!hasItems && (
            <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              {config.emptyMessage}
            </p>
          )}
          {hasItems && (
            <div className="space-y-2">
              {activities.map((a) => (
                <ActivityRow key={a.id} activity={a} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Single activity row — adapts display based on category
   ───────────────────────────────────────────────────────────── */

function ActivityRow({ activity }: { activity: SuspiciousActivity }) {
  const sev = activity.severity;
  const sevColor =
    sev >= 80
      ? "var(--danger)"
      : sev >= 50
      ? "var(--warning, #f59e0b)"
      : "var(--accent-soft)";
  const sevLabel = sev >= 80 ? "CRITICAL" : sev >= 50 ? "HIGH" : "MEDIUM";

  const walletDisplay = activity.walletLabel ?? shorten(activity.wallet);
  const counterpartyDisplay = activity.counterpartyLabel ?? (activity.counterparty ? shorten(activity.counterparty) : null);

  /* Token display — for liquidity removals tokenSymbol is "X/Y", treat as-is. */
  const tokenLabel = activity.tokenSymbol;

  return (
    <div
      className="p-3 rounded-lg"
      style={{
        background: "var(--bg-elevated)",
        borderLeft: `3px solid ${sevColor}`,
      }}
    >
      {/* Top row: severity + token + USD/impact */}
      <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono px-2 py-1 rounded"
            style={{
              background: "var(--bg-subtle)",
              color: sevColor,
              border: `1px solid ${sevColor}`,
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.06em",
            }}
          >
            {sevLabel} · {sev}
          </span>
          <span
            className="font-mono px-1.5 py-0.5 rounded"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--accent-soft)",
              fontSize: "11px",
              letterSpacing: "0.05em",
            }}
            title={activity.tokenName}
          >
            {tokenLabel}
          </span>
          <span
            className="text-[10px] font-mono"
            style={{ color: "var(--fg-dim)" }}
          >
            {activity.chain} · {activity.contractLabel}
          </span>
        </div>
        <div className="text-right">
          <div
            className="font-mono font-medium"
            style={{ fontSize: "14px", color: sevColor }}
          >
            {activity.amountUsd !== null
              ? formatUsd(activity.amountUsd)
              : "—"}
          </div>
          {activity.poolImpactPct > 0 && (
            <div className="text-[10px]" style={{ color: "var(--danger)" }}>
              {activity.poolImpactPct.toFixed(2)}% pool impact
            </div>
          )}
        </div>
      </div>

      {/* Risk reason badges */}
      {activity.riskReasons.length > 0 && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          {activity.riskReasons.map((r) => (
            <RiskBadge key={r} reason={r} />
          ))}
        </div>
      )}

      {/* Plain-English summary */}
      <p
        className="text-[12px] mb-2 leading-snug"
        style={{ color: "var(--fg-muted)" }}
      >
        {activity.riskSummary}
      </p>

      {/* Detail rows */}
      <div className="space-y-1 text-[11px]">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-dim)", minWidth: "70px" }}>
            Wallet:
          </span>
          <a
            href={activity.walletUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--info)" }}
            title={`${activity.wallet} · view on block explorer`}
          >
            {walletDisplay}
          </a>
        </div>
        {counterpartyDisplay && activity.counterparty && (
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--fg-dim)", minWidth: "70px" }}>
              {activity.category === "large_transfer" ? "Recipient:" : "Counterparty:"}
            </span>
            <a
              href={`https://etherscan.io/address/${activity.counterparty}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:underline truncate"
              style={{ color: "var(--info)" }}
              title={activity.counterparty}
            >
              {counterpartyDisplay}
            </a>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-dim)", minWidth: "70px" }}>
            Contract:
          </span>
          <a
            href={activity.contractUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--fg-muted)" }}
            title={activity.contractAddress}
          >
            {shorten(activity.contractAddress)}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-dim)", minWidth: "70px" }}>
            Amount:
          </span>
          <span className="font-mono" style={{ color: "var(--fg-muted)" }}>
            {activity.tokenAmount.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            {activity.tokenSymbol}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <a
            href={activity.txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline"
            style={{ color: "var(--accent-soft)", fontSize: "10px" }}
          >
            view tx →
          </a>
          <span
            className="font-mono"
            style={{ color: "var(--fg-dim)", fontSize: "10px" }}
          >
            block {activity.blockNumber.toLocaleString()} · {timeAgo(activity.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Risk-reason badge presentation
   ───────────────────────────────────────────────────────────── */

function RiskBadge({ reason }: { reason: RiskReason }) {
  const meta = RISK_META[reason];
  if (!meta) return null;
  return (
    <span
      className="font-mono px-1.5 py-0.5 rounded"
      style={{
        background: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.fg}`,
        fontSize: "9px",
        fontWeight: 600,
        letterSpacing: "0.06em",
      }}
      title={meta.desc}
    >
      {meta.label}
    </span>
  );
}

const RISK_META: Record<
  RiskReason,
  { label: string; bg: string; fg: string; desc: string }
> = {
  large_sell: {
    label: "LARGE",
    bg: "rgba(245,158,11,0.12)",
    fg: "var(--warning, #f59e0b)",
    desc: "Notable size — over $50K USD",
  },
  liquidity_drain: {
    label: "LIQUIDITY DRAIN",
    bg: "rgba(239,68,68,0.12)",
    fg: "var(--danger)",
    desc: "Single swap consumed 10%+ of pool reserves",
  },
  abnormal_swap: {
    label: "ABNORMAL SWAP",
    bg: "rgba(239,68,68,0.18)",
    fg: "var(--danger)",
    desc: "Swap consumed 25%+ of pool — extreme size",
  },
  high_slippage: {
    label: "HIGH SLIPPAGE",
    bg: "rgba(245,158,11,0.12)",
    fg: "var(--warning, #f59e0b)",
    desc: "Implied price impact above 5%",
  },
  flash_loan_pattern: {
    label: "FLASH LOAN",
    bg: "rgba(168,85,247,0.15)",
    fg: "#a855f7",
    desc: "Same-block borrow + sell + repay pattern",
  },
  suspicious_wallet: {
    label: "SUSPICIOUS WALLET",
    bg: "rgba(245,158,11,0.12)",
    fg: "var(--warning, #f59e0b)",
    desc: "Sender matches a labeled wallet of interest",
  },
  mev_bot: {
    label: "MEV BOT",
    bg: "rgba(245,158,11,0.15)",
    fg: "var(--warning, #f59e0b)",
    desc: "Sender is a known MEV/sandwich/arbitrage operator",
  },
  new_token: {
    label: "NEW TOKEN",
    bg: "rgba(108,99,255,0.15)",
    fg: "var(--accent-soft)",
    desc: "Token has no public price — likely freshly deployed",
  },
  lp_withdrawal: {
    label: "LP WITHDRAWAL",
    bg: "rgba(245,158,11,0.12)",
    fg: "var(--warning, #f59e0b)",
    desc: "Liquidity provider exited the pool",
  },
  lp_burn_full: {
    label: "FULL LP BURN",
    bg: "rgba(239,68,68,0.18)",
    fg: "var(--danger)",
    desc: "Most or all of the LP position was burned",
  },
  treasury_outflow: {
    label: "TREASURY OUTFLOW",
    bg: "rgba(239,68,68,0.18)",
    fg: "var(--danger)",
    desc: "Funds left a known team or treasury wallet",
  },
  exchange_deposit: {
    label: "CEX DEPOSIT",
    bg: "rgba(168,85,247,0.15)",
    fg: "#a855f7",
    desc: "Tokens deposited to a centralized exchange — often pre-sell",
  },
  exchange_withdrawal: {
    label: "CEX WITHDRAWAL",
    bg: "rgba(108,99,255,0.15)",
    fg: "var(--accent-soft)",
    desc: "Tokens withdrawn from a centralized exchange",
  },
  labeled_wallet_activity: {
    label: "LABELED WALLET",
    bg: "rgba(108,99,255,0.12)",
    fg: "var(--accent-soft)",
    desc: "One side is a known/labeled wallet",
  },
  lending_borrow: {
    label: "BORROW",
    bg: "rgba(168,85,247,0.15)",
    fg: "#a855f7",
    desc: "Tokens borrowed from a lending protocol",
  },
  liquidation: {
    label: "LIQUIDATION",
    bg: "rgba(239,68,68,0.18)",
    fg: "var(--danger)",
    desc: "Position liquidated — borrower's collateral was seized",
  },
  stable_swap: {
    label: "STABLE SWAP",
    bg: "rgba(108,99,255,0.12)",
    fg: "var(--accent-soft)",
    desc: "Stablecoin-pair exchange (Curve-style)",
  },
};

function shorten(addr: string): string {
  if (!addr) return "—";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
