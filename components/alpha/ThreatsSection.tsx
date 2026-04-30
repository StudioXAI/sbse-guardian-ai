"use client";

import { useCallback, useEffect, useState } from "react";
import type { ThreatsPayload } from "@/lib/alpha/threatTracker";
import { alphaGet } from "@/lib/alpha/client";
import { useAutoRefresh } from "@/lib/alpha/useAutoRefresh";
import { useRefreshContext } from "@/lib/alpha/refreshContext";
import { formatUsd, timeAgo } from "@/lib/alpha/format";
import SuspiciousSellsPanel from "./SuspiciousSellsPanel";
import RiskEventsPanel from "./RiskEventsPanel";
import FundFlowTracer from "./FundFlowTracer";

const REFRESH_MS = 90_000;

type ThreatTab = "sells" | "events" | "tracer";

export default function ThreatsSection() {
  const { reportRefresh } = useRefreshContext();
  const [tab, setTab] = useState<ThreatTab>("sells");

  const loader = useCallback(async () => {
    return alphaGet<ThreatsPayload>("/api/alpha/threats");
  }, []);

  const { data, lastRefreshedAt } = useAutoRefresh<ThreatsPayload>(
    loader,
    REFRESH_MS,
  );

  useEffect(() => {
    if (lastRefreshedAt !== null) reportRefresh();
  }, [lastRefreshedAt, reportRefresh]);

  return (
    <div className="space-y-5">
      {/* Honest framing banner */}
      <div
        className="card p-4"
        style={{ borderLeft: "3px solid var(--warning, #f59e0b)" }}
      >
        <div
          className="label-xs mb-2"
          style={{
            color: "var(--warning, #f59e0b)",
            letterSpacing: "0.05em",
          }}
        >
          Threat scanner · Live on-chain DEX scan
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          Live scan of every Uniswap V2/V3, Curve, Balancer V2 swap, every
          LP burn, every Aave borrow + liquidation, and every $50K+ ERC20
          transfer in the last ~30 blocks across enabled chains. No
          hardcoded token list — every token that traded is automatically
          considered. Surfaces top-8 per category, ranked by severity.
          Also tracks dangerous function calls (mint, transferOwnership,
          removeLiquidity etc.) on tracked contracts and traces fund flow
          up to 3 hops.{" "}
          <span style={{ color: "var(--fg-dim)" }}>
            Detection is post-confirmation only — typically 60–180s after
            an event is mined. Mempool monitoring (pending transactions)
            requires additional paid infrastructure.
          </span>
        </p>
      </div>

      {/* Stats strip */}
      {data && !data.unconfigured && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            label="Total flagged"
            value={(
              data.groups.dexSwaps.length +
              data.groups.liquidityRemovals.length +
              data.groups.lendingActivity.length +
              data.groups.largeTransfers.length
            ).toString()}
            colorVar="var(--danger)"
          />
          <StatCard
            label="Risk events (6h)"
            value={data.riskEvents.length.toString()}
            colorVar="var(--warning, #f59e0b)"
          />
          <StatCard
            label="Chains scanned"
            value={data.chainsScanned.length.toString()}
          />
          <StatCard
            label="Last scan"
            value={timeAgo(data.generatedAt)}
            colorVar="var(--accent-soft)"
          />
        </div>
      )}

      {data?.unconfigured && (
        <div
          className="card p-4"
          style={{ borderLeft: "3px solid var(--danger)" }}
        >
          <div className="label-xs mb-2" style={{ color: "var(--danger)" }}>
            No data sources configured
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            The threat scanner needs at minimum a QuickNode RPC endpoint
            (<code style={{ color: "var(--accent-soft)" }}>QUICKNODE_BASE_URL</code>)
            for live blockchain scanning, or an{" "}
            <code style={{ color: "var(--accent-soft)" }}>ETHERSCAN_API_KEY</code>{" "}
            for risk-event detection. Add at least one to your Vercel
            environment variables to enable this feature.
          </p>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        <SubTab
          active={tab === "sells"}
          label="Suspicious activity"
          sub={`Multi-protocol${
            data
              ? ` · ${
                  data.groups.dexSwaps.length +
                  data.groups.liquidityRemovals.length +
                  data.groups.lendingActivity.length +
                  data.groups.largeTransfers.length
                } flagged`
              : ""
          }`}
          onClick={() => setTab("sells")}
        />
        <SubTab
          active={tab === "events"}
          label="Risk events"
          sub={`Dangerous calls${
            data ? ` · ${data.riskEvents.length} flagged` : ""
          }`}
          onClick={() => setTab("events")}
        />
        <SubTab
          active={tab === "tracer"}
          label="Fund flow tracer"
          sub="Trace any wallet · 1–3 hops"
          onClick={() => setTab("tracer")}
        />
      </div>

      {/* Active panel */}
      {tab === "sells" && <SuspiciousSellsPanel data={data} />}
      {tab === "events" && <RiskEventsPanel data={data} />}
      {tab === "tracer" && <FundFlowTracer />}

      {/* Disclaimer */}
      <div
        className="card p-3"
        style={{
          background: "var(--bg-subtle)",
          borderColor: "var(--border)",
        }}
      >
        <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          Forensic analysis tool. Not legal advice or proof of malicious
          intent — flagged transactions may have legitimate explanations.
          Always verify findings independently before drawing conclusions.
          Detection is post-confirmation only — does not prevent or predict
          attacks. SbSe Guardian Alpha is non-custodial: no execution, no
          custody, no KYC.
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
      <div
        className="font-mono"
        style={{ fontSize: "11px", letterSpacing: "0.06em" }}
      >
        {label}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
        {sub}
      </div>
    </button>
  );
}

function StatCard({
  label,
  value,
  colorVar = "var(--fg)",
}: {
  label: string;
  value: string;
  colorVar?: string;
}) {
  return (
    <div className="card p-3">
      <div className="label-xs" style={{ color: "var(--fg-dim)" }}>
        {label}
      </div>
      <div
        className="font-mono mt-1"
        style={{ color: colorVar, fontSize: "16px" }}
      >
        {value}
      </div>
    </div>
  );
}

/* Re-export so individual panels can import. */
export type { ThreatsPayload };
