import { NextResponse } from "next/server";
import { fetchLiquidityMap } from "@/lib/alpha/liquidityClient";
import type { AlphaApiResponse } from "@/lib/alpha/types";
import type { LiquidityMap } from "@/lib/alpha/liquidityClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchLiquidityMap();
    if (!data) {
      const body: AlphaApiResponse<LiquidityMap> = {
        success: false,
        message: "Liquidity data temporarily unavailable from DefiLlama.",
      };
      return NextResponse.json(body, { status: 503 });
    }
    const body: AlphaApiResponse<LiquidityMap> = { success: true, data };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<LiquidityMap> = {
      success: false,
      message: e instanceof Error ? e.message : "Liquidity data error.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
