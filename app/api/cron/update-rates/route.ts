import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PAIRS, type CurrencyCode } from "@/lib/corridors";

export const dynamic = "force-dynamic";

/** Free, no-API-key USD cross-rate source. Returns { rates: { ZAR: 18.1, ... } }. */
const FX_SOURCE_URL = "https://open.er-api.com/v6/latest/USD";

async function fetchUsdRates(): Promise<Record<string, number>> {
  const res = await fetch(FX_SOURCE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`FX source returned HTTP ${res.status}`);
  const data = await res.json();
  if (data.result !== "success" || !data.rates) {
    throw new Error(`FX source error: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.rates as Record<string, number>;
}

/** USD isn't literally one of FlyRate's currencies, but USDT tracks it 1:1
 *  for this purpose, and it's never priced against SDG here. */
function usdRateFor(code: CurrencyCode, usdRates: Record<string, number>): number | undefined {
  if (code === "USDT") return 1;
  return usdRates[code];
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let usdRates: Record<string, number>;
  try {
    usdRates = await fetchUsdRates();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  const db = getAdminDb();
  const updated: { pair: string; marketPrice: number }[] = [];
  const skipped: { pair: string; reason: string }[] = [];

  for (const { a, b } of PAIRS) {
    const key = `${a}_${b}`;

    // Sudanese Pound stays manual — Ahmed checks it himself (see the
    // volatility warning in the calculator). Everything else auto-updates.
    if (a === "SDG" || b === "SDG") {
      skipped.push({ pair: key, reason: "SDG is manual" });
      continue;
    }

    const rateA = usdRateFor(a, usdRates);
    const rateB = usdRateFor(b, usdRates);
    if (!rateA || !rateB) {
      skipped.push({ pair: key, reason: "missing FX data for this pair" });
      continue;
    }

    // marketPrice = units of `a` per 1 unit of `b` = (a per USD) / (b per USD).
    const marketPrice = rateA / rateB;

    await db.collection("rates").doc(key).set(
      {
        from: a,
        to: b,
        marketPrice,
        updatedAt: new Date(),
        source: "auto-fx",
      },
      { merge: true }
    );
    updated.push({ pair: key, marketPrice });
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), updated, skipped });
}
