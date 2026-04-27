import { NextResponse } from "next/server";
import {
  fetchCoinglassSnapshot,
  isCoinglassConfigured,
} from "@/lib/alpha/coinglassClient";
import type { CoinglassSnapshot } from "@/lib/alpha/coinglassClient";
import type { AlphaApiResponse } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CoinglassResp {
  configured: boolean;
  snapshot: CoinglassSnapshot | null;
}

export async function GET() {
  const configured = isCoinglassConfigured();
  if (!configured) {
    const body: AlphaApiResponse<CoinglassResp> = {
      success: true,
      data: { configured: false, snapshot: null },
    };
    return NextResponse.json(body);
  }

  const snapshot = await fetchCoinglassSnapshot();
  const body: AlphaApiResponse<CoinglassResp> = {
    success: true,
    data: { configured: true, snapshot },
  };
  return NextResponse.json(body);
}
