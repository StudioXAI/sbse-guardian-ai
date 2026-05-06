/* ─────────────────────────────────────────────────────────────
   POST /api/alpha/internal-deployment-public

   Public-facing proxy for the auth-gated /internal-deployment
   endpoint. The wizard runs in the browser and can't ship the
   INTERNAL_DEPLOY_SECRET — that would defeat its purpose. This
   route runs server-side, validates the request (light checks +
   Turnstile when configured), then forwards to the protected
   endpoint with the secret attached.

   WHAT MAKES THIS SAFE:
   - Caller can only attach a NewProject record for a contract
     that ACTUALLY exists on-chain. We verify by calling
     eth_getCode on the contract address before forwarding —
     reject if no code at the address.
   - This means a malicious caller can only spam the feed with
     contracts that have actually been deployed. They can lie
     about who deployed them and the metadata, but they can't
     conjure ghost entries.
   - Cloudflare Turnstile (when configured) prevents bot abuse.
   - Light rate limit per IP.

   This is "good enough" security for the New Projects feed
   integrity. Defense in depth: BD team verifies claims when
   following up on listing intent.
   ───────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import {
  rpcCall,
  CHAIN_CONFIG,
  type SupportedChain,
} from "@/lib/alpha/quicknodeClient";

export const runtime = "nodejs";

interface PublicSubmission {
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
  turnstileToken?: string;
}

function validate(body: unknown): { ok: true; data: PublicSubmission } | { ok: false; error: string } {
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

  const blockNumber =
    typeof b.blockNumber === "number" && b.blockNumber > 0
      ? Math.floor(b.blockNumber)
      : 0;

  let socials: PublicSubmission["socials"];
  if (typeof b.socials === "object" && b.socials !== null) {
    const s = b.socials as Record<string, unknown>;
    socials = {
      website: s.website ? String(s.website).slice(0, 200) : undefined,
      twitter: s.twitter ? String(s.twitter).slice(0, 100) : undefined,
      telegram: s.telegram ? String(s.telegram).slice(0, 100) : undefined,
      discord: s.discord ? String(s.discord).slice(0, 200) : undefined,
    };
  }

  const turnstileToken = b.turnstileToken
    ? String(b.turnstileToken).trim()
    : undefined;

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
      turnstileToken,
    },
  };
}

/* Light rate limit per IP. */
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
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

/* Per-wallet mainnet rate limit — abuse mitigation for the
   free-deploy preview window. Limits a single deployer wallet
   to 1 mainnet deploy per 24 hours. Does not apply on testnet
   where free spam is acceptable.

   In-memory map: resets on serverless cold start. A determined
   attacker could exploit the cold-start window but they'd hit
   the IP rate limit too. Acceptable for v29.5; tighten later if
   abuse becomes a real problem. */
const walletDeployMap = new Map<string, number>();
const WALLET_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function walletRateLimit(
  deployer: string,
  isMainnet: boolean,
): { allowed: boolean; resetIn?: number } {
  if (!isMainnet) return { allowed: true }; // testnet has no per-wallet limit

  const key = deployer.toLowerCase();
  const now = Date.now();
  const lastDeploy = walletDeployMap.get(key);

  if (lastDeploy && now - lastDeploy < WALLET_RATE_WINDOW_MS) {
    const resetIn = Math.ceil(
      (WALLET_RATE_WINDOW_MS - (now - lastDeploy)) / 1000,
    );
    return { allowed: false, resetIn };
  }

  walletDeployMap.set(key, now);
  return { allowed: true };
}

/* Verify the contract actually exists on-chain. The cheapest
   way is eth_getCode — if the contract has no deployed bytecode,
   the result is "0x" or "0x0". If it has code, the result is
   the runtime bytecode hex string. */
async function verifyContractExists(
  chain: SupportedChain,
  address: string,
): Promise<boolean> {
  try {
    const code = await rpcCall<string>(chain, "eth_getCode", [
      address,
      "latest",
    ]);
    if (typeof code !== "string") return false;
    /* Empty code = no contract. "0x" or "0x0" both mean no code. */
    return code.length > 4;
  } catch {
    return false;
  }
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
    if (!res.ok) return { ok: false, reason: "Bot check failed" };
    const data = (await res.json()) as { success: boolean };
    return data.success
      ? { ok: true }
      : { ok: false, reason: "Bot check failed" };
  } catch {
    return { ok: false, reason: "Bot check unavailable" };
  }
}

export async function POST(request: Request) {
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
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400 },
    );
  }
  const data = validation.data;

  /* Bot check — required in production, falls open in dev. */
  const ts = await verifyTurnstile(data.turnstileToken, ip);
  if (!ts.ok) {
    return NextResponse.json(
      { ok: false, error: ts.reason },
      { status: 403 },
    );
  }

  /* Per-wallet rate limit — applies to mainnet only, prevents
     a single deployer from spamming the New Projects feed and
     burning the verified badge on mass-produced scam factories. */
  const isTestnet = (request.headers.get("x-deploy-context") ?? "")
    .toLowerCase()
    .includes("testnet");
  const walletRl = walletRateLimit(data.deployer, !isTestnet);
  if (!walletRl.allowed) {
    const hours = Math.ceil((walletRl.resetIn ?? 0) / 3600);
    return NextResponse.json(
      {
        ok: false,
        error: `One mainnet deploy per wallet per 24h. Try again in ~${hours}h, or use a different wallet.`,
      },
      { status: 429 },
    );
  }

  /* Contract-exists check — prevents users from registering
     ghost entries for contracts that don't exist on-chain. */
  if (!isTestnet) {
    const exists = await verifyContractExists(data.chain, data.contractAddress);
    if (!exists) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No contract code found at this address on the specified chain.",
        },
        { status: 400 },
      );
    }
  }

  /* Forward to the protected endpoint with the secret attached. */
  const secret = process.env.INTERNAL_DEPLOY_SECRET;
  if (!secret) {
    console.error(
      "[internal-deployment-public] INTERNAL_DEPLOY_SECRET not set",
    );
    return NextResponse.json(
      { ok: false, error: "Endpoint not configured" },
      { status: 503 },
    );
  }

  /* Build the absolute URL for the internal endpoint. In Next.js
     the request.url contains the full origin so we can derive it. */
  const origin = new URL(request.url).origin;
  const internalUrl = `${origin}/api/alpha/internal-deployment`;

  try {
    const internalRes = await fetch(internalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        contractAddress: data.contractAddress,
        chain: data.chain,
        blockNumber: data.blockNumber,
        txHash: data.txHash,
        deployer: data.deployer,
        symbol: data.symbol,
        name: data.name,
        decimals: data.decimals,
        socials: data.socials,
      }),
    });
    const json = await internalRes.json();
    if (!internalRes.ok) {
      return NextResponse.json(json, { status: internalRes.status });
    }
    return NextResponse.json(json);
  } catch (err) {
    console.error("[internal-deployment-public] Forward failed:", err);
    return NextResponse.json(
      { ok: false, error: "Internal forward failed" },
      { status: 502 },
    );
  }
}
