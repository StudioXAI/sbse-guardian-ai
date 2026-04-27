import { NextResponse } from "next/server";
import { fetchLiquidityRadar } from "@/lib/alpha/liquidityRadar";
import type { RadarPoint } from "@/lib/alpha/liquidityRadar";
import type { AlphaApiResponse } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchLiquidityRadar();
    const body: AlphaApiResponse<RadarPoint[]> = { success: true, data };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<RadarPoint[]> = {
      success: false,
      message: e instanceof Error ? e.message : "Liquidity radar error.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
