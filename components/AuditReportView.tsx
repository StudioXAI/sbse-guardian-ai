"use client";

import { useState } from "react";
import type { AuditReport } from "@/lib/types";
import VerdictCard from "./VerdictCard";
import MetricCards from "./MetricCards";
import RiskDonut from "./RiskDonut";
import SecurityRadar from "./SecurityRadar";
import FindingsList from "./FindingsList";

export default function AuditReportView({
  report,
  onScanAnother,
}: {
  report: AuditReport;
  onScanAnother?: () => void;
}) {
  const [copied, setCopied] = useState<"addr" | "json" | null>(null);

  const handleCopy = async (what: "addr" | "json") => {
    try {
      const text =
        what === "addr" ? report.contractAddress : JSON.stringify(report, null, 2);
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignored */
    }
  };

  const shortAddr = `${report.contractAddress.slice(0, 6)}…${report.contractAddress.slice(-4)}`;

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-3 anim-fade-up"
        style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs tracking-[0.2em] uppercase"
                style={{ color: "var(--fg-dim)" }}>
            Scanned
          </span>
          <button
            onClick={() => handleCopy("addr")}
            className="font-mono text-sm truncate hover:opacity-70 transition-opacity"
            style={{ color: "var(--fg)" }}
            title="Copy contract address"
          >
            {shortAddr}
            {copied === "addr" && (
              <span className="ml-2" style={{ color: "var(--amber)" }}>copied</span>
            )}
          </button>
        </div>

        <div className="flex gap-2">
          <IconButton
            label={copied === "json" ? "Copied" : "Copy JSON"}
            onClick={() => handleCopy("json")}
          />
          {onScanAnother && (
            <IconButton
              label="Scan another"
              onClick={onScanAnother}
              primary
            />
          )}
        </div>
      </div>

      <VerdictCard report={report} />

      <MetricCards report={report} />

      <div className="grid gap-6 lg:grid-cols-2">
        <RiskDonut report={report} />
        <SecurityRadar report={report} />
      </div>

      <FindingsList report={report} />

      {/* Footer meta */}
      <div
        className="rounded-2xl border p-6 anim-fade-up"
        style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      >
        <div className="grid gap-x-8 gap-y-4 grid-cols-2 md:grid-cols-4 text-sm">
          <Meta label="Chain" value={`${report.chain} (${report.chainIdNum})`} />
          <Meta label="Native Token" value={report.nativeToken} />
          <Meta label="Token Type" value={report.tokenType} />
          <Meta
            label="Compiler"
            value={report.compilerVersion?.split("+")[0] || "Unknown"}
            mono
          />
        </div>
        <p className="text-xs mt-6 pt-4 border-t"
           style={{ color: "var(--fg-dim)", borderColor: "var(--border)" }}>
          {report.beginnerExplanation}
        </p>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 rounded-lg font-mono text-xs tracking-[0.15em] uppercase transition-all hover:opacity-85"
      style={{
        background: primary ? "var(--amber)" : "transparent",
        color: primary ? "var(--bg)" : "var(--fg-muted)",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: primary ? "var(--amber)" : "var(--border-strong)",
      }}
    >
      {label}
    </button>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-1"
           style={{ color: "var(--fg-dim)" }}>
        {label}
      </div>
      <div className={mono ? "font-mono text-sm" : "text-sm"} style={{ color: "var(--fg)" }}>
        {value}
      </div>
    </div>
  );
}
