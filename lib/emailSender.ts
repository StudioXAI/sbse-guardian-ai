/* ─────────────────────────────────────────────────────────────
   Email sender via Resend
   Graceful fallback: if RESEND_API_KEY isn't set, logs to console
   and returns {sent:false, reason:"no_api_key"} without throwing.
   User can still use the watchlist — they just won't get emails.
   ───────────────────────────────────────────────────────────── */

import { debug } from "./constants";

const RESEND_API = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.WATCHLIST_FROM_EMAIL || "SbSe Guardian <onboarding@resend.dev>";

  if (!apiKey) {
    debug("RESEND_API_KEY not set — email send skipped");
    return { sent: false, reason: "no_api_key" };
  }

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      debug("Resend API error:", res.status, body);
      return { sent: false, reason: `http_${res.status}` };
    }

    const data = await res.json();
    return { sent: true, id: data?.id };
  } catch (e) {
    debug("Email send failed:", e);
    return { sent: false, reason: "exception" };
  }
}

/** Branded email template for watchlist alerts. */
export function renderWatchlistAlertEmail(args: {
  projectName: string;
  contractAddress: string;
  chainName: string;
  changes: string[];
  reportUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `SbSe Guardian alert: ${args.projectName} — ${args.changes.length} change${args.changes.length > 1 ? "s" : ""} detected`;

  const bulletsHtml = args.changes
    .map((c) => `<li style="margin:6px 0;color:#ededed;">${escapeHtml(c)}</li>`)
    .join("");

  const bulletsText = args.changes.map((c) => `  • ${c}`).join("\n");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#07080a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#0d0f14;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:32px;">
    <div style="color:#6c63ff;font-family:monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:8px;">SbSe Guardian · Watchlist Alert</div>
    <h1 style="color:#fff;font-size:22px;font-weight:600;margin:0 0 16px;letter-spacing:-0.02em;">
      ${escapeHtml(args.projectName)} — changes detected
    </h1>
    <p style="color:rgba(237,237,237,0.7);font-size:14px;line-height:1.6;margin:0 0 20px;">
      You're watching <code style="background:#07080a;padding:2px 6px;border-radius:4px;color:#8b84ff;">${escapeHtml(args.contractAddress)}</code> on ${escapeHtml(args.chainName)}. Something changed since last check:
    </p>
    <ul style="padding-left:20px;margin:0 0 24px;">${bulletsHtml}</ul>
    <a href="${escapeHtml(args.reportUrl)}" style="display:inline-block;background:#6c63ff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">
      Re-scan contract →
    </a>
    <p style="color:rgba(237,237,237,0.4);font-size:11px;line-height:1.5;margin:32px 0 0;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);">
      Automated signal, not financial advice. SbSe Guardian analyzes on-chain state; it cannot predict prices.
      <br><br>
      <a href="${escapeHtml(args.unsubscribeUrl)}" style="color:rgba(237,237,237,0.5);">Remove from watchlist</a>
    </p>
  </div>
</body>
</html>`;

  const text = `SbSe Guardian Watchlist Alert

${args.projectName} — changes detected

You're watching ${args.contractAddress} on ${args.chainName}. Changes:

${bulletsText}

Re-scan: ${args.reportUrl}
Unsubscribe: ${args.unsubscribeUrl}

Automated signal, not financial advice.`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
