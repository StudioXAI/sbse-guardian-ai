import { NextResponse } from "next/server";
import { fetchInfiSocial } from "@/lib/alpha/socialFetcher";
import type { AlphaApiResponse, SocialPost } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const platform = url.searchParams.get("platform");

    const all = await fetchInfiSocial();
    const data = platform ? all.filter((p) => p.platform === platform) : all;

    const body: AlphaApiResponse<SocialPost[]> = { success: true, data };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<SocialPost[]> = {
      success: false,
      message: e instanceof Error ? e.message : "Social feed unavailable.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
