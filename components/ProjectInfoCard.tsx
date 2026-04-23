"use client";

import { useState, useEffect } from "react";
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
   Project Info Card — Hotfix
   The previous "fix" relied on iframe onLoad, which fires when
   the HTML shell loads but BEFORE DexScreener's JS loads the pair.
   So the timeout never fired because we thought we were loaded.

   This version:
   - Shows the iframe immediately (no skeleton gate)
   - Shows a "Chart slow? Open directly ↗" link after 6 seconds
   - Lets user always escape to DexScreener public URL
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
  return `https://dexscreener.com/${slug}/${contract}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15`;
}

function dexScreenerPublicUrl(chain: string, contract: string): string {
  const slug = CHAIN_SLUGS[chain.toLowerCase()] || "ethereum";
  return `https://dexscreener.com/${slug}/${contract}`;
}

export default function ProjectInfoCard({ report }: { report: AuditReport }) {
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSlowHint(true), 6_000);
    return () => clearTimeout(timer);
  }, []);

  const hasAnySocial =
    !!report.socials?.twitter ||
    !!report.socials?.telegram ||
    !!report.socials?.discord ||
    !!report.socials?.github ||
    !!report.socials?.medium ||
    !!report.socials?.reddit;

  const embedUrl = dexScreenerEmbedUrl(report.chain, report.contractAddress);
  const publicUrl = dexScreenerPublicUrl(report.chain, report.contractAddress);

  return (
    <section className="card p-7 anim-fade-up" aria-labelledby="project-info-title">
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
        <div className="relative">
          <div
            className="relative rounded-lg overflow-hidden border"
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
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs hover:underline"
              style={{ color: "var(--fg-dim)" }}
            >
              View on DexScreener ↗
            </a>
            {showSlowHint && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs hover:underline"
                style={{ color: "var(--accent-soft)" }}
              >
                Chart slow? Open directly ↗
              </a>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <InfoRow label="Project" value={report.project} />
          <InfoRow label="Token Type" value={report.tokenType} />
          <InfoRow label="Chain" value={`${report.chain} · ${report.chainIdNum}`} mono />
          {report.marketCap && report.marketCap !== "Unknown" && (
            <InfoRow label="Market Cap" value={report.marketCap} accent />
          )}
          {report.website && (
            <div>
              <div className="label-xs mb-2" style={{ color: "var(--fg-dim)" }}>Website</div>
              <a href={report.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm hover:underline transition-opacity hover:opacity-80" style={{ color: "var(--accent-soft)" }}>
                <WebsiteIcon size={16} />
                <span className="truncate">{prettyUrl(report.website)}</span>
              </a>
            </div>
          )}
          {hasAnySocial && (
            <div>
              <div className="label-xs mb-2" style={{ color: "var(--fg-dim)" }}>Socials</div>
              <div className="flex flex-wrap gap-2">
                {report.socials?.twitter && (<SocialLink href={report.socials.twitter} icon={<TwitterIcon size={16} />} label="Twitter" />)}
                {report.socials?.telegram && (<SocialLink href={report.socials.telegram} icon={<TelegramIcon size={16} />} label="Telegram" />)}
                {report.socials?.discord && (<SocialLink href={report.socials.discord} icon={<DiscordIcon size={16} />} label="Discord" />)}
                {report.socials?.github && (<SocialLink href={report.socials.github} icon={<GitHubIcon size={16} />} label="GitHub" />)}
                {report.socials?.medium && (<SocialLink href={report.socials.medium} icon={<MediumIcon size={16} />} label="Medium" />)}
                {report.socials?.reddit && (<SocialLink href={report.socials.reddit} icon={<RedditIcon size={16} />} label="Reddit" />)}
              </div>
            </div>
          )}
          {!hasAnySocial && !report.website && (
            <div className="text-xs italic pt-3" style={{ color: "var(--fg-dim)", borderTop: "1px solid var(--border)" }}>
              No project website or social profiles on record.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function InfoRow({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="label-xs mb-1" style={{ color: "var(--fg-dim)" }}>{label}</div>
      <div className={mono ? "font-mono text-sm" : "text-sm"} style={{ color: accent ? "var(--accent-soft)" : "var(--fg)", fontWeight: accent ? 500 : 400 }}>{value}</div>
    </div>
  );
}

function SocialLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all hover:brightness-125" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--fg)" }} aria-label={label} title={label}>
      {icon}
      <span>{label}</span>
    </a>
  );
}

function prettyUrl(url: string): string {
  try { const u = new URL(url); return u.host.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname); } catch { return url; }
}
