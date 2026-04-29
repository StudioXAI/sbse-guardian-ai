import { NextResponse } from "next/server";
import { fetchBtcDominance } from "@/lib/alpha/btcDominance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchBtcDominance();
    if (!data) {
      return NextResponse.json(
        { success: false, message: "Dominance data unavailable." },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Dominance fetch failed.",
      },
      { status: 500 },
    );
  }
}
