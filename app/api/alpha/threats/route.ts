import { NextResponse } from "next/server";
import { fetchThreats } from "@/lib/alpha/threatTracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await fetchThreats();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Threat scan failed.",
      },
      { status: 500 },
    );
  }
}
