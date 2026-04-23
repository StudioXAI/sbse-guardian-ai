"use client";

import { useState } from "react";
import type { AuditReport } from "@/lib/types";
import {
  TwitterIcon,
  TelegramIcon,
  DiscordIcon,
  GitHubIcon,
  MediumIcon,
  RedditIcon,
  WebsiteIcon,
} from "./SocialIcons";

/* ─────────────────────────────────────────────────────────────
   Project Info Card
   Combines: live price chart (DexScreener iframe) + market cap +
   social media links with brand icons + website.

   Map our chainName to DexScreener's URL slug:
   - "Ethereum" -> "ethereum"
   - "BNB Smart Chain" -> "bsc"
   - "Polygon" -> "polygon"
   - "Base" -> "base"
   - "Arbitrum One" -> "arbitrum"
   - "OP Mainnet" -> "optimism"
   ───────────────────────────────────────────────────────────── */

const CHAIN_SLUGS: Record<string, string> = {
  "ethereum": "ethereum",
  "bnb smart chain": "bsc",
  "polygon": "polygon",
  "base": "base",
  "arbitrum one": "arbitrum",
  "op mainnet": "optimism",
  "avalanche": "avalanche",
  "fantom": "fantom",
};

function dexScreenerEmbedUrl(chain: string, contract: string): string {
  const slug = CHAIN_SLUGS[chain.toLowerCase()] || "ethereum";
  // DexScreener's official iframe URL format with dark theme + key metrics
  return `https://dexscreener.com/${slug}/${contract}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15`;
}

export default function ProjectInfoCard({ report }: { report: AuditReport }) {
  const [chartLoaded, setChartLoaded] = useState(false);
  const [chartFailed, setChartFailed] = useState(false);

  const hasAnySocial =
    !!report.socials?.twitter ||
    !!report.socials?.telegram ||
    !!report.socials?.discord ||
    !!report.socials?.github ||
    !!report.socials?.medium ||
    !!report.socials?.reddit;

  const embedUrl = dexScreenerEmbedUrl(report.chain, report.contractAddress);

  // Auto-declare chart failed after 8s if no load event
  if (typeof window !== "undefined") {
    setTimeout(() => {
      if (!chartLoaded) setChartFailed(true);
    }, 8000);
  }

  return (
    <section
      className="card p-7 anim-fade-up"
      aria-labelledby="project-info-title"
    >
      <div className="flex items-baseline justify-between gap-4 mb-5 flex-wrap">
        <h3
          id="project-info-title"
          className="text-xl font-semibold tracking-tight"
          style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}
        >
          Project Info
        </h3>
        <span className="label-xs">Live · DexScreener</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: Live price chart */}
        <div className="relative">
          <div
            className="rounded-lg overflow-hidden border"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-elevated)",
              minHeight: "340px",
            }}
          >
            <iframe
              src={embedUrl}
              title={`${report.project} live price chart`}
              style={{
                width: "100%",
                height: "340px",
                border: "none",
                display: "block",
              }}
              loading="lazy"
              onLoad={() => setChartLoaded(true)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            />
            {chartFailed && !chartLoaded && (
              <div
                className="absolute inset-0 flex items-center justify-center text-sm"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--fg-dim)",
                }}
              >
                Price chart unavailable — this token may not be indexed
              </div>
            )}
          </div>
          <a
            href={`https://dexscreener.com/${CHAIN_SLUGS[report.chain.toLowerCase()] || "ethereum"}/${report.contractAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-xs hover:underline"
            style={{ color: "var(--fg-dim)" }}
          >
            View on DexScreener ↗
          </a>
        </div>

        {/* Right: Metadata + socials */}
        <div className="space-y-4">
          {/* Identity */}
          <InfoRow label="Project" value={report.project} />
          <InfoRow label="Token Type" value={report.tokenType} />
          <InfoRow
            label="Chain"
            value={`${report.chain} · ${report.chainIdNum}`}
            mono
          />
          {report.marketCap && report.marketCap !== "Unknown" && (
            <InfoRow label="Market Cap" value={report.marketCap} accent />
          )}

          {/* Website */}
          {report.website && (
            <div>
              <div
                className="label-xs mb-2"
                style={{ color: "var(--fg-dim)" }}
              >
                Website
              </div>
              <a
                href={report.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm hover:underline transition-opacity hover:opacity-80"
                style={{ color: "var(--accent-soft)" }}
              >
                <WebsiteIcon size={16} />
                <span className="truncate">{prettyUrl(report.website)}</span>
              </a>
            </div>
          )}

          {/* Socials */}
          {hasAnySocial && (
            <div>
              <div
                className="label-xs mb-2"
                style={{ color: "var(--fg-dim)" }}
              >
                Socials
              </div>
              <div className="flex flex-wrap gap-2">
                {report.socials?.twitter && (
                  <SocialLink href={report.socials.twitter} icon={<TwitterIcon size={16} />} label="Twitter" />
                )}
                {report.socials?.telegram && (
                  <SocialLink href={report.socials.telegram} icon={<TelegramIcon size={16} />} label="Telegram" />
                )}
                {report.socials?.discord && (
                  <SocialLink href={report.socials.discord} icon={<DiscordIcon size={16} />} label="Discord" />
                )}
                {report.socials?.github && (
                  <SocialLink href={report.socials.github} icon={<GitHubIcon size={16} />} label="GitHub" />
                )}
                {report.socials?.medium && (
                  <SocialLink href={report.socials.medium} icon={<MediumIcon size={16} />} label="Medium" />
                )}
                {report.socials?.reddit && (
                  <SocialLink href={report.socials.reddit} icon={<RedditIcon size={16} />} label="Reddit" />
                )}
              </div>
            </div>
          )}

          {!hasAnySocial && !report.website && (
            <div
              className="text-xs italic pt-3"
              style={{
                color: "var(--fg-dim)",
                borderTop: "1px solid var(--border)",
              }}
            >
              No project website or social profiles on record.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function InfoRow({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className="label-xs mb-1"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </div>
      <div
        className={mono ? "font-mono text-sm" : "text-sm"}
        style={{
          color: accent ? "var(--accent-soft)" : "var(--fg)",
          fontWeight: accent ? 500 : 400,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SocialLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all hover:brightness-125"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: "var(--fg)",
      }}
      aria-label={label}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}
