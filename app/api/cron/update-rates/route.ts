import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { PAIRS } from "@/lib/corridors";
import { fetchBinanceQuotes, pairDocFields } from "@/lib/fx";
import { mergeHistoryEntry, todayDateStr, type RateHistoryPoint } from "@/lib/rateHistory";

export const dynamic = "force-dynamic";

/** Daily auto-update: every pair's buy/sell/market price comes from Binance
 *  P2P (ads #3–#7 of the Buy and Sell USDT lists for each currency). */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let quotes: Awaited<ReturnType<typeof fetchBinanceQuotes>>["quotes"];
  let errors: Record<string, string>;
  try {
    ({ quotes, errors } = await fetchBinanceQuotes());
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  const db = getAdminDb();
  const updated: { pair: string; marketPrice: number; buyPrice: number; sellPrice: number }[] = [];
  const skipped: { pair: string; reason: string }[] = [];

  const jobs = PAIRS.map(async ({ a, b }) => {
    const key = `${a}_${b}`;
    const fields = pairDocFields(a, b, quotes);
    if (!fields) {
      skipped.push({ pair: key, reason: errors[a] ?? errors[b] ?? "no Binance price" });
      return;
    }

    const historyRef = db.collection("rateHistory").doc(key);
    const [, historySnap] = await Promise.all([
      db.collection("rates").doc(key).set({ from: a, to: b, ...fields, updatedAt: new Date() }, { merge: true }),
      historyRef.get(),
    ]);
    updated.push({ pair: key, marketPrice: fields.marketPrice, buyPrice: fields.buyPrice, sellPrice: fields.sellPrice });

    const existing: RateHistoryPoint[] = historySnap.exists ? historySnap.data()?.entries ?? [] : [];
    await historyRef.set({ entries: mergeHistoryEntry(existing, todayDateStr(), fields.marketPrice) });
  });

  await Promise.all(jobs);

  // Rebuild the cached homepage so the first visitor after the update
  // already sees the new prices.
  revalidatePath("/");

  return NextResponse.json({ ok: true, at: new Date().toISOString(), updated, skipped, errors });
}
