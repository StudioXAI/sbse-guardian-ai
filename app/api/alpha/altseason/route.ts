import { NextResponse } from "next/server";
import { computeAltSeasonIndex } from "@/lib/alpha/altSeasonIndex";
import type { AltSeasonData } from "@/lib/alpha/altSeasonIndex";
import type { AlphaApiResponse } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await computeAltSeasonIndex();
    if (!data) {
      const body: AlphaApiResponse<AltSeasonData> = {
        success: false,
        message: "Alt Season Index unavailable — top market data missing.",
      };
      return NextResponse.json(body, { status: 503 });
    }
    const body: AlphaApiResponse<AltSeasonData> = { success: true, data };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<AltSeasonData> = {
      success: false,
      message: e instanceof Error ? e.message : "Alt Season error.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
