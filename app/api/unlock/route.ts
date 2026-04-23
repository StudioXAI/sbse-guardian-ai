/* ─────────────────────────────────────────────────────────────
   POST /api/unlock
   Body: { txHash, chainId, contractAddress }
   Verifies on-chain payment, records unlock.

   Hotfix 2 changes:
   - Passes errorCode through to client so UI can show
     "Retry verification" button for NOT_YET_MINED instead of
     treating every failure as final
   - Idempotent: re-submitting the same tx hash is safe
   ───────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";
import { verifyPayment } from "@/lib/verifyPayment";
import { recordUnlock, isUnlocked } from "@/lib/unlockStore";
import { debug } from "@/lib/constants";
import { rateLimit, clientKey } from "@/lib/rateLimit";

const CONTRACT_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TX_REGEX = /^0x[a-fA-F0-9]{64}$/;

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(clientKey(req));
    if (!rl.allowed) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "RATE_LIMIT",
          message: `Rate limit exceeded. Try again in ${rl.retryAfterSec}s.`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSec) },
        },
      );
    }

    const body = await req.json();
    const txHash = String(body?.txHash || "");
    const chainId = Number(body?.chainId || 0);
    const contractAddress = String(body?.contractAddress || "");

    if (!TX_REGEX.test(txHash)) {
      return NextResponse.json(
        { success: false, errorCode: "BAD_INPUT", message: "Invalid transaction hash" },
        { status: 400 },
      );
    }
    if (!CONTRACT_REGEX.test(contractAddress)) {
      return NextResponse.json(
        { success: false, errorCode: "BAD_INPUT", message: "Invalid contract address" },
        { status: 400 },
      );
    }
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return NextResponse.json(
        { success: false, errorCode: "BAD_INPUT", message: "Invalid chain ID" },
        { status: 400 },
      );
    }

    const result = await verifyPayment(txHash, chainId);

    if (!result.verified) {
      // Use 200 for transient errors so client retry logic works cleanly;
      // only use 400 for permanent failures
      const isTransient = result.errorCode === "NOT_YET_MINED";
      return NextResponse.json(
        {
          success: false,
          errorCode: result.errorCode,
          message: result.reason || "Payment verification failed",
          details: result,
        },
        { status: isTransient ? 202 : 400 },
      );
    }

    if (!result.from) {
      return NextResponse.json(
        {
          success: false,
          errorCode: "NO_SENDER",
          message: "Could not determine sender wallet from tx logs",
        },
        { status: 400 },
      );
    }

    // Record unlock (idempotent — safe to call repeatedly)
    recordUnlock(result.from, contractAddress, {
      txHash,
      chainId,
      amountUsd: result.amountUsd || 0,
    });

    return NextResponse.json({
      success: true,
      unlocked: true,
      wallet: result.from,
      contractAddress,
      chainId,
      chainName: result.chainName,
      stablecoin: result.stablecoin,
      amount: result.amount,
      amountUsd: result.amountUsd,
      txHash,
    });
  } catch (error) {
    debug("Unlock verification failed:", error);
    return NextResponse.json(
      { success: false, errorCode: "INTERNAL", message: "Verification error" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet") || "";
    const contract = searchParams.get("contract") || "";

    if (!CONTRACT_REGEX.test(wallet) || !CONTRACT_REGEX.test(contract)) {
      return NextResponse.json(
        { unlocked: false, error: "Invalid parameters" },
        { status: 400 },
      );
    }

    return NextResponse.json({ unlocked: isUnlocked(wallet, contract) });
  } catch {
    return NextResponse.json({ unlocked: false }, { status: 500 });
  }
}
