import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";
import { pairKey, type CurrencyCode } from "./corridors";

export interface RateHistoryPoint {
  date: string; // YYYY-MM-DD
  marketPrice: number;
}

const MAX_HISTORY_DAYS = 90;

/** Pure merge logic (no Firestore dependency) so both the client SDK path
 *  and the Admin SDK path (daily cron) can share it. Re-running on the same
 *  date overwrites that day's point instead of adding a duplicate. */
export function mergeHistoryEntry(
  existing: RateHistoryPoint[],
  dateStr: string,
  marketPrice: number
): RateHistoryPoint[] {
  const withoutToday = existing.filter((e) => e.date !== dateStr);
  return [...withoutToday, { date: dateStr, marketPrice }]
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(-MAX_HISTORY_DAYS);
}

export function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Client-side append — used by the /admin "update now" button. */
export async function appendRateHistory(
  a: CurrencyCode,
  b: CurrencyCode,
  marketPrice: number,
  dateStr: string = todayDateStr()
): Promise<void> {
  if (!firebaseEnabled || !db) return; // best-effort — never break the main price update
  try {
    const key = pairKey(a, b);
    const ref = doc(db, "rateHistory", key);
    const snap = await getDoc(ref);
    const existing: RateHistoryPoint[] = snap.exists() ? snap.data().entries ?? [] : [];
    await setDoc(ref, { entries: mergeHistoryEntry(existing, dateStr, marketPrice) });
  } catch {
    // history is a nice-to-have; a failure here shouldn't surface as a price-update error
  }
}

/** Reads up to `days` of history for a pair, oldest first. Works regardless
 *  of which side (a or b) is passed — same canonical pair either way. */
export async function getRateHistory(
  a: CurrencyCode,
  b: CurrencyCode,
  days = 30
): Promise<RateHistoryPoint[]> {
  if (!firebaseEnabled || !db) return [];
  try {
    const key = pairKey(a, b);
    const snap = await getDoc(doc(db, "rateHistory", key));
    if (!snap.exists()) return [];
    const entries: RateHistoryPoint[] = snap.data().entries ?? [];
    return entries.slice(-days);
  } catch {
    return [];
  }
}
