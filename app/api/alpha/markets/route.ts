import { NextResponse } from "next/server";
import {
  fetchTop50Crypto,
  fetchTop50Stocks,
} from "@/lib/alpha/topMarketsClient";
import type { CryptoRow, StockRow } from "@/lib/alpha/topMarketsClient";
import type { AlphaApiResponse } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MarketsResp {
  crypto: CryptoRow[];
  stocks: StockRow[];
  generatedAt: number;
}

export async function GET() {
  try {
    const [crypto, stocks] = await Promise.all([
      fetchTop50Crypto(),
      fetchTop50Stocks(),
    ]);
    const body: AlphaApiResponse<MarketsResp> = {
      success: true,
      data: { crypto, stocks, generatedAt: Date.now() },
    };
    return NextResponse.json(body);
  } catch (e) {
    const body: AlphaApiResponse<MarketsResp> = {
      success: false,
      message: e instanceof Error ? e.message : "Markets data error.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
