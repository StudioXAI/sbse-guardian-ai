import { NextResponse } from "next/server";
import { fetchInfluencerSentiment } from "@/lib/alpha/influencerTracker";
import type { InfluencerSentiment } from "@/lib/alpha/influencerTracker";
import type { AlphaApiResponse } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InfluencerResp {
  configured: boolean;
  sentiment: InfluencerSentiment | null;
}

export async function GET() {
  try {
    const sentiment = await fetchInfluencerSentiment();
    const configured = Boolean(process.env.X_BEARER_TOKEN);
    const body: AlphaApiResponse<InfluencerResp> = {
      success: true,
      data: { configured, sentiment },
    };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<InfluencerResp> = {
      success: false,
      message: e instanceof Error ? e.message : "Influencer signal error.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
