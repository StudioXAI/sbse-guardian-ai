import { NextResponse } from "next/server";
import { fetchLivePolymarketBets } from "@/lib/alpha/polymarketClient";
import type { AlphaApiResponse, PolymarketBet } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchLivePolymarketBets();
    const body: AlphaApiResponse<PolymarketBet[]> = { success: true, data };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<PolymarketBet[]> = {
      success: false,
      message: e instanceof Error ? e.message : "Polymarket data unavailable.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
