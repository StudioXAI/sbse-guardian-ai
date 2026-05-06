"use client";

import { useEffect, useState } from "react";
import type { NewProject, ProjectSocials } from "@/lib/alpha/newProjectScanner";

const REFRESH_MS = 90_000;

interface ApiPayload {
  projects: NewProject[];
  chainsScanned: string[];
  unconfigured: boolean;
  scanStats: {
    totalCreations: number;
    totalTokens: number;
    perChain: Array<{
      chain: string;
      creations: number;
      tokens: number;
      blocksScanned: number;
    }>;
  };
  generatedAt: number;
}

export default function NewProjectsSection() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [chainFilter, setChainFilter] = useState<string>("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [claimingFor, setClaimingFor] = useState<NewProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/alpha/new-projects", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as ApiPayload;
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  /* Filter logic */
  const filtered = (data?.projects ?? []).filter((p) => {
    if (verifiedOnly && !p.infiVerified) return false;
    if (chainFilter !== "all" && p.chain !== chainFilter) return false;
    return true;
  });

  const verifiedCount = (data?.projects ?? []).filter((p) => p.infiVerified).length;
  const totalCount = data?.projects.length ?? 0;

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div
          className="font-mono text-[10px] tracking-[0.2em] uppercase"
          style={{ color: "var(--accent-soft)" }}
        >
          New Projects · Live discovery
        </div>
        <h1
          className="text-2xl md:text-3xl font-medium tracking-tight"
          style={{ color: "var(--fg)" }}
        >
          Newly deployed contracts
        </h1>
        <p
          className="text-[13px] max-w-2xl leading-relaxed"
          style={{ color: "var(--fg-muted)" }}
        >
          Live feed of newly-deployed ERC-20 contracts across all 6
          enabled chains. Projects launched via the INFI MultiChain
          Launchpad show a verified badge. If you're the team behind a
          listed project, claim your listing for INFI Launchpad
          consideration.
        </p>
      </div>

      {/* Methodology disclosure */}
      <div
        className="card p-3 text-[11px] leading-relaxed"
        style={{
          color: "var(--fg-dim)",
          borderLeft: "2px solid var(--border)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.1em]"
          style={{ color: "var(--fg-muted)" }}
        >
          Disclosure ·{" "}
        </span>
        Inclusion in this feed is not endorsement. Most newly-deployed
        contracts are scams, copies, or test launches. The INFI verified
        badge marks projects that have launched via INFI MultiChain
        Launchpad, governed by the SbSe Protocol. All other entries
        require independent verification before any interaction.
      </div>

      {/* Stats + filters */}
      {data && !data.unconfigured && (
        <div className="card p-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setVerifiedOnly(!verifiedOnly)}
              className="font-mono text-[11px] px-3 py-1.5 rounded transition-colors"
              style={{
                background: verifiedOnly
                  ? "linear-gradient(135deg, var(--accent), var(--accent-soft))"
                  : "var(--bg-elevated)",
                color: verifiedOnly ? "#fff" : "var(--fg-muted)",
                border: "none",
                cursor: "pointer",
                letterSpacing: "0.05em",
              }}
            >
              {verifiedOnly ? "✓ INFI VERIFIED" : "INFI VERIFIED"}
              <span
                className="ml-2 text-[9px] px-1.5 py-0.5 rounded"
                style={{
                  background: verifiedOnly
                    ? "rgba(255,255,255,0.2)"
                    : "var(--bg-subtle)",
                  color: verifiedOnly ? "#fff" : "var(--fg-dim)",
                }}
              >
                {verifiedCount}
              </span>
            </button>
            <select
              value={chainFilter}
              onChange={(e) => setChainFilter(e.target.value)}
              className="font-mono text-[11px] px-3 py-1.5 rounded"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--fg-muted)",
                border: "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              <option value="all">All chains</option>
              {data.chainsScanned.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div
            className="text-[10px] font-mono flex items-center gap-3"
            style={{ color: "var(--fg-dim)" }}
          >
            <span>
              {filtered.length} / {totalCount} shown
            </span>
            <span>·</span>
            <span>
              {data.scanStats.totalTokens.toLocaleString()} ERC-20s identified
              from {data.scanStats.totalCreations.toLocaleString()} contract
              creations this scan
            </span>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="card p-5">
          <div className="text-sm" style={{ color: "var(--fg-dim)" }}>
            Scanning recent blocks for newly-deployed contracts…
          </div>
        </div>
      )}

      {/* Unconfigured state */}
      {!loading && data?.unconfigured && (
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
            className="text-[13px] leading-relaxed"
            style={{ color: "var(--fg-muted)" }}
          >
            Discovery requires a QuickNode RPC endpoint. Configure
            <code style={{ color: "var(--accent-soft)" }}>
              {" "}
              QUICKNODE_BASE_URL{" "}
            </code>
            in your Vercel environment to enable.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && data && !data.unconfigured && filtered.length === 0 && (
        <div className="card p-5">
          <div
            className="font-mono text-[11px] mb-2"
            style={{ color: "var(--fg-dim)", letterSpacing: "0.05em" }}
          >
            NO PROJECTS MATCHING THE CURRENT FILTERS
          </div>
          <p
            className="text-[13px]"
            style={{ color: "var(--fg-muted)" }}
          >
            {verifiedOnly
              ? "No INFI-verified launches in the discovery feed yet. The first verified launches will appear here as projects ship through the INFI MultiChain Launchpad."
              : "The buffer hasn't filled up yet — refresh in 90 seconds. The feed populates over the lifetime of the serverless instance."}
          </p>
        </div>
      )}

      {/* Project feed */}
      {!loading && data && !data.unconfigured && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onClaim={() => setClaimingFor(project)}
            />
          ))}
        </div>
      )}

      {/* Claim modal */}
      {claimingFor && (
        <ClaimModal
          project={claimingFor}
          onClose={() => setClaimingFor(null)}
        />
      )}
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────
   Single project row
   ───────────────────────────────────────────────────────────── */

function ProjectRow({
  project,
  onClaim,
}: {
  project: NewProject;
  onClaim: () => void;
}) {
  const ageMin = Math.max(
    1,
    Math.floor((Date.now() - project.discoveredAt) / 60000),
  );

  /* Verified projects get a subtle gradient backdrop and accent
     border. Unverified projects use the standard card look. */
  const cardStyle: React.CSSProperties = project.infiVerified
    ? {
        background:
          "linear-gradient(135deg, rgba(34,209,96,0.06), rgba(108,99,255,0.04))",
        border: "1px solid rgba(34,209,96,0.3)",
        boxShadow: "0 0 0 1px rgba(34,209,96,0.15), 0 0 16px rgba(34,209,96,0.08)",
      }
    : {
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
      };

  return (
    <div className="rounded-xl p-4 transition-all" style={cardStyle}>
      {/* Top row: symbol + name + chain + verified badge + age */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span
            className="font-mono px-2 py-1 rounded font-medium"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--accent-soft)",
              fontSize: "12px",
              letterSpacing: "0.04em",
            }}
          >
            ${project.symbol}
          </span>
          <span
            className="text-[13px] truncate max-w-[280px]"
            style={{ color: "var(--fg)" }}
            title={project.name}
          >
            {project.name}
          </span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-[0.05em]"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--fg-dim)",
            }}
          >
            {project.chain}
          </span>
          {project.infiVerified && <VerifiedBadge />}
        </div>
        <span
          className="font-mono text-[10px]"
          style={{ color: "var(--fg-dim)" }}
        >
          {ageMin}m ago · block {project.blockNumber.toLocaleString()}
        </span>
      </div>

      {/* Metadata row: contract, deployer, socials */}
      <div className="space-y-1 text-[11px] mb-3">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-dim)", minWidth: "70px" }}>
            Contract:
          </span>
          <a
            href={project.contractUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--info)" }}
          >
            {shorten(project.contractAddress)}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--fg-dim)", minWidth: "70px" }}>
            Deployer:
          </span>
          <a
            href={project.deployerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--fg-muted)" }}
          >
            {shorten(project.deployer)}
          </a>
        </div>
        {project.socials && <SocialsRow socials={project.socials} />}
      </div>

      {/* Bottom row: tx link + claim button */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <a
          href={project.txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono hover:underline"
          style={{ color: "var(--accent-soft)", fontSize: "10px" }}
        >
          view deploy tx →
        </a>
        {!project.infiVerified && (
          <button
            type="button"
            onClick={onClaim}
            className="font-mono text-[10px] px-3 py-1.5 rounded transition-colors"
            style={{
              background: "var(--bg-subtle)",
              color: "var(--accent-soft)",
              border: "1px solid var(--accent-soft)",
              cursor: "pointer",
              letterSpacing: "0.05em",
            }}
          >
            CLAIM THIS LISTING
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   INFI verified badge — premium feel, distinct from other badges
   ───────────────────────────────────────────────────────────── */

function VerifiedBadge() {
  return (
    <span
      className="text-[9px] font-mono px-2 py-0.5 rounded-full uppercase tracking-[0.1em] inline-flex items-center gap-1"
      style={{
        background:
          "linear-gradient(135deg, rgba(34,209,96,0.9), rgba(34,200,224,0.9))",
        color: "#fff",
        border: "none",
        boxShadow: "0 0 8px rgba(34,209,96,0.4)",
      }}
      title="Launched via INFI MultiChain Launchpad — governed by the SbSe Protocol"
    >
      <span style={{ fontSize: "10px" }}>✓</span>
      INFI Verified
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Socials row — only renders when at least one social was found
   ───────────────────────────────────────────────────────────── */

function SocialsRow({ socials }: { socials: ProjectSocials }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span style={{ color: "var(--fg-dim)", minWidth: "70px" }}>
        Socials:
      </span>
      <div className="flex items-center gap-2 flex-wrap">
        {socials.website && (
          <SocialLink href={socials.website} label="Web" />
        )}
        {socials.twitter && (
          <SocialLink href={socials.twitter} label="Twitter" />
        )}
        {socials.telegram && (
          <SocialLink href={socials.telegram} label="Telegram" />
        )}
        {socials.discord && (
          <SocialLink href={socials.discord} label="Discord" />
        )}
        <span
          className="font-mono text-[9px] uppercase tracking-[0.05em]"
          style={{ color: "var(--fg-dim)" }}
          title={`Source: ${socials.source}`}
        >
          via {socials.source}
        </span>
      </div>
    </div>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-[10px] px-1.5 py-0.5 rounded hover:underline"
      style={{
        background: "var(--bg-subtle)",
        color: "var(--info)",
      }}
    >
      {label}
    </a>
  );
}

/* ─────────────────────────────────────────────────────────────
   Claim modal — opens when user clicks "Claim This Listing"
   ───────────────────────────────────────────────────────────── */

function ClaimModal({
  project,
  onClose,
}: {
  project: NewProject;
  onClose: () => void;
}) {
  const [teamEmail, setTeamEmail] = useState("");
  const [twitter, setTwitter] = useState(project.socials?.twitter ?? "");
  const [telegram, setTelegram] = useState(project.socials?.telegram ?? "");
  const [website, setWebsite] = useState(project.socials?.website ?? "");
  const [description, setDescription] = useState("");
  const [hp, setHp] = useState(""); // honeypot
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  /* Site key from public env var. When unset (local dev), the
     widget is skipped and the form falls back to honeypot-only. */
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const turnstileEnabled = Boolean(siteKey);

  /* Load Cloudflare's Turnstile script + render the widget into
     a target div. Using the global API directly rather than a
     npm package — keeps the bundle smaller and avoids version
     pinning. The script handles re-renders on its own. */
  useEffect(() => {
    if (!turnstileEnabled) return;
    const SCRIPT_ID = "cf-turnstile-script";
    if (document.getElementById(SCRIPT_ID)) {
      /* Script already loaded — just render the widget. */
      renderTurnstileWidget(siteKey!, setTurnstileToken);
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => renderTurnstileWidget(siteKey!, setTurnstileToken);
    document.head.appendChild(script);
    return () => {
      /* Don't remove the script — other modals may use it later.
         The widget itself gets cleaned up by React when the modal
         unmounts. */
    };
  }, [turnstileEnabled, siteKey]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    /* Block submit if Turnstile is enabled but token isn't ready */
    if (turnstileEnabled && !turnstileToken) {
      setErrorMsg("Please complete the bot challenge before submitting.");
      setResult("error");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/alpha/claim-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress: project.contractAddress,
          chain: project.chain,
          chainId: project.chainId,
          symbol: project.symbol,
          teamEmail,
          twitter: twitter.trim() || undefined,
          telegram: telegram.trim() || undefined,
          website: website.trim() || undefined,
          description: description.trim() || undefined,
          __hp: hp,
          turnstileToken: turnstileToken || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setResult("success");
      } else {
        setResult("error");
        setErrorMsg(json.error ?? "Submission failed");
      }
    } catch {
      setResult("error");
      setErrorMsg("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          {result === "success" ? (
            <SuccessState onClose={onClose} symbol={project.symbol} />
          ) : (
            <>
              <div className="mb-4">
                <div
                  className="font-mono text-[10px] tracking-[0.15em] uppercase mb-1"
                  style={{ color: "var(--accent-soft)" }}
                >
                  Claim listing
                </div>
                <h2
                  className="text-lg font-medium"
                  style={{ color: "var(--fg)" }}
                >
                  ${project.symbol} on {project.chain}
                </h2>
                <p
                  className="text-[12px] mt-2 leading-relaxed"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Confirm you're the team behind this contract. We'll
                  reach out from{" "}
                  <code style={{ color: "var(--accent-soft)" }}>
                    support@infimultichain.com
                  </code>{" "}
                  to discuss INFI MultiChain Launchpad listing options
                  (USDT direct/presale, InvertX direct, or InvertX
                  liquidity borrowing).
                </p>
              </div>

              <form onSubmit={submit} className="space-y-3">
                {/* Honeypot — hidden from humans */}
                <input
                  type="text"
                  name="hp"
                  value={hp}
                  onChange={(e) => setHp(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  style={{
                    position: "absolute",
                    left: "-9999px",
                    width: "1px",
                    height: "1px",
                  }}
                  aria-hidden="true"
                />

                <Field label="Team email *" required>
                  <input
                    type="email"
                    value={teamEmail}
                    onChange={(e) => setTeamEmail(e.target.value)}
                    required
                    placeholder="team@yourproject.com"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Twitter / X handle">
                  <input
                    type="text"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="https://twitter.com/yourproject"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Telegram">
                  <input
                    type="text"
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="https://t.me/yourproject"
                    style={inputStyle}
                  />
                </Field>

                <Field label="Website">
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://yourproject.com"
                    style={inputStyle}
                  />
                  <p
                    className="text-[10px] mt-1"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    No website yet? Our partner StudioX builds Web3
                    sites —{" "}
                    <a
                      href="https://studiox.build/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent-soft)" }}
                    >
                      studiox.build
                    </a>
                  </p>
                </Field>

                <Field label="Brief description">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="What does your project do? What stage are you at? What launchpad path interests you?"
                    style={{ ...inputStyle, resize: "vertical" as const }}
                  />
                </Field>

                {result === "error" && (
                  <div
                    className="text-[12px] p-2 rounded"
                    style={{
                      background: "rgba(239,68,68,0.1)",
                      color: "var(--danger)",
                    }}
                  >
                    {errorMsg}
                  </div>
                )}

                {/* Cloudflare Turnstile widget — only renders when
                    NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured. The
                    script and widget are loaded by the useEffect above. */}
                {turnstileEnabled && (
                  <div className="pt-1">
                    <div
                      id="cf-turnstile-container"
                      style={{ minHeight: "65px" }}
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="font-mono text-[11px] px-4 py-2 rounded"
                    style={{
                      background: "transparent",
                      color: "var(--fg-muted)",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="font-mono text-[11px] px-4 py-2 rounded"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--accent), var(--accent-soft))",
                      color: "#fff",
                      border: "none",
                      cursor: submitting ? "wait" : "pointer",
                      opacity: submitting ? 0.6 : 1,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {submitting ? "SENDING…" : "SUBMIT CLAIM"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SuccessState({
  onClose,
  symbol,
}: {
  onClose: () => void;
  symbol: string;
}) {
  return (
    <div className="text-center py-8">
      <div
        className="inline-block mb-4 text-3xl"
        style={{ color: "var(--success, #10b981)" }}
      >
        ✓
      </div>
      <h2
        className="text-lg font-medium mb-2"
        style={{ color: "var(--fg)" }}
      >
        Claim submitted
      </h2>
      <p
        className="text-[13px] max-w-sm mx-auto leading-relaxed mb-6"
        style={{ color: "var(--fg-muted)" }}
      >
        We've received your claim for ${symbol}. The INFI MultiChain
        team will respond from support@infimultichain.com within 1-2
        business days.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="font-mono text-[11px] px-4 py-2 rounded"
        style={{
          background: "var(--bg-elevated)",
          color: "var(--fg)",
          border: "1px solid var(--border)",
          cursor: "pointer",
          letterSpacing: "0.05em",
        }}
      >
        CLOSE
      </button>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="font-mono text-[10px] tracking-[0.1em] uppercase mb-1 block"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--danger)" }}> *</span>
        )}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--fg)",
  fontSize: "13px",
  fontFamily: "inherit",
  outline: "none",
};

function shorten(addr: string): string {
  if (!addr) return "—";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/* ─────────────────────────────────────────────────────────────
   Cloudflare Turnstile global

   The Turnstile script attaches a global `turnstile` object to
   window when it loads. We declare the minimal shape we use.
   ───────────────────────────────────────────────────────────── */

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

/**
 * Render the Turnstile widget into the container and wire its
 * success callback to update React state with the token. Token
 * is single-use and expires after 5 minutes — we don't track
 * expiry in state, the form submit will fail server-side if the
 * token has expired by then and the user can retry.
 */
function renderTurnstileWidget(
  siteKey: string,
  setToken: (t: string) => void,
): void {
  /* Wait briefly for the script to attach the global if it just
     loaded. Otherwise render immediately. */
  const tryRender = () => {
    if (typeof window === "undefined" || !window.turnstile) return false;
    const container = document.getElementById("cf-turnstile-container");
    if (!container) return false;
    /* Clear previous widget if any (modal reopen, etc) */
    container.innerHTML = "";
    try {
      window.turnstile.render(container, {
        sitekey: siteKey,
        theme: "dark",
        callback: (token: string) => setToken(token),
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      });
      return true;
    } catch {
      return false;
    }
  };

  if (tryRender()) return;
  /* Retry up to 10 times, 100ms apart, for late script load */
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    if (tryRender() || attempts > 10) clearInterval(interval);
  }, 100);
}
