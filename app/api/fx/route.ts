import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FX_SOURCE_URL = "https://open.er-api.com/v6/latest/USD";

/** Just relays the public USD rate table — no secret, no writes, so it's
 *  fine to leave unauthenticated. Used by both the daily cron (indirectly,
 *  via its own fetch) and the /admin "update now" button. */
export async function GET() {
  try {
    const res = await fetch(FX_SOURCE_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`FX source returned HTTP ${res.status}`);
    const data = await res.json();
    if (data.result !== "success" || !data.rates) {
      throw new Error(`FX source error: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return NextResponse.json({ rates: data.rates });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
