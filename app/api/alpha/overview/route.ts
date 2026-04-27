import { NextResponse } from "next/server";
import { getSignals } from "@/lib/alpha/signalEngine";
import { fetchLiveWhaleMoves } from "@/lib/alpha/whaleTracker";
import { fetchInfiProjects } from "@/lib/fetchInfiProjects";
import { fetchMarketSnapshot } from "@/lib/alpha/marketPrices";
import type { AlphaApiResponse, OverviewStats } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Number of exchange wallets we currently watch on Etherscan.
   Stays in sync with TRACKED_WALLETS in lib/alpha/whaleTracker.ts. */
const TRACKED_WALLET_COUNT = 5;

export async function GET() {
  try {
    const [signals, whales, infiProjects, snapshot] = await Promise.all([
      getSignals(),
      fetchLiveWhaleMoves(),
      fetchInfiProjects().catch(() => []),
      fetchMarketSnapshot(),
    ]);

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    /* Ecosystem health = ratio of active/listed INFI projects to total. */
    const totalProjects = infiProjects.length;
    const activeProjects = infiProjects.filter(
      (p) => p.active || p.listed,
    ).length;
    const ecosystemHealth =
      totalProjects > 0 ? (activeProjects / totalProjects) * 100 : 100;

    /* Threats blocked = INFI projects currently flagged inactive
       (Guardian / SbSe Shield filtered them out of the launchpad). */
    const threatsBlocked = totalProjects - activeProjects;

    /* Whales today = real count of $1M+ moves in the last 24h
       returned by the whale tracker. */
    const whalesToday = whales.filter((w) => w.timestamp > oneDayAgo).length;

    const data: OverviewStats = {
      signalsActive: signals.length,
      signalsLastHour: signals.filter((s) => s.timestamp > oneHourAgo).length,
      threatsBlocked24h: threatsBlocked,
      walletsMonitored: TRACKED_WALLET_COUNT,
      whalesToday,
      ecosystemHealthPct: parseFloat(ecosystemHealth.toFixed(1)),
      generatedAt: now,
    };

    /* Embed a small market snapshot in the response so the UI can
       optionally display real BTC/ETH/SOL prices without making a
       second round-trip. We extend the type loosely here. */
    const body: AlphaApiResponse<OverviewStats & { snapshot: typeof snapshot }> = {
      success: true,
      data: { ...data, snapshot },
    };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<OverviewStats> = {
      success: false,
      message: e instanceof Error ? e.message : "Overview unavailable.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
