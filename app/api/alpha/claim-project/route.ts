/* ─────────────────────────────────────────────────────────────
   POST /api/alpha/claim-project

   Accepts a project-team claim submission and forwards it to
   support@infimultichain.com via Resend (which the project
   already uses for watchlist alerts).

   Includes:
   - Light validation (required fields, length caps, format checks)
   - Rate limiting per IP (basic in-memory token bucket — best
     effort, doesn't survive serverless cold starts)
   - Subject-line prefix [INFI Claim] so the BD team can mail-rule
   - Honeypot field to filter trivial bot submissions

   This is NOT a fully secured form — it's a simple lead-capture
   endpoint. Real spam protection requires Captcha or similar,
   which we can add later if abuse becomes an issue.
   ───────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPPORT_EMAIL = "support@infimultichain.com";

/* ═══════════════════════════════════════════════════════════ */
/* Validation                                                   */
/* ═══════════════════════════════════════════════════════════ */

interface ClaimSubmission {
  contractAddress: string;
  chain: string;
  chainId: number;
  symbol: string;
  teamEmail: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  description?: string;
  /** Honeypot — humans don't fill this. If non-empty, reject silently. */
  __hp?: string;
  /** Cloudflare Turnstile token from the client widget. Required
      when TURNSTILE_SECRET_KEY is set (production). */
  turnstileToken?: string;
}

function validate(body: unknown): { ok: true; data: ClaimSubmission } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid request body" };
  }
  const b = body as Record<string, unknown>;

  /* Honeypot check — silent rejection, return success to confuse bots */
  if (typeof b.__hp === "string" && b.__hp.length > 0) {
    return { ok: false, error: "" };
  }

  /* Required fields */
  const contractAddress = String(b.contractAddress ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(contractAddress)) {
    return { ok: false, error: "Invalid contract address" };
  }
  const chain = String(b.chain ?? "").trim();
  if (chain.length === 0 || chain.length > 30) {
    return { ok: false, error: "Invalid chain" };
  }
  const chainId = Number(b.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return { ok: false, error: "Invalid chain ID" };
  }
  const symbol = String(b.symbol ?? "").trim();
  if (symbol.length === 0 || symbol.length > 12) {
    return { ok: false, error: "Invalid symbol" };
  }
  const teamEmail = String(b.teamEmail ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teamEmail) || teamEmail.length > 254) {
    return { ok: false, error: "Invalid email address" };
  }

  /* Optional fields with length caps */
  const twitter = b.twitter ? String(b.twitter).trim().slice(0, 100) : undefined;
  const telegram = b.telegram ? String(b.telegram).trim().slice(0, 100) : undefined;
  const website = b.website ? String(b.website).trim().slice(0, 200) : undefined;
  const description = b.description ? String(b.description).trim().slice(0, 1000) : undefined;
  const turnstileToken = b.turnstileToken ? String(b.turnstileToken).trim() : undefined;

  return {
    ok: true,
    data: {
      contractAddress,
      chain,
      chainId,
      symbol,
      teamEmail,
      twitter,
      telegram,
      website,
      description,
      turnstileToken,
    },
  };
}

/* ═══════════════════════════════════════════════════════════ */
/* Rate limiting (best-effort, in-memory)                       */
/* ═══════════════════════════════════════════════════════════ */

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5; // submissions per window
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1h

function rateLimit(ip: string): { allowed: boolean; resetIn?: number } {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, resetIn: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true };
}

/* ═══════════════════════════════════════════════════════════ */
/* Email body                                                   */
/* ═══════════════════════════════════════════════════════════ */

function buildEmailHtml(data: ClaimSubmission): string {
  const safe = (v: string | undefined) =>
    v ? v.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c)) : "—";

  return `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 600px;">
    <h2 style="color: #6c63ff;">New Project Claim — SbSe Guardian</h2>
    <p>A project team has claimed their listing on the SbSe Guardian New Projects feed.</p>
    <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Token Symbol</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe(data.symbol)}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Contract Address</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 12px;">${safe(data.contractAddress)}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Chain</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe(data.chain)} (chainId ${data.chainId})</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Team Email</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="mailto:${safe(data.teamEmail)}">${safe(data.teamEmail)}</a></td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Twitter</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe(data.twitter)}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Telegram</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe(data.telegram)}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Website</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe(data.website)}</td></tr>
    </table>
    ${data.description ? `<h3 style="margin-top: 24px;">Description</h3><p style="background: #f5f5f5; padding: 12px; border-radius: 6px; white-space: pre-wrap;">${safe(data.description)}</p>` : ""}
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
    <p style="color: #888; font-size: 12px;">Verify project ownership before responding. The deployer wallet is on-chain at the contract address — check that the team email contact has a credible association with the deployer.</p>
  </body></html>`;
}

/* ═══════════════════════════════════════════════════════════ */
/* Cloudflare Turnstile verification                            */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Verify a Turnstile token with Cloudflare's siteverify API.
 * Returns true on success.
 *
 * Behavior when TURNSTILE_SECRET_KEY is not set:
 *   - In production (NODE_ENV === "production"): refuse all
 *     submissions. Better to hard-fail than ship a security
 *     feature that silently doesn't apply.
 *   - In dev (NODE_ENV !== "production"): fall open and skip
 *     verification, so local development works without the key.
 *
 * Tokens are single-use and expire after 5 minutes per
 * Cloudflare's spec. We don't need to track replay ourselves —
 * Cloudflare's siteverify rejects already-redeemed tokens.
 */
async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  /* Dev mode fall-through */
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[claim-project] TURNSTILE_SECRET_KEY not set in production — rejecting all submissions",
      );
      return { ok: false, reason: "Bot protection not configured" };
    }
    return { ok: true };
  }

  /* Production: token is required */
  if (!token) {
    return { ok: false, reason: "Bot challenge not completed" };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
      remoteip: remoteIp,
    });
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );
    if (!res.ok) {
      console.error("[claim-project] Turnstile siteverify HTTP", res.status);
      return { ok: false, reason: "Bot check failed — please try again" };
    }
    const data = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) {
      console.error(
        "[claim-project] Turnstile rejected token:",
        data["error-codes"]?.join(", "),
      );
      return { ok: false, reason: "Bot check failed — please try again" };
    }
    return { ok: true };
  } catch (err) {
    console.error("[claim-project] Turnstile fetch error:", err);
    return { ok: false, reason: "Bot check unavailable — please try again" };
  }
}

/* ═══════════════════════════════════════════════════════════ */
/* Handler                                                      */
/* ═══════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.WATCHLIST_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return NextResponse.json(
      { ok: false, error: "Email service not configured" },
      { status: 503 },
    );
  }

  /* Rate limit by IP */
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many submissions. Try again in ${rl.resetIn} seconds.`,
      },
      { status: 429 },
    );
  }

  /* Parse + validate */
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  const validation = validate(body);
  if (!validation.ok) {
    /* Honeypot triggered — return ok to confuse bots, but don't send mail. */
    if (validation.error === "") {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400 },
    );
  }

  const data = validation.data;

  /* Turnstile verification — required in production. */
  const turnstileResult = await verifyTurnstile(data.turnstileToken, ip);
  if (!turnstileResult.ok) {
    return NextResponse.json(
      { ok: false, error: turnstileResult.reason },
      { status: 403 },
    );
  }

  /* Send via Resend */
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: SUPPORT_EMAIL,
        reply_to: data.teamEmail,
        subject: `[INFI Claim] ${data.symbol} on ${data.chain} — ${data.contractAddress.slice(0, 10)}…`,
        html: buildEmailHtml(data),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[claim-project] Resend error:", res.status, text);
      return NextResponse.json(
        { ok: false, error: "Failed to deliver claim. Please try again later." },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("[claim-project] Send failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to deliver claim. Please try again later." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
