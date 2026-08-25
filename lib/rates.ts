import { collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";
import { PAIRS, pairKey, isForwardDirection, type CurrencyCode } from "./corridors";
import { getMarginPercent } from "./settings";
import { roundForDisplay } from "./format";
import { appendRateHistory } from "./rateHistory";
import seed from "@/data/rates.seed.json";

/** For SDG pairs only: the raw USDT/SDG data the marketPrice was derived
 *  from, so it can be shown in /admin for verification. */
export interface SdgSourceDetail {
  usdtToSdg: number; // the average used
  prices: number[]; // the individual Binance P2P offers averaged
}

export interface RateRow {
  from: CurrencyCode;
  to: CurrencyCode;
  marketPrice: number; // the pair's single true cross-rate, quoted a-per-b
  rate: number; // marketPrice adjusted by the profit margin — what customers see/get
  updatedAt: string | null;
  sdgSource?: SdgSourceDetail;
}

/** Applies FlyRate's margin to a pair's single market price to get the
 *  customer-facing rate for ONE direction of that pair.
 *  marketPrice is always quoted as "units of pair.a per 1 unit of pair.b".
 *  a → b (forward): rate = marketPrice * (1 + margin); amount_b = amount_a / rate.
 *  b → a (reverse): rate = marketPrice * (1 - margin); amount_a = amount_b * rate.
 *  Both directions land worse than the fair mid-market cross rate by the
 *  same margin percentage — that's the spread, same % everywhere, exactly
 *  like buying currency below market and selling it above. */
export function computeRate(
  from: CurrencyCode,
  to: CurrencyCode,
  marketPrice: number,
  marginPercent: number
): number {
  const factor = marginPercent / 100;
  const raw = isForwardDirection(from, to) ? marketPrice * (1 + factor) : marketPrice * (1 - factor);
  return roundForDisplay(raw);
}

function rowsForPair(
  from: CurrencyCode,
  to: CurrencyCode,
  marketPrice: number,
  marginPercent: number,
  updatedAt: string | null,
  sdgSource?: SdgSourceDetail
): RateRow[] {
  return [
    { from, to, marketPrice, rate: computeRate(from, to, marketPrice, marginPercent), updatedAt, sdgSource },
    { from: to, to: from, marketPrice, rate: computeRate(to, from, marketPrice, marginPercent), updatedAt, sdgSource },
  ];
}

function seedRows(marginPercent: number): RateRow[] {
  return seed.rates.flatMap((r) => {
    const a = r.from as CurrencyCode;
    const b = r.to as CurrencyCode;
    return rowsForPair(a, b, r.marketPrice, marginPercent, null);
  });
}

/** Reads all rates (one stored market price per pair → both directions'
 *  margin-adjusted rates). Tries Firestore first; falls back to the bundled
 *  seed file so the site works before Firebase is wired up. */
export async function getRates(): Promise<RateRow[]> {
  const marginPercent = await getMarginPercent();
  if (!firebaseEnabled || !db) return seedRows(marginPercent);

  try {
    const snap = await getDocs(collection(db, "rates"));
    if (snap.empty) return seedRows(marginPercent);

    const map = new Map<
      string,
      { marketPrice: number; updatedAt: string | null; sdgSource?: SdgSourceDetail }
    >();
    snap.forEach((d) => {
      const data = d.data();
      map.set(d.id, {
        marketPrice: data.marketPrice,
        updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null,
        sdgSource:
          typeof data.sdgUsdtToSdg === "number" && Array.isArray(data.sdgPrices)
            ? { usdtToSdg: data.sdgUsdtToSdg, prices: data.sdgPrices }
            : undefined,
      });
    });

    const fallback = new Map(
      seed.rates.map((r) => [pairKey(r.from as CurrencyCode, r.to as CurrencyCode), r.marketPrice])
    );

    return PAIRS.flatMap(({ a, b }) => {
      const key = pairKey(a, b);
      const entry = map.get(key);
      const marketPrice = entry?.marketPrice ?? fallback.get(key)!;
      return rowsForPair(a, b, marketPrice, marginPercent, entry?.updatedAt ?? null, entry?.sdgSource);
    });
  } catch {
    return seedRows(marginPercent);
  }
}

/** Writes one PAIR's market price (not a direction — a pair has exactly one).
 *  Called from the /admin panel only. Pass either side's currencies; it
 *  always resolves and stores under the pair's canonical key. `sdgSource`
 *  is only meaningful for SDG pairs — stores the raw Binance P2P data the
 *  price came from, so /admin can show exactly what was used. */
export async function setMarketPrice(
  from: CurrencyCode,
  to: CurrencyCode,
  marketPrice: number,
  sdgSource?: SdgSourceDetail
) {
  if (!firebaseEnabled || !db) {
    throw new Error("Firebase is not configured — see .env.example.");
  }
  const key = pairKey(from, to);
  await setDoc(doc(db, "rates", key), {
    from,
    to,
    marketPrice,
    updatedAt: serverTimestamp(),
    ...(sdgSource ? { sdgUsdtToSdg: sdgSource.usdtToSdg, sdgPrices: sdgSource.prices } : {}),
  });
}

export interface FxUpdateResult {
  updated: string[];
  skipped: string[];
}

/** Client-side "update now" — same math and same sources as the daily cron
 *  (app/api/cron/update-rates), but runs on demand from a logged-in admin
 *  session using the normal authenticated client SDK instead of the service
 *  account. Pulls live rates via the same-origin /api/fx relay (avoids
 *  browser CORS issues) — that includes SDG via Binance P2P now, so every
 *  pair updates the same way; the raw SDG offers get stored too. */
export async function updateRatesFromLiveFx(): Promise<FxUpdateResult> {
  const res = await fetch("/api/fx", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || !data.rates) {
    throw new Error(data?.error ?? "تعذر جلب أسعار الصرف الحالية");
  }
  const usdRates = data.rates as Record<string, number>;
  const sdgSource: SdgSourceDetail | undefined = data.sdgDetail
    ? { usdtToSdg: data.sdgDetail.usdtToSdg, prices: data.sdgDetail.prices }
    : undefined;
  const rateFor = (code: CurrencyCode) => (code === "USDT" ? 1 : usdRates[code]);

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const { a, b } of PAIRS) {
    const key = pairKey(a, b);
    const rateA = rateFor(a);
    const rateB = rateFor(b);
    if (!rateA || !rateB) {
      skipped.push(key);
      continue;
    }
    const marketPrice = rateA / rateB;
    const involvesSdg = a === "SDG" || b === "SDG";
    await setMarketPrice(a, b, marketPrice, involvesSdg ? sdgSource : undefined);
    await appendRateHistory(a, b, marketPrice);
    updated.push(key);
  }

  return { updated, skipped };
}
