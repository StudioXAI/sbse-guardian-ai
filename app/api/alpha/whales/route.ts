import { NextResponse } from "next/server";
import { fetchLiveWhaleMoves } from "@/lib/alpha/whaleTracker";
import { fetchWhaleAlertMoves } from "@/lib/alpha/whaleAlertClient";
import type { AlphaApiResponse, WhaleMove } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    /* Pull both sources in parallel. The data is merged and dedup'd
       so the UI shows a single unified whale feed — users never see
       per-row source attribution. */
    const [etherscan, whaleAlert] = await Promise.all([
      fetchLiveWhaleMoves(),
      fetchWhaleAlertMoves(),
    ]);

    const seen = new Set<string>();
    const merged: WhaleMove[] = [];
    for (const m of [...etherscan, ...whaleAlert]) {
      const key = m.id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(m);
    }
    merged.sort((a, b) => b.timestamp - a.timestamp);

    const data = merged.slice(0, 20);
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
