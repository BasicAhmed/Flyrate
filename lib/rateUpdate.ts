import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { PAIRS } from "./corridors";
import { fetchBinanceQuotes, pairDocFields } from "./fx";
import { mergeHistoryEntry, todayDateStr, type RateHistoryPoint } from "./rateHistory";

/** Server-only. Shared by the daily cron and the auto-update endpoint. */

export const AUTO_DOC = "autoUpdate"; // settings/autoUpdate
export const DEFAULT_AUTO_MINUTES = 30;

export interface UpdateResult {
  updated: { pair: string; marketPrice: number; buyPrice: number; sellPrice: number }[];
  skipped: { pair: string; reason: string }[];
  errors: Record<string, string>;
}

/** Pulls live Binance P2P prices and writes every pair + today's history. */
export async function runRateUpdate(db: Firestore): Promise<UpdateResult> {
  const { quotes, errors, sources } = await fetchBinanceQuotes();
  const updated: UpdateResult["updated"] = [];
  const skipped: UpdateResult["skipped"] = [];

  const historySnap = await db.collection("rateHistory").get();
  const history = new Map<string, RateHistoryPoint[]>();
  historySnap.forEach((d) => history.set(d.id, d.data().entries ?? []));

  const batch = db.batch();
  const today = todayDateStr();
  for (const { a, b } of PAIRS) {
    const key = `${a}_${b}`;
    const fields = pairDocFields(a, b, quotes, sources);
    if (!fields) {
      skipped.push({ pair: key, reason: errors[a] ?? errors[b] ?? "no Binance price" });
      continue;
    }
    batch.set(db.collection("rates").doc(key), { from: a, to: b, ...fields, updatedAt: new Date() }, { merge: true });
    batch.set(db.collection("rateHistory").doc(key), {
      entries: mergeHistoryEntry(history.get(key) ?? [], today, fields.marketPrice),
    });
    updated.push({ pair: key, marketPrice: fields.marketPrice, buyPrice: fields.buyPrice, sellPrice: fields.sellPrice });
  }
  batch.set(
    db.collection("settings").doc(AUTO_DOC),
    { lastRunAt: new Date(), lastUpdated: updated.length, lastSkipped: skipped.map((s) => s.pair) },
    { merge: true }
  );
  await batch.commit();
  return { updated, skipped, errors };
}

/** Runs an update only if auto-update is on and the last run is older than
 *  the chosen interval. A transaction "claims" the run first, so many
 *  visitors arriving at once still trigger just one Binance fetch. */
export async function maybeAutoUpdate(db: Firestore): Promise<{ ran: boolean; reason?: string; result?: UpdateResult }> {
  const ref = db.collection("settings").doc(AUTO_DOC);
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() ?? {} : {};
    if (data.enabled === false) return "off";
    const minutes = typeof data.minutes === "number" && data.minutes > 0 ? data.minutes : DEFAULT_AUTO_MINUTES;
    const last: Date | undefined = data.claimedAt?.toDate?.() ?? data.lastRunAt?.toDate?.();
    if (last && Date.now() - last.getTime() < minutes * 60_000) return "fresh";
    tx.set(ref, { claimedAt: FieldValue.serverTimestamp() }, { merge: true });
    return "claimed";
  });
  if (claimed !== "claimed") return { ran: false, reason: claimed };
  const result = await runRateUpdate(db);
  return { ran: true, result };
}
