/* ─────────────────────────────────────────────────────────────
   POST /api/alpha/internal-deployment

   Auth-gated endpoint that writes a project directly into the
   New Projects buffer without waiting for the next scan cycle.
   Used by the v29+ deploy wizard so contracts deployed through
   the INFI platform appear instantly in the New Projects feed.

   AUTH:
   - Requires `INTERNAL_DEPLOY_SECRET` env var to be set on the
     server side
   - Caller must send the same value as `Authorization: Bearer <secret>`
   - In production with the env var unset, ALL requests are rejected
     to prevent silent unauthenticated writes

   PAYLOAD: same shape as a NewProject record, with optional
   socials and `infiVerified: true` set automatically (because
   anything deployed through the platform is INFI-verified by
   definition).
   ───────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import {
  mergeIntoBuffer,
  type NewProject,
} from "@/lib/alpha/newProjectScanner";
import { CHAIN_CONFIG, type SupportedChain } from "@/lib/alpha/quicknodeClient";

export const runtime = "nodejs";

interface DeploymentBody {
  contractAddress: string;
  chain: SupportedChain;
  blockNumber?: number;
  txHash: string;
  deployer: string;
  symbol: string;
  name: string;
  decimals: number;
  socials?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
  };
}

function validate(body: unknown): { ok: true; data: DeploymentBody } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid body" };
  }
  const b = body as Record<string, unknown>;

  const contractAddress = String(b.contractAddress ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(contractAddress)) {
    return { ok: false, error: "Invalid contractAddress" };
  }
  const chain = String(b.chain ?? "").trim() as SupportedChain;
  if (!CHAIN_CONFIG[chain]) {
    return { ok: false, error: "Unsupported chain" };
  }
  const txHash = String(b.txHash ?? "").trim();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    return { ok: false, error: "Invalid txHash" };
  }
  const deployer = String(b.deployer ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(deployer)) {
    return { ok: false, error: "Invalid deployer" };
  }
  const symbol = String(b.symbol ?? "").trim();
  if (symbol.length === 0 || symbol.length > 12) {
    return { ok: false, error: "Invalid symbol" };
  }
  const name = String(b.name ?? "").trim();
  if (name.length === 0 || name.length > 100) {
    return { ok: false, error: "Invalid name" };
  }
  const decimals = Number(b.decimals);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    return { ok: false, error: "Invalid decimals" };
  }

  /* Optional fields */
  const blockNumber =
    typeof b.blockNumber === "number" && b.blockNumber > 0
      ? Math.floor(b.blockNumber)
      : 0;

  let socials: DeploymentBody["socials"];
  if (typeof b.socials === "object" && b.socials !== null) {
    const s = b.socials as Record<string, unknown>;
    socials = {
      website: s.website ? String(s.website).slice(0, 200) : undefined,
      twitter: s.twitter ? String(s.twitter).slice(0, 100) : undefined,
      telegram: s.telegram ? String(s.telegram).slice(0, 100) : undefined,
      discord: s.discord ? String(s.discord).slice(0, 200) : undefined,
    };
  }

  return {
    ok: true,
    data: {
      contractAddress,
      chain,
      blockNumber,
      txHash,
      deployer,
      symbol,
      name,
      decimals,
      socials,
    },
  };
}

export async function POST(request: Request) {
  /* Auth check — strict rejection when secret is missing or
     mismatched. We deliberately return 401 even when the env var
     is unset rather than falling open. Internal endpoints should
     never accept unauthenticated writes. */
  const secret = process.env.INTERNAL_DEPLOY_SECRET;
  if (!secret) {
    console.error(
      "[internal-deployment] INTERNAL_DEPLOY_SECRET not set — all requests rejected",
    );
    return NextResponse.json(
      { ok: false, error: "Endpoint not configured" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
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
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400 },
    );
  }

  const data = validation.data;
  const cfg = CHAIN_CONFIG[data.chain];

  /* Build the NewProject record. Mark as infiVerified = true
     because anything coming through this endpoint is by
     definition deployed through the INFI platform. */
  const project: NewProject = {
    id: `${data.txHash}-${data.contractAddress}`,
    contractAddress: data.contractAddress,
    chain: cfg.name,
    chainId: cfg.chainId,
    blockNumber: data.blockNumber || 0,
    discoveredAt: Date.now(),
    deployer: data.deployer,
    symbol: data.symbol,
    name: data.name,
    decimals: data.decimals,
    contractUrl: `${cfg.explorerBase}/address/${data.contractAddress}`,
    deployerUrl: `${cfg.explorerBase}/address/${data.deployer}`,
    txUrl: `${cfg.explorerBase}/tx/${data.txHash}`,
    txHash: data.txHash,
    socials: data.socials
      ? { ...data.socials, source: "self-reported" as const }
      : undefined,
    infiVerified: true,
  };

  mergeIntoBuffer([project]);

  return NextResponse.json({ ok: true, id: project.id });
}
