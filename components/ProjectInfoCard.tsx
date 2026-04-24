"use client";

import type { AuditReport } from "@/lib/types";
import PriceChart from "./PriceChart";
import {
  TwitterIcon,
  TelegramIcon,
  DiscordIcon,
  GitHubIcon,
  MediumIcon,
  RedditIcon,
  WebsiteIcon,
} from "./SocialIcons";

export default function ProjectInfoCard({ report }: { report: AuditReport }) {
  const hasAnySocial =
    !!report.socials?.twitter ||
    !!report.socials?.telegram ||
    !!report.socials?.discord ||
    !!report.socials?.github ||
    !!report.socials?.medium ||
    !!report.socials?.reddit;

  const tokenSymbol = (report.project || "").match(/\(([^)]+)\)/)?.[1];

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
        <span className="label-xs">CoinGecko + DexScreener</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <PriceChart
            contractAddress={report.contractAddress}
            chain={report.chain}
            tokenSymbol={tokenSymbol}
          />
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
              <div className="label-xs mb-2" style={{ color: "var(--fg-dim)" }}>
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
          {hasAnySocial && (
            <div>
              <div className="label-xs mb-2" style={{ color: "var(--fg-dim)" }}>
                Socials
              </div>
              <div className="flex flex-wrap gap-2">
                {report.socials?.twitter && (
                  <SocialLink
                    href={report.socials.twitter}
                    icon={<TwitterIcon size={16} />}
                    label="Twitter"
                  />
                )}
                {report.socials?.telegram && (
                  <SocialLink
                    href={report.socials.telegram}
                    icon={<TelegramIcon size={16} />}
                    label="Telegram"
                  />
                )}
                {report.socials?.discord && (
                  <SocialLink
                    href={report.socials.discord}
                    icon={<DiscordIcon size={16} />}
                    label="Discord"
                  />
                )}
                {report.socials?.github && (
                  <SocialLink
                    href={report.socials.github}
                    icon={<GitHubIcon size={16} />}
                    label="GitHub"
                  />
                )}
                {report.socials?.medium && (
                  <SocialLink
                    href={report.socials.medium}
                    icon={<MediumIcon size={16} />}
                    label="Medium"
                  />
                )}
                {report.socials?.reddit && (
                  <SocialLink
                    href={report.socials.reddit}
                    icon={<RedditIcon size={16} />}
                    label="Reddit"
                  />
                )}
              </div>
            </div>
          )}
          {!hasAnySocial && !report.website && (
            <div
              className="text-xs italic pt-3"
              style={{ color: "var(--fg-dim)", borderTop: "1px solid var(--border)" }}
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
      <div className="label-xs mb-1" style={{ color: "var(--fg-dim)" }}>
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
