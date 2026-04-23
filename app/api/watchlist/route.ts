/* ─────────────────────────────────────────────────────────────
   Watchlist API
   POST   /api/watchlist — add (requires paid unlock for this contract)
   GET    /api/watchlist?email=...&token=... — list user's watches
   DELETE /api/watchlist?email=...&contract=...&chainId=...&token=... — remove
   ───────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";
import {
  addWatch,
  removeWatch,
  listWatchesForEmail,
  isValidEmail,
} from "@/lib/watchlistStore";
import { isUnlocked } from "@/lib/unlockStore";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { debug } from "@/lib/constants";
import { createHmac } from "crypto";

const CONTRACT_REGEX = /^0x[a-fA-F0-9]{40}$/;

function emailToken(email: string): string {
  const secret = process.env.WATCHLIST_SECRET || "dev-secret-change-me";
  return createHmac("sha256", secret).update(email.toLowerCase()).digest("hex").slice(0, 16);
}

function verifyEmailToken(email: string, token: string): boolean {
  return emailToken(email) === token;
}

export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(clientKey(req));
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, message: `Rate limited. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 },
      );
    }

    const body = await req.json();
    const email = String(body?.email || "").trim();
    const walletAddress = String(body?.walletAddress || "").toLowerCase();
    const contractAddress = String(body?.contractAddress || "").toLowerCase();
    const chainId = Number(body?.chainId || 0);
    const chainName = String(body?.chainName || "Unknown");
    const projectName = String(body?.projectName || "Unknown Project");

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, message: "Invalid email address" },
        { status: 400 },
      );
    }
    if (!CONTRACT_REGEX.test(walletAddress) || !CONTRACT_REGEX.test(contractAddress)) {
      return NextResponse.json(
        { success: false, message: "Invalid wallet or contract address" },
        { status: 400 },
      );
    }
    if (!Number.isInteger(chainId) || chainId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid chain ID" },
        { status: 400 },
      );
    }

    // Premium-gated: require paid unlock for this (wallet, contract)
    if (!isUnlocked(walletAddress, contractAddress)) {
      return NextResponse.json(
        {
          success: false,
          message: "Watchlist is a premium feature. Complete payment first.",
        },
        { status: 402 },
      );
    }

    const entry = addWatch({
      email,
      walletAddress,
      contractAddress,
      chainId,
      chainName,
      projectName,
    });

    return NextResponse.json({
      success: true,
      watchId: entry.id,
      token: emailToken(email),
      message: `Now watching ${projectName} — you'll receive an email when ownership or liquidity changes.`,
    });
  } catch (e) {
    debug("Watchlist POST failed:", e);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = (searchParams.get("email") || "").trim();
    const token = searchParams.get("token") || "";

    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, message: "Invalid email" }, { status: 400 });
    }
    if (!verifyEmailToken(email, token)) {
      return NextResponse.json({ success: false, message: "Invalid token" }, { status: 403 });
    }

    const watches = listWatchesForEmail(email).map((w) => ({
      contractAddress: w.contractAddress,
      chainId: w.chainId,
      chainName: w.chainName,
      projectName: w.projectName,
      createdAt: w.createdAt,
      lastCheckedAt: w.lastCheckedAt,
    }));

    return NextResponse.json({ success: true, watches });
  } catch (e) {
    debug("Watchlist GET failed:", e);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = (searchParams.get("email") || "").trim();
    const token = searchParams.get("token") || "";
    const contract = (searchParams.get("contract") || "").toLowerCase();
    const chainId = Number(searchParams.get("chainId") || 0);

    if (!isValidEmail(email)) {
      return NextResponse.json({ success: false, message: "Invalid email" }, { status: 400 });
    }
    if (!verifyEmailToken(email, token)) {
      return NextResponse.json({ success: false, message: "Invalid token" }, { status: 403 });
    }
    if (!CONTRACT_REGEX.test(contract) || !Number.isInteger(chainId) || chainId <= 0) {
      return NextResponse.json({ success: false, message: "Invalid parameters" }, { status: 400 });
    }

    const removed = removeWatch(email, contract, chainId);
    return NextResponse.json({ success: true, removed });
  } catch (e) {
    debug("Watchlist DELETE failed:", e);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
