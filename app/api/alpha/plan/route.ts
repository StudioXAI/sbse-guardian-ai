/* ─────────────────────────────────────────────────────────────
   Alpha Plan Activation
   - POST { wallet, tier, billing, txHash, chainId }
   - Reuses lib/verifyPayment.ts (same dual-rail USDC/USDT verifier
     that powers /api/unlock for the Scanner)
   - Verifies tx is real, paid by the right wallet, and at-or-above
     the expected plan price
   - On success, activates the plan for 30 days
   ───────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import { activatePlan, getAccessStatus, PLANS } from "@/lib/alpha/accessStore";
import type { PlanTier } from "@/lib/alpha/accessStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TX_REGEX = /^0x[a-fA-F0-9]{64}$/;

interface PlanRequest {
  wallet?: string;
  tier?: PlanTier;
  billing?: "monthly" | "annual";
  txHash?: string;
  chainId?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlanRequest;
    const { wallet, tier, billing = "monthly", txHash, chainId } = body;

    if (!wallet || !ADDR_REGEX.test(wallet)) {
      return NextResponse.json(
        { success: false, message: "Valid wallet address required." },
        { status: 400 },
      );
    }
    if (!tier || (tier !== "trader" && tier !== "pro")) {
      return NextResponse.json(
        { success: false, message: "Tier must be 'trader' or 'pro'." },
        { status: 400 },
      );
    }
    if (!txHash || !TX_REGEX.test(txHash)) {
      return NextResponse.json(
        { success: false, message: "Valid transaction hash required." },
        { status: 400 },
      );
    }
    if (typeof chainId !== "number") {
      return NextResponse.json(
        { success: false, message: "chainId required." },
        { status: 400 },
      );
    }

    const plan = PLANS[tier];
    const expectedAmountUsd = billing === "annual" ? plan.annualUsd : plan.monthlyUsd;

    /* Reuse existing payment verification — same module powers /api/unlock. */
    const { verifyPayment } = await import("@/lib/verifyPayment");
    const result = await verifyPayment(txHash, chainId);

    if (!result.verified) {
      return NextResponse.json(
        {
          success: false,
          message: result.reason ?? "Payment could not be verified.",
          code: result.errorCode,
        },
        { status: 400 },
      );
    }

    /* Confirm the sender matches the wallet claiming the plan. */
    if (result.from && result.from.toLowerCase() !== wallet.toLowerCase()) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Payment was sent from a different wallet than the one requesting the plan. " +
            "Please connect the wallet that paid.",
          code: "WALLET_MISMATCH",
        },
        { status: 400 },
      );
    }

    /* Confirm the amount paid is at-or-above the plan price.
       We allow a small slippage tolerance (5%) for rounding. */
    const paidUsd = result.amountUsd ?? 0;
    const minimumAcceptable = expectedAmountUsd * 0.95;
    if (paidUsd < minimumAcceptable) {
      return NextResponse.json(
        {
          success: false,
          message: `Payment amount $${paidUsd.toFixed(2)} is below the required $${expectedAmountUsd} for the ${tier} plan.`,
          code: "INSUFFICIENT_AMOUNT",
        },
        { status: 400 },
      );
    }

    activatePlan(wallet, tier, txHash, chainId, paidUsd);
    const status = getAccessStatus(wallet);

    return NextResponse.json({
      success: true,
      data: { ...status, tier, billing, amountUsd: paidUsd },
    });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : "Plan activation failed.",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      trader: PLANS.trader,
      pro: PLANS.pro,
      paymentMethods: ["USDC", "USDT"],
      supportedChains: ["Ethereum", "BSC", "Polygon", "Base", "Arbitrum", "Optimism"],
    },
  });
}
