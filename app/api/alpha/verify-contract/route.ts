/* ─────────────────────────────────────────────────────────────
   POST /api/alpha/verify-contract

   Server-side proxy that submits a deployed contract to Etherscan
   for source verification. Keeps the ETHERSCAN_API_KEY server-only.

   Two modes:
   - { action: "submit", chainId, contractAddress, constructorArguments }
       → submits source, returns { status, guid }
   - { action: "status", chainId, guid }
       → checks an existing GUID's status

   The wizard's success page calls this endpoint:
   1. On mount with action=submit (auto-attempt)
   2. Every few seconds with action=status until verified|failed
   3. Manually on user click of the retry button (re-runs submit)
   ───────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import {
  submitVerification,
  checkVerificationStatus,
  type VerifyResult,
} from "@/lib/deployer/verifyContract";

export const runtime = "nodejs";

interface SubmitBody {
  action: "submit";
  chainId: number;
  contractAddress: string;
  constructorArguments: string;
  templateId: string;
}

interface StatusBody {
  action: "status";
  chainId: number;
  guid: string;
}

type RequestBody = SubmitBody | StatusBody;

function validate(body: unknown): { ok: true; data: RequestBody } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid body" };
  }
  const b = body as Record<string, unknown>;

  if (b.action === "submit") {
    const chainId = Number(b.chainId);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return { ok: false, error: "Invalid chainId" };
    }
    const contractAddress = String(b.contractAddress ?? "").trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(contractAddress)) {
      return { ok: false, error: "Invalid contractAddress" };
    }
    const constructorArguments = String(b.constructorArguments ?? "");
    /* Constructor args are hex without 0x prefix. Empty string is valid
       (no args). Otherwise must be valid hex. */
    if (constructorArguments && !/^[a-fA-F0-9]+$/.test(constructorArguments)) {
      return { ok: false, error: "Invalid constructorArguments — must be hex without 0x prefix" };
    }
    const templateId = String(b.templateId ?? "").trim();
    if (templateId.length === 0 || templateId.length > 50) {
      return { ok: false, error: "Invalid templateId" };
    }
    return {
      ok: true,
      data: { action: "submit", chainId, contractAddress, constructorArguments, templateId },
    };
  }

  if (b.action === "status") {
    const chainId = Number(b.chainId);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return { ok: false, error: "Invalid chainId" };
    }
    const guid = String(b.guid ?? "").trim();
    if (guid.length === 0 || guid.length > 100) {
      return { ok: false, error: "Invalid guid" };
    }
    return { ok: true, data: { action: "status", chainId, guid } };
  }

  return { ok: false, error: "Invalid action — must be 'submit' or 'status'" };
}

/* Light rate limit per IP. */
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
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

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: `Too many requests. Try again in ${rl.resetIn}s.` },
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
    return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
  }

  const data = validation.data;
  let result: VerifyResult;

  if (data.action === "submit") {
    result = await submitVerification({
      chainId: data.chainId,
      contractAddress: data.contractAddress,
      constructorArguments: data.constructorArguments,
      templateId: data.templateId,
    });
  } else {
    result = await checkVerificationStatus(data.chainId, data.guid);
  }

  return NextResponse.json({ ok: true, ...result });
}
