import { NextResponse } from "next/server";
import { traceWallet } from "@/lib/alpha/walletPathTracer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ADDR_REGEX = /^0x[a-fA-F0-9]{40}$/;
const VALID_CHAINS = new Set([1, 56, 137, 42161, 10, 8453]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const address = url.searchParams.get("address");
    const chainIdStr = url.searchParams.get("chainId");

    if (!address || !ADDR_REGEX.test(address)) {
      return NextResponse.json(
        { success: false, message: "Valid address required (0x...)." },
        { status: 400 },
      );
    }

    const chainId = parseInt(chainIdStr ?? "1", 10);
    if (!Number.isFinite(chainId) || !VALID_CHAINS.has(chainId)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Unsupported chainId. Supported: 1 (Ethereum), 56 (BSC), 137 (Polygon), 42161 (Arbitrum), 10 (Optimism), 8453 (Base).",
        },
        { status: 400 },
      );
    }

    const trace = await traceWallet(address, chainId);
    if (!trace) {
      return NextResponse.json(
        {
          success: false,
          message: "Tracer unavailable. Verify ETHERSCAN_API_KEY is set.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true, data: trace });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Trace failed.",
      },
      { status: 500 },
    );
  }
}
