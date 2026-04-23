/* ─────────────────────────────────────────────────────────────
   GET /api/cron/check-watchlist
   Runs on Vercel cron every 6 hours (configured in vercel.json).

   For each active watch entry:
   1. Reads current owner() via eth_call (using verified RPC fallbacks)
   2. Reads current liquidity from DexScreener
   3. Diffs against last snapshot
   4. If changed — emails user, updates snapshot
   5. Always updates lastCheckedAt

   Protected by CRON_SECRET header to prevent abuse.
   ───────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";
import {
  listAllActiveWatches,
  updateSnapshot,
  markNotified,
  type WatchEntry,
} from "@/lib/watchlistStore";
import { sendEmail, renderWatchlistAlertEmail } from "@/lib/emailSender";
import { PAYMENT_CHAINS } from "@/lib/verifyPayment";
import { debug } from "@/lib/constants";
import { createHmac } from "crypto";

/** owner() function selector */
const OWNER_SELECTOR = "0x8da5cb5b";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

export async function GET(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && bearer !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const watches = listAllActiveWatches();
  const results = {
    total: watches.length,
    checked: 0,
    changed: 0,
    emailed: 0,
    errors: 0,
    items: [] as Array<{ id: string; status: string; changes?: string[] }>,
  };

  for (const watch of watches) {
    try {
      const changes = await checkWatchEntry(watch);
      results.checked++;
      if (changes.length > 0) {
        results.changed++;
        const emailed = await notifyUser(watch, changes);
        if (emailed) results.emailed++;
        markNotified(watch.id);
      }
      results.items.push({
        id: watch.id,
        status: changes.length ? "changed" : "stable",
        changes: changes.length ? changes : undefined,
      });
    } catch (e) {
      debug(`Cron check failed for ${watch.id}:`, e);
      results.errors++;
      results.items.push({ id: watch.id, status: "error" });
    }
  }

  return NextResponse.json(results);
}

async function checkWatchEntry(watch: WatchEntry): Promise<string[]> {
  const chain = PAYMENT_CHAINS[watch.chainId];
  if (!chain) return [];

  const rpcs = chain.rpcs;
  const changes: string[] = [];

  // Check owner()
  const currentOwner = await readOwner(rpcs, watch.contractAddress);

  // Check liquidity
  const currentLiquidity = await readLiquidity(watch.contractAddress);

  // First run — just snapshot, no notification
  if (watch.lastCheckedAt === undefined) {
    updateSnapshot(watch.id, {
      lastOwner: currentOwner,
      lastLiquidityUsd: currentLiquidity,
    });
    return [];
  }

  // Owner change
  if (currentOwner !== null && watch.lastOwner !== undefined) {
    if (normalizeAddr(currentOwner) !== normalizeAddr(watch.lastOwner || "")) {
      const oldIsDead = isRenounced(watch.lastOwner || null);
      const newIsDead = isRenounced(currentOwner);
      if (newIsDead && !oldIsDead) {
        changes.push(`Ownership renounced. Previous owner: ${short(watch.lastOwner)}`);
      } else if (!newIsDead && oldIsDead) {
        changes.push(`Owner regained privileges. New owner: ${short(currentOwner)}`);
      } else {
        changes.push(`Ownership transferred: ${short(watch.lastOwner)} → ${short(currentOwner)}`);
      }
    }
  }

  // Liquidity change — only flag significant drops (>20%) or large additions (>50%)
  if (
    currentLiquidity !== null &&
    watch.lastLiquidityUsd !== undefined &&
    watch.lastLiquidityUsd !== null &&
    watch.lastLiquidityUsd > 0
  ) {
    const prev = watch.lastLiquidityUsd;
    const curr = currentLiquidity;
    const pct = ((curr - prev) / prev) * 100;
    if (pct <= -20) {
      changes.push(
        `Liquidity dropped ${Math.abs(pct).toFixed(0)}% ($${Math.round(prev).toLocaleString()} → $${Math.round(curr).toLocaleString()})`,
      );
    } else if (pct >= 50) {
      changes.push(
        `Liquidity increased ${pct.toFixed(0)}% ($${Math.round(prev).toLocaleString()} → $${Math.round(curr).toLocaleString()})`,
      );
    }
  }

  updateSnapshot(watch.id, {
    lastOwner: currentOwner,
    lastLiquidityUsd: currentLiquidity,
  });

  return changes;
}

async function readOwner(
  rpcs: string[],
  contract: string,
): Promise<string | null> {
  for (const rpc of rpcs) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: contract, data: OWNER_SELECTOR }, "latest"],
        }),
        signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.error) continue;
      const result = data.result;
      if (!result || result === "0x" || result.length < 42) return null;
      return "0x" + result.slice(-40).toLowerCase();
    } catch {
      /* try next RPC */
    }
  }
  return null;
}

async function readLiquidity(contract: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${contract}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const pairs: any[] = data?.pairs || [];
    if (!pairs.length) return null;
    let total = 0;
    for (const p of pairs) {
      if (p?.liquidity?.usd) total += Number(p.liquidity.usd);
    }
    return total;
  } catch {
    return null;
  }
}

function normalizeAddr(addr: string): string {
  return (addr || "").toLowerCase();
}

function short(addr: string | null | undefined): string {
  if (!addr) return "unknown";
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isRenounced(addr: string | null | undefined): boolean {
  if (!addr) return false;
  const n = addr.toLowerCase();
  return n === ZERO_ADDRESS || n === DEAD_ADDRESS;
}

async function notifyUser(watch: WatchEntry, changes: string[]): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sbse-guardian-ai.vercel.app";
  const secret = process.env.WATCHLIST_SECRET || "dev-secret-change-me";
  const token = createHmac("sha256", secret).update(watch.email).digest("hex").slice(0, 16);
  const unsubUrl = `${siteUrl}/api/watchlist?email=${encodeURIComponent(watch.email)}&token=${token}&contract=${watch.contractAddress}&chainId=${watch.chainId}`;
  const reportUrl = `${siteUrl}/?contract=${watch.contractAddress}`;

  const { subject, html, text } = renderWatchlistAlertEmail({
    projectName: watch.projectName,
    contractAddress: watch.contractAddress,
    chainName: watch.chainName,
    changes,
    reportUrl,
    unsubscribeUrl: unsubUrl,
  });

  const result = await sendEmail({
    to: watch.email,
    subject,
    html,
    text,
  });

  return result.sent;
}
