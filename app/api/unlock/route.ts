/* ─────────────────────────────────────────────────────────────
   POST /api/unlock
   Body: { txHash, chainId, contractAddress }
   Verifies on-chain USDT payment and records the unlock for this
   (wallet, contract) pair.
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
    // Rate limit
    const rl = rateLimit(clientKey(req));
    if (!rl.allowed) {
      return NextResponse.json(
        {
          success: false,
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

    // Input validation
    if (!TX_REGEX.test(txHash)) {
      return NextResponse.json(
        { success: false, message: "Invalid transaction hash" },
        { status: 400 },
      );
    }
    if (!CONTRACT_REGEX.test(contractAddress)) {
      return NextResponse.json(
        { success: false, message: "Invalid contract address" },
        { status: 400 },
      );
    }
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid chain ID" },
        { status: 400 },
      );
    }

    // Verify payment on-chain
    const result = await verifyPayment(txHash, chainId);

    if (!result.verified) {
      return NextResponse.json(
        {
          success: false,
          message: result.reason || "Payment verification failed",
          details: result,
        },
        { status: 400 },
      );
    }

    // Record the unlock keyed on the paying wallet
    if (!result.from) {
      return NextResponse.json(
        { success: false, message: "Could not determine sender wallet" },
        { status: 400 },
      );
    }

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
      amount: result.amount,
      amountUsd: result.amountUsd,
      txHash,
    });
  } catch (error) {
    debug("Unlock verification failed:", error);
    return NextResponse.json(
      { success: false, message: "Verification error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/unlock?wallet=0x...&contract=0x...
 * Returns whether this (wallet, contract) pair has been unlocked.
 */
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
