import { NextResponse } from "next/server";
import {
  fetchOrderBook,
  ORDERBOOK_SUPPORTED_SYMBOLS,
} from "@/lib/alpha/orderbookClient";
import type { OrderBookSnapshot } from "@/lib/alpha/orderbookClient";
import type { AlphaApiResponse } from "@/lib/alpha/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = (url.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();

  if (!ORDERBOOK_SUPPORTED_SYMBOLS.includes(symbol)) {
    const body: AlphaApiResponse<OrderBookSnapshot> = {
      success: false,
      message: `Unsupported symbol. Supported: ${ORDERBOOK_SUPPORTED_SYMBOLS.join(", ")}`,
    };
    return NextResponse.json(body, { status: 400 });
  }

  const data = await fetchOrderBook(symbol);
  if (!data) {
    const body: AlphaApiResponse<OrderBookSnapshot> = {
      success: false,
      message: "Order book temporarily unavailable from Binance.",
    };
    return NextResponse.json(body, { status: 503 });
  }
  const body: AlphaApiResponse<OrderBookSnapshot> = { success: true, data };
  return NextResponse.json(body);
}
