/* ─────────────────────────────────────────────────────────────
   GET /api/pdf?wallet=0x..&contract=0x..&chainId=..
   Generates a branded PDF of the audit report.
   Gated: only works if (wallet, contract) has an active unlock.

   Stack: pdf-lib (pure TS, no native deps).
   ───────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from "pdf-lib";
import { isUnlocked, getUnlockInfo } from "@/lib/unlockStore";
import { debug } from "@/lib/constants";

const CONTRACT_REGEX = /^0x[a-fA-F0-9]{40}$/;

const COLORS = {
  bg: rgb(0.027, 0.031, 0.039),
  fg: rgb(0.93, 0.93, 0.93),
  muted: rgb(0.62, 0.62, 0.62),
  dim: rgb(0.38, 0.38, 0.38),
  accent: rgb(0.424, 0.388, 1),
  accentSoft: rgb(0.545, 0.518, 1),
  success: rgb(0.29, 0.871, 0.502),
  warning: rgb(0.98, 0.8, 0.082),
  danger: rgb(0.973, 0.443, 0.443),
  info: rgb(0.376, 0.647, 0.98),
  border: rgb(0.12, 0.12, 0.15),
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 48;

interface AuditReport {
  success: true;
  project: string;
  contractAddress: string;
  chain: string;
  chainId: string;
  chainIdNum: number;
  verified: boolean;
  tokenType: string;
  riskScore: number;
  professionalScore: number;
  rugPullProbability: number;
  rugPullRisk: string;
  grade: string;
  verdict: { label: string; headline: string; plainEnglish: string };
  aiSummary?: { verdict: string; paragraphs: string[]; bottomLine: string } | null;
  deepWalkthrough?: {
    executiveSummary: string;
    sections: Array<{ heading: string; body: string }>;
    redFlags: string[];
    greenFlags: string[];
    recommendation: string;
  } | null;
  confidence: number;
  findings: Array<{ label: string; severity: "info" | "good" | "warn" | "bad"; detail?: string }>;
  layerScores: Array<{ id: string; label: string; score: number; summary: string }>;
  website?: string | null;
  marketCap?: string;
  scannedAt: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = (searchParams.get("wallet") || "").toLowerCase();
    const contract = (searchParams.get("contract") || "").toLowerCase();
    const chainIdStr = searchParams.get("chainId") || "";

    if (!CONTRACT_REGEX.test(wallet) || !CONTRACT_REGEX.test(contract)) {
      return NextResponse.json({ error: "Invalid wallet or contract" }, { status: 400 });
    }

    if (!isUnlocked(wallet, contract)) {
      return NextResponse.json({ error: "Payment required" }, { status: 402 });
    }

    const unlockInfo = getUnlockInfo(wallet, contract);

    const origin = req.nextUrl.origin;
    const auditRes = await fetch(`${origin}/api/audit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractAddress: contract,
        includeWalkthrough: true,
      }),
    });

    if (!auditRes.ok) {
      return NextResponse.json({ error: "Could not fetch audit data" }, { status: 500 });
    }

    const report: AuditReport = await auditRes.json();
    if (!(report as any).success) {
      return NextResponse.json({ error: "Audit data unavailable" }, { status: 500 });
    }

    const pdfBytes = await buildPdf(report, {
      walletAddress: wallet,
      txHash: unlockInfo?.txHash,
      chainId: unlockInfo?.chainId,
    });

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sbse-guardian-${safeSlug(report.project)}-${shortDate(report.scannedAt)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    debug("PDF generation failed:", e);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}

function safeSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "report";
}

function shortDate(iso: string): string {
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return new Date().toISOString().slice(0, 10); }
}

interface BuildMeta {
  walletAddress: string;
  txHash?: string;
  chainId?: number;
}

async function buildPdf(report: AuditReport, meta: BuildMeta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`SbSe Guardian — ${report.project}`);
  pdf.setAuthor("SbSe Guardian");
  pdf.setSubject("Smart Contract Security Report");
  pdf.setCreator("SbSe Guardian");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);

  const ctx: RenderCtx = {
    pdf,
    font,
    fontBold,
    fontMono,
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - 72,
    pageNum: 1,
  };

  paintBackground(ctx.page);
  drawHeader(ctx, report);
  drawVerdict(ctx, report);
  drawScorecard(ctx, report);
  drawAiSummary(ctx, report);
  if (report.deepWalkthrough) drawDeepWalkthrough(ctx, report);
  drawFindings(ctx, report);
  drawLayerScores(ctx, report);
  drawProof(ctx, report, meta);
  drawFooter(ctx);

  return pdf.save();
}

interface RenderCtx {
  pdf: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  fontMono: PDFFont;
  page: PDFPage;
  y: number;
  pageNum: number;
}

function paintBackground(page: PDFPage) {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: COLORS.bg });
}

function ensureSpace(ctx: RenderCtx, needed: number) {
  if (ctx.y - needed < 72) {
    ctx.page = ctx.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    paintBackground(ctx.page);
    ctx.y = PAGE_HEIGHT - 72;
    ctx.pageNum++;
  }
}

function drawHeader(ctx: RenderCtx, report: AuditReport) {
  ctx.page.drawText("SbSe Guardian", { x: MARGIN_X, y: ctx.y, size: 18, font: ctx.fontBold, color: COLORS.fg });
  ctx.page.drawText("DELUXE REPORT", { x: MARGIN_X + 115, y: ctx.y + 3, size: 8, font: ctx.fontMono, color: COLORS.accentSoft });
  ctx.page.drawRectangle({ x: MARGIN_X, y: ctx.y - 8, width: 40, height: 2, color: COLORS.accent });
  ctx.y -= 40;
}

function drawVerdict(ctx: RenderCtx, report: AuditReport) {
  ensureSpace(ctx, 180);
  const verdictColor =
    report.verdict.label === "SAFE" || report.verdict.label === "INSTITUTIONAL"
      ? COLORS.success
      : report.verdict.label === "CAUTION"
      ? COLORS.warning
      : COLORS.danger;

  ctx.page.drawText("VERDICT", { x: MARGIN_X, y: ctx.y, size: 9, font: ctx.fontMono, color: COLORS.dim });
  ctx.y -= 16;
  ctx.page.drawText(report.verdict.label, { x: MARGIN_X, y: ctx.y, size: 11, font: ctx.fontMono, color: verdictColor });
  ctx.y -= 22;

  for (const line of wrap(report.verdict.headline, 48)) {
    ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 22, font: ctx.fontBold, color: COLORS.fg });
    ctx.y -= 26;
  }
  ctx.y -= 6;

  for (const line of wrap(report.verdict.plainEnglish, 80)) {
    ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 11, font: ctx.font, color: COLORS.muted });
    ctx.y -= 16;
  }
  ctx.y -= 16;
  drawSeparator(ctx);
}

function drawScorecard(ctx: RenderCtx, report: AuditReport) {
  ensureSpace(ctx, 80);
  const cellW = (PAGE_WIDTH - MARGIN_X * 2) / 4;
  const cellY = ctx.y - 50;

  const metrics = [
    { label: "RISK", value: `${report.riskScore}/10` },
    { label: "RUG PROB", value: `${report.rugPullProbability}%` },
    { label: "GRADE", value: report.grade },
    { label: "CONFIDENCE", value: `${report.confidence}%` },
  ];

  metrics.forEach((m, i) => {
    ctx.page.drawText(m.label, { x: MARGIN_X + cellW * i, y: ctx.y, size: 9, font: ctx.fontMono, color: COLORS.dim });
    ctx.page.drawText(m.value, { x: MARGIN_X + cellW * i, y: cellY, size: 22, font: ctx.fontBold, color: COLORS.fg });
  });

  ctx.y = cellY - 32;
  drawSeparator(ctx);
}

function drawAiSummary(ctx: RenderCtx, report: AuditReport) {
  if (!report.aiSummary) return;
  ensureSpace(ctx, 150);

  ctx.page.drawText("AI ANALYST", { x: MARGIN_X, y: ctx.y, size: 9, font: ctx.fontMono, color: COLORS.accentSoft });
  ctx.y -= 20;

  for (const line of wrap(report.aiSummary.verdict, 52)) {
    ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 16, font: ctx.fontBold, color: COLORS.fg });
    ctx.y -= 20;
  }
  ctx.y -= 6;

  for (const para of report.aiSummary.paragraphs) {
    ensureSpace(ctx, 60);
    const clean = para.replace(/\*\*/g, "");
    for (const line of wrap(clean, 80)) {
      ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 11, font: ctx.font, color: COLORS.fg });
      ctx.y -= 14;
    }
    ctx.y -= 6;
  }

  ensureSpace(ctx, 30);
  for (const line of wrap(report.aiSummary.bottomLine, 80)) {
    ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 11, font: ctx.fontBold, color: COLORS.accentSoft });
    ctx.y -= 14;
  }
  ctx.y -= 12;
  drawSeparator(ctx);
}

function drawDeepWalkthrough(ctx: RenderCtx, report: AuditReport) {
  const dw = report.deepWalkthrough;
  if (!dw) return;

  ensureSpace(ctx, 100);
  ctx.page.drawText("PREMIUM WALKTHROUGH", { x: MARGIN_X, y: ctx.y, size: 9, font: ctx.fontMono, color: COLORS.accentSoft });
  ctx.y -= 20;

  for (const line of wrap(dw.executiveSummary, 80)) {
    ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 12, font: ctx.fontBold, color: COLORS.fg });
    ctx.y -= 16;
  }
  ctx.y -= 10;

  for (const section of dw.sections) {
    ensureSpace(ctx, 80);
    ctx.page.drawText(section.heading, { x: MARGIN_X, y: ctx.y, size: 13, font: ctx.fontBold, color: COLORS.accentSoft });
    ctx.y -= 18;

    for (const line of wrap(section.body, 82)) {
      ensureSpace(ctx, 14);
      ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 11, font: ctx.font, color: COLORS.fg });
      ctx.y -= 14;
    }
    ctx.y -= 10;
  }

  ensureSpace(ctx, 80);
  if (dw.redFlags.length) {
    ctx.page.drawText("RED FLAGS", { x: MARGIN_X, y: ctx.y, size: 9, font: ctx.fontMono, color: COLORS.danger });
    ctx.y -= 16;
    for (const flag of dw.redFlags) {
      ensureSpace(ctx, 16);
      for (const line of wrap(`• ${flag}`, 82)) {
        ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 11, font: ctx.font, color: COLORS.fg });
        ctx.y -= 14;
      }
    }
    ctx.y -= 6;
  }

  if (dw.greenFlags.length) {
    ensureSpace(ctx, 40);
    ctx.page.drawText("GREEN FLAGS", { x: MARGIN_X, y: ctx.y, size: 9, font: ctx.fontMono, color: COLORS.success });
    ctx.y -= 16;
    for (const flag of dw.greenFlags) {
      ensureSpace(ctx, 16);
      for (const line of wrap(`• ${flag}`, 82)) {
        ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 11, font: ctx.font, color: COLORS.fg });
        ctx.y -= 14;
      }
    }
    ctx.y -= 10;
  }

  ensureSpace(ctx, 60);
  for (const line of wrap(dw.recommendation, 80)) {
    ctx.page.drawText(line, { x: MARGIN_X, y: ctx.y, size: 11, font: ctx.fontBold, color: COLORS.accentSoft });
    ctx.y -= 14;
  }
  ctx.y -= 12;
  drawSeparator(ctx);
}

function drawFindings(ctx: RenderCtx, report: AuditReport) {
  ensureSpace(ctx, 40);
  ctx.page.drawText(`FINDINGS (${report.findings.length})`, { x: MARGIN_X, y: ctx.y, size: 9, font: ctx.fontMono, color: COLORS.dim });
  ctx.y -= 18;

  const order: Array<"bad" | "warn" | "good" | "info"> = ["bad", "warn", "good", "info"];
  for (const sev of order) {
    const list = report.findings.filter((f) => f.severity === sev);
    if (!list.length) continue;

    for (const f of list) {
      ensureSpace(ctx, 30);
      const sevColor = sevToColor(sev);
      ctx.page.drawCircle({ x: MARGIN_X + 3, y: ctx.y + 4, size: 3, color: sevColor });
      for (const line of wrap(f.label, 76)) {
        ctx.page.drawText(line, { x: MARGIN_X + 14, y: ctx.y, size: 11, font: ctx.font, color: COLORS.fg });
        ctx.y -= 13;
      }
      if (f.detail) {
        for (const line of wrap(f.detail, 76)) {
          ensureSpace(ctx, 13);
          ctx.page.drawText(line, { x: MARGIN_X + 14, y: ctx.y, size: 9, font: ctx.font, color: COLORS.muted });
          ctx.y -= 12;
        }
      }
      ctx.y -= 4;
    }
  }
  ctx.y -= 10;
  drawSeparator(ctx);
}

function drawLayerScores(ctx: RenderCtx, report: AuditReport) {
  ensureSpace(ctx, 60);
  ctx.page.drawText("SECURITY LAYERS", { x: MARGIN_X, y: ctx.y, size: 9, font: ctx.fontMono, color: COLORS.dim });
  ctx.y -= 20;

  for (const layer of report.layerScores) {
    ensureSpace(ctx, 24);
    ctx.page.drawText(layer.label, { x: MARGIN_X, y: ctx.y, size: 11, font: ctx.font, color: COLORS.fg });
    const scoreColor = layer.score >= 8 ? COLORS.success : layer.score >= 5 ? COLORS.warning : COLORS.danger;
    const scoreText = `${layer.score}/10`;
    const scoreWidth = ctx.fontMono.widthOfTextAtSize(scoreText, 11);
    ctx.page.drawText(scoreText, { x: PAGE_WIDTH - MARGIN_X - scoreWidth, y: ctx.y, size: 11, font: ctx.fontMono, color: scoreColor });
    ctx.y -= 13;
    ctx.page.drawText(layer.summary, { x: MARGIN_X, y: ctx.y, size: 9, font: ctx.font, color: COLORS.muted });
    ctx.y -= 14;
  }
  ctx.y -= 8;
  drawSeparator(ctx);
}

function drawProof(ctx: RenderCtx, report: AuditReport, meta: BuildMeta) {
  ensureSpace(ctx, 100);
  ctx.page.drawText("PROOF OF PAYMENT", { x: MARGIN_X, y: ctx.y, size: 9, font: ctx.fontMono, color: COLORS.dim });
  ctx.y -= 18;

  const rows: Array<[string, string]> = [
    ["Contract", report.contractAddress],
    ["Chain", `${report.chain} (${report.chainIdNum})`],
    ["Scanned", report.scannedAt],
    ["Buyer wallet", meta.walletAddress],
  ];
  if (meta.txHash) rows.push(["Payment tx", meta.txHash]);

  for (const [label, value] of rows) {
    ensureSpace(ctx, 16);
    ctx.page.drawText(label, { x: MARGIN_X, y: ctx.y, size: 10, font: ctx.font, color: COLORS.muted });
    const valueLines = wrap(value, 60);
    for (let i = 0; i < valueLines.length; i++) {
      if (i > 0) ensureSpace(ctx, 14);
      ctx.page.drawText(valueLines[i], { x: MARGIN_X + 110, y: ctx.y - i * 14, size: 10, font: ctx.fontMono, color: COLORS.fg });
    }
    ctx.y -= 14 + (valueLines.length - 1) * 14;
  }
  ctx.y -= 10;
}

function drawFooter(ctx: RenderCtx) {
  const totalPages = ctx.pdf.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const page = ctx.pdf.getPage(i);
    page.drawText(`SbSe Guardian · Smart Contract Intelligence · Page ${i + 1} of ${totalPages}`, {
      x: MARGIN_X, y: 40, size: 8, font: ctx.fontMono, color: COLORS.dim,
    });
    page.drawText("Automated analysis. Signal, not guarantee. Always DYOR. Not financial advice.", {
      x: MARGIN_X, y: 28, size: 8, font: ctx.font, color: COLORS.dim,
    });
  }
}

function drawSeparator(ctx: RenderCtx) {
  ensureSpace(ctx, 16);
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ctx.y },
    thickness: 0.5,
    color: COLORS.border,
  });
  ctx.y -= 18;
}

function sevToColor(sev: "bad" | "warn" | "good" | "info") {
  switch (sev) {
    case "bad": return COLORS.danger;
    case "warn": return COLORS.warning;
    case "good": return COLORS.success;
    case "info": return COLORS.info;
  }
}

function wrap(text: string, maxChars: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= maxChars) current += " " + word;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}
