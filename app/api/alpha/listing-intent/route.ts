/* ─────────────────────────────────────────────────────────────
   POST /api/alpha/listing-intent

   Captures listing intent submitted at deploy time. The user has
   just deployed (or is about to deploy) a contract through the
   wizard, and they tell us how they want to engage with the
   INFI Launchpad: USDT presale, USDT direct, InvertX direct
   (Q2-Q3 2026), or InvertX liquidity borrowing.

   Sends to support@infimultichain.com with the [INFI Listing
   Intent] subject prefix so the BD team can route appropriately.

   Same security profile as the claim-project endpoint:
   - Honeypot field
   - IP rate limit (5/hour)
   - Cloudflare Turnstile (when configured)
   ───────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SUPPORT_EMAIL = "support@infimultichain.com";

type ListingIntent =
  | "usdt-presale"
  | "usdt-direct"
  | "invertx-direct"
  | "invertx-borrowing"
  | "undecided";

interface IntentSubmission {
  /** Contract that was (or will be) deployed. */
  contractAddress: string;
  chain: string;
  symbol: string;
  /** What the user wants to do next. */
  intent: ListingIntent;
  teamEmail: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  description?: string;
  __hp?: string;
  turnstileToken?: string;
}

const VALID_INTENTS: ListingIntent[] = [
  "usdt-presale",
  "usdt-direct",
  "invertx-direct",
  "invertx-borrowing",
  "undecided",
];

const INTENT_LABELS: Record<ListingIntent, string> = {
  "usdt-presale": "USDT Presale on INFI Launchpad",
  "usdt-direct": "USDT Direct Listing on INFI Launchpad",
  "invertx-direct": "InvertX Direct Launch (Q2-Q3 2026)",
  "invertx-borrowing": "InvertX Liquidity Borrowing",
  undecided: "Undecided / Wants to discuss",
};

function validate(body: unknown): { ok: true; data: IntentSubmission } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid body" };
  }
  const b = body as Record<string, unknown>;

  /* Honeypot */
  if (typeof b.__hp === "string" && b.__hp.length > 0) {
    return { ok: false, error: "" };
  }

  const contractAddress = String(b.contractAddress ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(contractAddress)) {
    return { ok: false, error: "Invalid contract address" };
  }
  const chain = String(b.chain ?? "").trim();
  if (chain.length === 0 || chain.length > 30) {
    return { ok: false, error: "Invalid chain" };
  }
  const symbol = String(b.symbol ?? "").trim();
  if (symbol.length === 0 || symbol.length > 12) {
    return { ok: false, error: "Invalid symbol" };
  }
  const intent = String(b.intent ?? "") as ListingIntent;
  if (!VALID_INTENTS.includes(intent)) {
    return { ok: false, error: "Invalid intent option" };
  }
  const teamEmail = String(b.teamEmail ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(teamEmail) || teamEmail.length > 254) {
    return { ok: false, error: "Invalid email address" };
  }

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
      symbol,
      intent,
      teamEmail,
      twitter,
      telegram,
      website,
      description,
      turnstileToken,
    },
  };
}

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

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

async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "Bot protection not configured" };
    }
    return { ok: true };
  }
  if (!token) {
    return { ok: false, reason: "Bot challenge not completed" };
  }
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: remoteIp });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) return { ok: false, reason: "Bot check failed — please try again" };
    const data = (await res.json()) as { success: boolean };
    return data.success ? { ok: true } : { ok: false, reason: "Bot check failed — please try again" };
  } catch {
    return { ok: false, reason: "Bot check unavailable — please try again" };
  }
}

function buildEmailHtml(data: IntentSubmission): string {
  const safe = (v: string | undefined) =>
    v ? v.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] ?? c)) : "—";

  return `<!DOCTYPE html><html><body style="font-family: -apple-system, sans-serif; max-width: 600px;">
    <h2 style="color: #6c63ff;">New Listing Intent — INFI Deploy Wizard</h2>
    <p>A project team deployed a contract through the SbSe Guardian deploy wizard and submitted listing intent.</p>
    <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Token Symbol</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe(data.symbol)}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Contract</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 12px;">${safe(data.contractAddress)}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Chain</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe(data.chain)}</td></tr>
      <tr style="background: rgba(108,99,255,0.06);"><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Listing Path</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${INTENT_LABELS[data.intent]}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Team Email</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="mailto:${safe(data.teamEmail)}">${safe(data.teamEmail)}</a></td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Twitter</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe(data.twitter)}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Telegram</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe(data.telegram)}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Website</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safe(data.website)}</td></tr>
    </table>
    ${data.description ? `<h3 style="margin-top: 24px;">Description</h3><p style="background: #f5f5f5; padding: 12px; border-radius: 6px; white-space: pre-wrap;">${safe(data.description)}</p>` : ""}
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
    <p style="color: #888; font-size: 12px;">Contract was deployed through the official deploy wizard, so it is INFI verified by definition. Reach out promptly — these are warm leads at peak engagement.</p>
  </body></html>`;
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.WATCHLIST_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return NextResponse.json(
      { ok: false, error: "Email service not configured" },
      { status: 503 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: `Too many submissions. Try again in ${rl.resetIn} seconds.` },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validate(body);
  if (!validation.ok) {
    if (validation.error === "") {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const data = validation.data;

  const ts = await verifyTurnstile(data.turnstileToken, ip);
  if (!ts.ok) {
    return NextResponse.json({ ok: false, error: ts.reason }, { status: 403 });
  }

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
        subject: `[INFI Listing Intent] ${data.symbol} on ${data.chain} — ${INTENT_LABELS[data.intent]}`,
        html: buildEmailHtml(data),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[listing-intent] Resend error:", res.status, text);
      return NextResponse.json(
        { ok: false, error: "Failed to deliver. Please try again later." },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("[listing-intent] Send failed:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to deliver. Please try again later." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
