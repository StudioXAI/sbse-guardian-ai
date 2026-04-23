"use client";

import { useState } from "react";
import type { AuditReport } from "@/lib/types";
import VerdictCard from "./VerdictCard";
import AiSummaryCard from "./AiSummaryCard";
import MetricCards from "./MetricCards";
import ProjectInfoCard from "./ProjectInfoCard";
import RiskDonut from "./RiskDonut";
import SecurityRadar from "./SecurityRadar";
import FindingsList from "./FindingsList";
import PremiumUnlock from "./PremiumUnlock";

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
        what === "addr"
          ? report.contractAddress
          : JSON.stringify(report, null, 2);
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignored */
    }
  };

  const shortAddr = `${report.contractAddress.slice(
    0,
    6,
  )}…${report.contractAddress.slice(-4)}`;

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div
        className="card flex flex-wrap items-center justify-between gap-4 px-5 py-3 anim-fade-up"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="label-xs">Scanned</span>
          <button
            onClick={() => handleCopy("addr")}
            className="font-mono text-sm truncate hover:opacity-70 transition-opacity"
            style={{ color: "var(--fg)" }}
            title="Copy contract address"
          >
            {shortAddr}
            {copied === "addr" && (
              <span
                className="ml-2"
                style={{ color: "var(--accent-soft)" }}
              >
                copied
              </span>
            )}
          </button>
        </div>

        <div className="flex gap-2">
          <IconButton
            label={copied === "json" ? "Copied" : "Copy JSON"}
            onClick={() => handleCopy("json")}
          />
          {onScanAnother && (
            <IconButton label="Scan another" onClick={onScanAnother} primary />
          )}
        </div>
      </div>

      <VerdictCard report={report} />

      {/* AI Summary — renders null if not available */}
      <AiSummaryCard report={report} />

      <MetricCards report={report} />

      <ProjectInfoCard report={report} />

      <div className="grid gap-5 lg:grid-cols-2">
        <RiskDonut report={report} />
        <SecurityRadar report={report} />
      </div>

      <FindingsList report={report} />

      <PremiumUnlock report={report} />

      {/* Footer meta */}
      <div className="card p-7 anim-fade-up">
        <div
          className="grid gap-x-8 gap-y-4 text-sm"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          }}
        >
          <Meta
            label="Chain"
            value={`${report.chain} (${report.chainIdNum})`}
          />
          <Meta label="Native Token" value={report.nativeToken} />
          <Meta label="Token Type" value={report.tokenType} />
          <Meta
            label="Compiler"
            value={report.compilerVersion?.split("+")[0] || "Unknown"}
            mono
          />
        </div>
        <p
          className="text-xs mt-6 pt-4 border-t"
          style={{
            color: "var(--fg-dim)",
            borderColor: "var(--border)",
            lineHeight: 1.6,
          }}
        >
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
      className="px-4 py-2 rounded-lg font-mono transition-all hover:brightness-110"
      style={{
        fontSize: "11px",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        background: primary ? "var(--accent)" : "transparent",
        color: primary ? "#fff" : "var(--fg-muted)",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: primary ? "var(--accent)" : "var(--border-strong)",
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
      <div
        className="label-xs mb-1.5"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </div>
      <div
        className={mono ? "font-mono text-sm" : "text-sm"}
        style={{ color: "var(--fg)" }}
      >
        {value}
      </div>
    </div>
  );
}
