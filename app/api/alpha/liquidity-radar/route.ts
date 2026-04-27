import { NextResponse } from "next/server";
import { fetchLiquidityRadar } from "@/lib/alpha/liquidityRadar";
import type { LiquidityHeatmapData } from "@/lib/alpha/liquidityRadar";
import type { AlphaApiResponse } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchLiquidityRadar();
    const body: AlphaApiResponse<LiquidityHeatmapData> = {
      success: true,
      data,
    };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<LiquidityHeatmapData> = {
      success: false,
      message: e instanceof Error ? e.message : "Liquidity heatmap error.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
