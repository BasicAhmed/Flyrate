import { collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";
import { PAIRS, pairKey, isForwardDirection, type CurrencyCode } from "./corridors";
import { getMarginPercent } from "./settings";
import { roundForDisplay } from "./format";
import seed from "@/data/rates.seed.json";

export interface RateRow {
  from: CurrencyCode;
  to: CurrencyCode;
  marketPrice: number; // the pair's single true cross-rate, quoted a-per-b
  rate: number; // marketPrice adjusted by the profit margin — what customers see/get
  updatedAt: string | null;
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
  updatedAt: string | null
): RateRow[] {
  return [
    { from, to, marketPrice, rate: computeRate(from, to, marketPrice, marginPercent), updatedAt },
    { from: to, to: from, marketPrice, rate: computeRate(to, from, marketPrice, marginPercent), updatedAt },
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

    const map = new Map<string, { marketPrice: number; updatedAt: string | null }>();
    snap.forEach((d) => {
      const data = d.data();
      map.set(d.id, {
        marketPrice: data.marketPrice,
        updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null,
      });
    });

    const fallback = new Map(
      seed.rates.map((r) => [pairKey(r.from as CurrencyCode, r.to as CurrencyCode), r.marketPrice])
    );

    return PAIRS.flatMap(({ a, b }) => {
      const key = pairKey(a, b);
      const entry = map.get(key);
      const marketPrice = entry?.marketPrice ?? fallback.get(key)!;
      return rowsForPair(a, b, marketPrice, marginPercent, entry?.updatedAt ?? null);
    });
  } catch {
    return seedRows(marginPercent);
  }
}

/** Writes one PAIR's market price (not a direction — a pair has exactly one).
 *  Called from the /admin panel only. Pass either side's currencies; it
 *  always resolves and stores under the pair's canonical key. */
export async function setMarketPrice(from: CurrencyCode, to: CurrencyCode, marketPrice: number) {
  if (!firebaseEnabled || !db) {
    throw new Error("Firebase is not configured — see .env.example.");
  }
  const key = pairKey(from, to);
  await setDoc(doc(db, "rates", key), {
    from,
    to,
    marketPrice,
    updatedAt: serverTimestamp(),
  });
}

export interface FxUpdateResult {
  updated: string[];
  skipped: string[];
}

/** Client-side "update now" — same math as the daily cron
 *  (app/api/cron/update-rates), but runs on demand from a logged-in admin
 *  session, so it just uses the normal authenticated client SDK instead of
 *  the service account. Pulls live USD rates via the same-origin /api/fx
 *  relay (avoids browser CORS issues), then writes every non-SDG pair. */
export async function updateRatesFromLiveFx(): Promise<FxUpdateResult> {
  const res = await fetch("/api/fx", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || !data.rates) {
    throw new Error(data?.error ?? "تعذر جلب أسعار الصرف الحالية");
  }
  const usdRates = data.rates as Record<string, number>;
  const rateFor = (code: CurrencyCode) => (code === "USDT" ? 1 : usdRates[code]);

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const { a, b } of PAIRS) {
    const key = pairKey(a, b);
    if (a === "SDG" || b === "SDG") {
      skipped.push(key);
      continue;
    }
    const rateA = rateFor(a);
    const rateB = rateFor(b);
    if (!rateA || !rateB) {
      skipped.push(key);
      continue;
    }
    const marketPrice = rateA / rateB;
    await setMarketPrice(a, b, marketPrice);
    updated.push(key);
  }

  return { updated, skipped };
}
