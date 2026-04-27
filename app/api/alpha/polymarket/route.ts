import { NextResponse } from "next/server";
import { fetchPolymarketSplit } from "@/lib/alpha/polymarketClient";
import type { PolymarketSplit } from "@/lib/alpha/polymarketClient";
import type { AlphaApiResponse } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchPolymarketSplit();
    const body: AlphaApiResponse<PolymarketSplit> = { success: true, data };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<PolymarketSplit> = {
      success: false,
      message: e instanceof Error ? e.message : "Polymarket data unavailable.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
