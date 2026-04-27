import { NextResponse } from "next/server";
import { getSignals } from "@/lib/alpha/signalEngine";
import { generatePrediction } from "@/lib/alpha/predictEngine";
import type { AlphaApiResponse, PredictionResponse } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const signals = await getSignals();
    const prediction = await generatePrediction(signals);
    const body: AlphaApiResponse<PredictionResponse> = { success: true, data: prediction };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<PredictionResponse> = {
      success: false,
      message: e instanceof Error ? e.message : "Prediction unavailable.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
