import { NextResponse } from "next/server";
import { getAccessStatus } from "@/lib/alpha/accessStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADDR_REGEX = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet");
  if (!wallet || !ADDR_REGEX.test(wallet)) {
    return NextResponse.json(
      { success: false, message: "Valid wallet address required." },
      { status: 400 },
    );
  }
  const status = getAccessStatus(wallet);
  return NextResponse.json({ success: true, data: status });
}
