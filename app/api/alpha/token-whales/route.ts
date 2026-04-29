import { NextResponse } from "next/server";
import { fetchTokenWhales } from "@/lib/alpha/tokenWhaleTracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const payload = await fetchTokenWhales();
    return NextResponse.json({ success: true, data: payload });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Token whales fetch failed.",
      },
      { status: 500 },
    );
  }
}
