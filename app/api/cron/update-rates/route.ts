import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PAIRS, type CurrencyCode } from "@/lib/corridors";
import { fetchCombinedUsdRates } from "@/lib/fx";
import { mergeHistoryEntry, todayDateStr, type RateHistoryPoint } from "@/lib/rateHistory";

export const dynamic = "force-dynamic";

/** USDT tracks USD 1:1 for this purpose. Every other currency (including
 *  SDG, via Binance P2P) comes from fetchCombinedUsdRates. */
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
  let sdgError: string | undefined;
  let sdgDetail: { usdtToSdg: number; prices: number[] } | undefined;
  try {
    const result = await fetchCombinedUsdRates();
    usdRates = result.rates;
    sdgError = result.sdgError;
    sdgDetail = result.sdgDetail;
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
    const involvesSdg = a === "SDG" || b === "SDG";

    const rateA = usdRateFor(a, usdRates);
    const rateB = usdRateFor(b, usdRates);
    if (!rateA || !rateB) {
      skipped.push({
        pair: key,
        reason: involvesSdg ? sdgError ?? "SDG rate unavailable" : "missing FX data for this pair",
      });
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
        source: involvesSdg ? "auto-fx-binance-p2p" : "auto-fx",
        ...(involvesSdg && sdgDetail
          ? { sdgUsdtToSdg: sdgDetail.usdtToSdg, sdgPrices: sdgDetail.prices }
          : {}),
      },
      { merge: true }
    );
    updated.push({ pair: key, marketPrice });

    // Append to this pair's daily history (dedupes same-day reruns).
    const historyRef = db.collection("rateHistory").doc(key);
    const historySnap = await historyRef.get();
    const existing: RateHistoryPoint[] = historySnap.exists ? historySnap.data()?.entries ?? [] : [];
    await historyRef.set({ entries: mergeHistoryEntry(existing, todayDateStr(), marketPrice) });
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString(), updated, skipped, sdgError, sdgDetail });
}
