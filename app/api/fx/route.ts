import { NextResponse } from "next/server";
import { fetchCombinedUsdRates } from "@/lib/fx";

export const dynamic = "force-dynamic";

/** Same-origin relay for the admin panel's "update now" button — avoids
 *  browser CORS issues hitting open.er-api.com / Binance directly. No
 *  secret needed, it's read-only public rate data. */
export async function GET() {
  try {
    const { rates, sdgError } = await fetchCombinedUsdRates();
    return NextResponse.json({ rates, sdgError });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
