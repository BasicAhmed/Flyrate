import { NextResponse } from "next/server";
import { fetchBinanceQuotes } from "@/lib/fx";

export const dynamic = "force-dynamic";

/** Same-origin relay for the admin panel's "update now" button — avoids
 *  browser CORS issues hitting Binance directly. No secret needed, it's
 *  read-only public price data. */
export async function GET() {
  try {
    const { quotes, errors, sources } = await fetchBinanceQuotes();
    return NextResponse.json({ quotes, errors, sources });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
