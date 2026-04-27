import { NextResponse } from "next/server";
import { fetchLiveWhaleMoves } from "@/lib/alpha/whaleTracker";
import type { AlphaApiResponse, WhaleMove } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchLiveWhaleMoves();
    const body: AlphaApiResponse<WhaleMove[]> = { success: true, data };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<WhaleMove[]> = {
      success: false,
      message: e instanceof Error ? e.message : "Whale tracker unavailable.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
