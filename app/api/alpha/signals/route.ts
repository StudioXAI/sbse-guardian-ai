import { NextResponse } from "next/server";
import { getMarketSignals, getInfiSignals } from "@/lib/alpha/signalEngine";
import type { AlphaApiResponse, Signal } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter");

    let data: Signal[];
    if (filter === "infi") {
      data = await getInfiSignals();
    } else if (filter === "market") {
      data = await getMarketSignals();
    } else {
      const [market, infi] = await Promise.all([getMarketSignals(), getInfiSignals()]);
      data = [...market, ...infi].sort((a, b) => b.timestamp - a.timestamp);
    }

    const body: AlphaApiResponse<Signal[]> = { success: true, data };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<Signal[]> = {
      success: false,
      message: e instanceof Error ? e.message : "Failed to load signals.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
