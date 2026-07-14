import { collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";
import { CORRIDORS, pairKey, isMultiplyCorridor, type CurrencyCode } from "./corridors";
import { getMarginPercent } from "./settings";
import { roundForDisplay } from "./format";
import seed from "@/data/rates.seed.json";

export interface RateRow {
  from: CurrencyCode;
  to: CurrencyCode;
  marketPrice: number;
  rate: number; // marketPrice adjusted by the profit margin — what customers see/get
  updatedAt: string | null;
}

/** Applies FlyRate's margin to a market price to get the customer-facing rate.
 *  Divide-convention corridors: marking the rate UP costs the customer more
 *  (they get less on the other side) — that's the profit.
 *  Multiply-convention corridors (SAR→ZAR, QAR→ZAR): marking the rate DOWN
 *  gives the customer less on conversion — same effect, opposite direction. */
export function computeRate(
  from: CurrencyCode,
  to: CurrencyCode,
  marketPrice: number,
  marginPercent: number
): number {
  const factor = marginPercent / 100;
  const raw = isMultiplyCorridor(from, to) ? marketPrice * (1 - factor) : marketPrice * (1 + factor);
  return roundForDisplay(raw);
}

function seedRows(marginPercent: number): RateRow[] {
  return seed.rates.map((r) => {
    const from = r.from as CurrencyCode;
    const to = r.to as CurrencyCode;
    return {
      from,
      to,
      marketPrice: r.marketPrice,
      rate: computeRate(from, to, r.marketPrice, marginPercent),
      updatedAt: null,
    };
  });
}

/** Reads all rates (market price → margin-adjusted rate). Tries Firestore
 *  first; falls back to the bundled seed file so the site works before
 *  Firebase is wired up. */
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

    return CORRIDORS.map(({ from, to }) => {
      const key = pairKey(from, to);
      const entry = map.get(key);
      const marketPrice = entry?.marketPrice ?? fallback.get(key)!;
      return {
        from,
        to,
        marketPrice,
        rate: computeRate(from, to, marketPrice, marginPercent),
        updatedAt: entry?.updatedAt ?? null,
      };
    });
  } catch {
    return seedRows(marginPercent);
  }
}

/** Writes one corridor's market price. Called from the /admin panel only.
 *  The customer-facing rate is always derived from this + the global margin. */
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
