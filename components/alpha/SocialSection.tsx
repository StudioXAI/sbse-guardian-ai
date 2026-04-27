"use client";

import { useEffect, useState } from "react";
import type { SocialPost } from "@/lib/alpha/types";
import { alphaGet } from "@/lib/alpha/client";
import { timeAgo } from "@/lib/alpha/format";

const INFI_X_URL = "https://x.com/INFI_MultiChain";
const INFI_LINKEDIN_URL = "https://www.linkedin.com/company/infi-multichain-cdex/";

export default function SocialSection() {
  const [posts, setPosts] = useState<SocialPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await alphaGet<SocialPost[]>("/api/alpha/social");
      if (!cancelled) setPosts(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const x = (posts ?? []).filter((p) => p.platform === "x");
  const li = (posts ?? []).filter((p) => p.platform === "linkedin");

  function renderPost(p: SocialPost) {
    const Wrapper = p.sourceUrl ? "a" : "div";
    const wrapperProps = p.sourceUrl
      ? {
          href: p.sourceUrl,
          target: "_blank" as const,
          rel: "noopener noreferrer",
        }
      : {};

    return (
      <Wrapper
        key={p.id}
        {...wrapperProps}
        className="block p-4 rounded-lg mb-3 transition-colors"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          textDecoration: "none",
          color: "inherit",
          cursor: p.sourceUrl ? "pointer" : "default",
        }}
      >
        <div className="flex items-center justify-between mb-2 gap-2">
          <div>
            <div className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>
              {p.author}
              {p.authorHandle && (
                <span
                  className="ml-2 font-normal"
                  style={{ color: "var(--fg-dim)", fontSize: "11px" }}
                >
                  {p.authorHandle}
                </span>
              )}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
              {p.platform === "x" ? "X" : "LinkedIn"}
              {p.authorRole ? ` · ${p.authorRole}` : ""} · {timeAgo(p.timestamp)}
            </div>
          </div>
          {p.sourceUrl && (
            <span
              className="text-[11px] font-mono"
              style={{ color: "var(--accent-soft)" }}
            >
              Open ↗
            </span>
          )}
        </div>

        <p className="text-[13px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          &ldquo;{p.text}&rdquo;
        </p>

        {p.engagement && p.engagement !== "—" && (
          <div className="text-[10px] mt-2 font-mono" style={{ color: "var(--fg-dim)" }}>
            {p.engagement}
          </div>
        )}

        {p.aiNote && !p.sourceUrl && (
          <div
            className="mt-3 p-2 rounded-md text-[11px] leading-snug"
            style={{
              borderLeft: "2px solid var(--accent)",
              background: "var(--accent-dim)",
              color: "var(--accent-soft)",
            }}
          >
            {p.aiNote}
          </div>
        )}
      </Wrapper>
    );
  }

  return (
    <div className="space-y-5">
      {/* Direct-link header — always visible regardless of API state */}
      <div
        className="card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
        style={{ borderLeft: "3px solid var(--accent)" }}
      >
        <div>
          <div className="label-xs mb-1" style={{ color: "var(--accent-soft)" }}>
            Official INFI MultiChain channels
          </div>
          <div className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            Track ecosystem announcements, InvertX countdown, and partnership news
            directly from source.
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <a
            href={INFI_X_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-md font-mono transition-colors"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--fg)",
              border: "1px solid var(--border)",
              fontSize: "11px",
              letterSpacing: "0.05em",
              textDecoration: "none",
            }}
          >
            𝕏 @INFI_MultiChain ↗
          </a>
          <a
            href={INFI_LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-md font-mono transition-colors"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--fg)",
              border: "1px solid var(--border)",
              fontSize: "11px",
              letterSpacing: "0.05em",
              textDecoration: "none",
            }}
          >
            in LinkedIn ↗
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
              X · @INFI_MultiChain
            </div>
            <span
              className="text-[10px] px-2 py-1 rounded-full font-mono"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent-soft)",
                letterSpacing: "0.05em",
              }}
            >
              {posts === null ? "…" : x.length > 1 ? "LIVE" : "LINK"}
            </span>
          </div>
          {posts === null ? (
            <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
              Loading…
            </div>
          ) : x.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
              No posts.
            </div>
          ) : (
            x.map(renderPost)
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="label-sm" style={{ color: "var(--fg-muted)" }}>
              LinkedIn · INFI MultiChain CDEX
            </div>
            <span
              className="text-[10px] px-2 py-1 rounded-full font-mono"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent-soft)",
                letterSpacing: "0.05em",
              }}
            >
              LINK
            </span>
          </div>
          {posts === null ? (
            <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
              Loading…
            </div>
          ) : li.length === 0 ? (
            <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
              No posts.
            </div>
          ) : (
            li.map(renderPost)
          )}
        </div>
      </div>
    </div>
  );
}
