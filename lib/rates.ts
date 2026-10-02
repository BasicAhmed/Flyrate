import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteField,
  serverTimestamp,
  onSnapshot,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";
import { PAIRS, pairKey, isForwardDirection, isMultiplyCorridor, type CurrencyCode } from "./corridors";
import { getMarginPercent } from "./settings";
import { roundForDisplay } from "./format";
import { mergeHistoryEntry, todayDateStr, type RateHistoryPoint } from "./rateHistory";
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
  marginPercent: number; // the margin actually applied to this pair (override or global default)
  marginOverride?: number; // set only if this pair has a custom margin; absent = using the global default
  updatedAt: string | null;
  sdgSource?: SdgSourceDetail;
}

/** Applies a margin to a pair's single market price to get the
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
  marginOverride: number | undefined,
  updatedAt: string | null,
  sdgSource?: SdgSourceDetail
): RateRow[] {
  return [
    {
      from,
      to,
      marketPrice,
      rate: computeRate(from, to, marketPrice, marginPercent),
      marginPercent,
      marginOverride,
      updatedAt,
      sdgSource,
    },
    {
      from: to,
      to: from,
      marketPrice,
      rate: computeRate(to, from, marketPrice, marginPercent),
      marginPercent,
      marginOverride,
      updatedAt,
      sdgSource,
    },
  ];
}

function seedRows(defaultMargin: number): RateRow[] {
  return seed.rates.flatMap((r) => {
    const a = r.from as CurrencyCode;
    const b = r.to as CurrencyCode;
    return rowsForPair(a, b, r.marketPrice, defaultMargin, undefined, null);
  });
}

interface StoredPair {
  marketPrice: number;
  marginOverride?: number;
  updatedAt: string | null;
  sdgSource?: SdgSourceDetail;
}

function parseRateDoc(data: DocumentData): StoredPair {
  return {
    marketPrice: data.marketPrice,
    marginOverride: typeof data.marginPercent === "number" ? data.marginPercent : undefined,
    updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null,
    sdgSource:
      typeof data.sdgUsdtToSdg === "number" && Array.isArray(data.sdgPrices)
        ? { usdtToSdg: data.sdgUsdtToSdg, prices: data.sdgPrices }
        : undefined,
  };
}

const SEED_PRICES = new Map(
  seed.rates.map((r) => [pairKey(r.from as CurrencyCode, r.to as CurrencyCode), r.marketPrice])
);

/** Stored pairs + global margin → both directions' customer rates for every
 *  corridor. Shared by the one-off read and the realtime subscription. */
function buildRates(map: Map<string, StoredPair>, defaultMargin: number): RateRow[] {
  return PAIRS.flatMap(({ a, b }) => {
    const key = pairKey(a, b);
    const entry = map.get(key);
    const marketPrice = typeof entry?.marketPrice === "number" ? entry.marketPrice : SEED_PRICES.get(key)!;
    return rowsForPair(
      a,
      b,
      marketPrice,
      entry?.marginOverride ?? defaultMargin,
      entry?.marginOverride,
      entry?.updatedAt ?? null,
      entry?.sdgSource
    );
  });
}

/** Reads all rates (one stored market price + optional margin override per
 *  pair → both directions' margin-adjusted rates). Pairs without their own
 *  override use the global default margin. Tries Firestore first; falls
 *  back to the bundled seed file so the site works before Firebase is
 *  wired up. Margin and rates are fetched in parallel. */
export async function getRatesWithMargin(
  opts: { strict?: boolean } = {}
): Promise<{ rates: RateRow[]; defaultMargin: number }> {
  if (!firebaseEnabled || !db) {
    const defaultMargin = await getMarginPercent();
    return { rates: seedRows(defaultMargin), defaultMargin };
  }

  try {
    const [defaultMargin, snap] = await Promise.all([getMarginPercent(), getDocs(collection(db, "rates"))]);
    if (snap.empty) return { rates: seedRows(defaultMargin), defaultMargin };
    const map = new Map<string, StoredPair>();
    snap.forEach((d) => map.set(d.id, parseRateDoc(d.data())));
    return { rates: buildRates(map, defaultMargin), defaultMargin };
  } catch (err) {
    // strict: the caller has something better to show than placeholder
    // seed prices (e.g. /admin's cached copy) — let it know the read failed.
    if (opts.strict) throw err;
    const defaultMargin = await getMarginPercent().catch(() => 3.5);
    return { rates: seedRows(defaultMargin), defaultMargin };
  }
}

/** Realtime prices for pages that are already open: fires with fresh rows
 *  the moment a market price or margin changes (admin save, "update now",
 *  or the daily cron) — no reload needed. Returns an unsubscribe function.
 *  Silent no-op when Firebase isn't configured. */
export function subscribeLiveRates(onRates: (rates: RateRow[]) => void): () => void {
  if (!firebaseEnabled || !db) return () => {};

  let map: Map<string, StoredPair> | null = null;
  let margin: number | null = null;
  const emit = () => {
    if (map && map.size > 0 && margin !== null) onRates(buildRates(map, margin));
  };

  const offRates = onSnapshot(
    collection(db, "rates"),
    (snap) => {
      const next = new Map<string, StoredPair>();
      snap.forEach((d) => next.set(d.id, parseRateDoc(d.data({ serverTimestamps: "estimate" }))));
      map = next;
      emit();
    },
    () => {} // offline / blocked — the server-rendered prices stay on screen
  );
  const offMargin = onSnapshot(
    doc(db, "settings", "margin"),
    (snap) => {
      const v = snap.exists() ? snap.data().percent : undefined;
      margin = typeof v === "number" ? v : 3.5;
      emit();
    },
    () => {}
  );

  return () => {
    offRates();
    offMargin();
  };
}

/** Convenience wrapper for callers that only need the rate rows (the public
 *  site — Calculator, RateTicker, RatesTable). Admin should use
 *  getRatesWithMargin() instead to avoid fetching the margin twice. */
export async function getRates(): Promise<RateRow[]> {
  return (await getRatesWithMargin()).rates;
}

/** Writes one PAIR's market price (not a direction — a pair has exactly one).
 *  Called from the /admin panel only. Pass either side's currencies; it
 *  always resolves and stores under the pair's canonical key. `sdgSource`
 *  is only meaningful for SDG pairs — stores the raw Binance P2P data the
 *  price came from, so /admin can show exactly what was used. Does NOT
 *  touch the pair's margin override — use setPairMargin for that. */
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
  await setDoc(
    doc(db, "rates", key),
    {
      from,
      to,
      marketPrice,
      updatedAt: serverTimestamp(),
      ...(sdgSource ? { sdgUsdtToSdg: sdgSource.usdtToSdg, sdgPrices: sdgSource.prices } : {}),
    },
    { merge: true }
  );
}

/** Manually overrides the shared USDT/SDG price used across every SDG
 *  pair (e.g. Ahmed found a cheaper source than Binance P2P that day).
 *  Rescales each SDG pair's stored marketPrice proportionally — the ratio
 *  of new-to-old USDT/SDG applies equally to all of them, since marketPrice
 *  = usdtToSdg / (other currency's USD rate), and the other currency's rate
 *  hasn't changed. Only rescales pairs that already have a baseline
 *  (sdgUsdtToSdg from a previous auto-update) — a pair that's never been
 *  auto-updated yet has nothing to rescale from, so it's left alone. */
export async function setSdgUsdtOverride(newUsdtToSdg: number): Promise<void> {
  if (!firebaseEnabled || !db) {
    throw new Error("Firebase is not configured — see .env.example.");
  }
  // Two reads, one atomic write — instead of 4 round trips per SDG pair.
  const [ratesSnap, history] = await Promise.all([getDocs(collection(db, "rates")), readAllHistory()]);
  const stored = new Map<string, DocumentData>();
  ratesSnap.forEach((d) => stored.set(d.id, d.data()));

  const batch = writeBatch(db);
  const today = todayDateStr();
  for (const { a, b } of PAIRS) {
    if (a !== "SDG" && b !== "SDG") continue;
    const key = pairKey(a, b);
    const data = stored.get(key);
    const oldMarketPrice = data?.marketPrice;
    const oldUsdtToSdg = data?.sdgUsdtToSdg;
    if (typeof oldMarketPrice !== "number" || typeof oldUsdtToSdg !== "number" || oldUsdtToSdg === 0) {
      continue; // no baseline yet — leave this pair untouched
    }
    const newMarketPrice = oldMarketPrice * (newUsdtToSdg / oldUsdtToSdg);
    batch.set(
      doc(db, "rates", key),
      {
        from: a,
        to: b,
        marketPrice: newMarketPrice,
        updatedAt: serverTimestamp(),
        sdgUsdtToSdg: newUsdtToSdg,
        sdgPrices: [],
        source: "manual-override",
      },
      { merge: true }
    );
    batch.set(doc(db, "rateHistory", key), {
      entries: mergeHistoryEntry(history.get(key) ?? [], today, newMarketPrice),
    });
  }
  await batch.commit();
}

/** Every pair's stored history in ONE query (vs one read per pair). Best
 *  effort: if it fails we still update prices, just from empty history. */
async function readAllHistory(): Promise<Map<string, RateHistoryPoint[]>> {
  const out = new Map<string, RateHistoryPoint[]>();
  if (!db) return out;
  try {
    const snap = await getDocs(collection(db, "rateHistory"));
    snap.forEach((d) => out.set(d.id, d.data().entries ?? []));
  } catch {
    // history is a nice-to-have
  }
  return out;
}

/** Sets (or clears) a pair-specific margin override, independent of market
 *  price. Pass `percent: null` to remove the override and fall back to the
 *  global default margin (Settings → margin in /admin). High-demand
 *  corridors (e.g. anything involving SDG) can carry a higher margin;
 *  low-demand ones can be priced closer to market to stay competitive. */
export async function setPairMargin(from: CurrencyCode, to: CurrencyCode, percent: number | null) {
  if (!firebaseEnabled || !db) {
    throw new Error("Firebase is not configured — see .env.example.");
  }
  const key = pairKey(from, to);
  await setDoc(
    doc(db, "rates", key),
    { marginPercent: percent === null ? deleteField() : percent },
    { merge: true }
  );
}

export interface FxUpdateResult {
  updated: { from: CurrencyCode; to: CurrencyCode; marketPrice: number; sdgSource?: SdgSourceDetail }[];
  skipped: string[];
}

/** Client-side "update now" — same math and same sources as the daily cron
 *  (app/api/cron/update-rates), but runs on demand from a logged-in admin
 *  session using the normal authenticated client SDK instead of the service
 *  account. Pulls live rates via the same-origin /api/fx relay (avoids
 *  browser CORS issues) — that includes SDG via Binance P2P now, so every
 *  pair updates the same way; the raw SDG offers get stored too. Only
 *  touches market prices, never margin overrides. Returns each updated
 *  pair's new marketPrice/sdgSource so the caller can patch its own state
 *  directly instead of re-fetching the whole collection afterward. */
export async function updateRatesFromLiveFx(): Promise<FxUpdateResult> {
  if (!firebaseEnabled || !db) {
    throw new Error("Firebase is not configured — see .env.example.");
  }
  // Live FX and stored history are independent — fetch both at once.
  const [res, history] = await Promise.all([fetch("/api/fx", { cache: "no-store" }), readAllHistory()]);
  const data = await res.json();
  if (!res.ok || !data.rates) {
    throw new Error(data?.error ?? "تعذر جلب أسعار الصرف الحالية");
  }
  const usdRates = data.rates as Record<string, number>;
  const sdgSource: SdgSourceDetail | undefined = data.sdgDetail
    ? { usdtToSdg: data.sdgDetail.usdtToSdg, prices: data.sdgDetail.prices }
    : undefined;
  const rateFor = (code: CurrencyCode) => (code === "USDT" ? 1 : usdRates[code]);

  const updated: FxUpdateResult["updated"] = [];
  const skipped: string[] = [];

  // Every pair's price + history goes out in a single atomic batch (one
  // round trip) instead of ~3 separate calls per pair.
  const batch = writeBatch(db);
  const today = todayDateStr();
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
    const pairSdgSource = involvesSdg ? sdgSource : undefined;
    batch.set(
      doc(db, "rates", key),
      {
        from: a,
        to: b,
        marketPrice,
        updatedAt: serverTimestamp(),
        ...(pairSdgSource ? { sdgUsdtToSdg: pairSdgSource.usdtToSdg, sdgPrices: pairSdgSource.prices } : {}),
      },
      { merge: true }
    );
    batch.set(doc(db, "rateHistory", key), {
      entries: mergeHistoryEntry(history.get(key) ?? [], today, marketPrice),
    });
    updated.push({ from: a, to: b, marketPrice, sdgSource: pairSdgSource });
  }
  await batch.commit();

  return { updated, skipped };
}

/** Shortest chain of corridors between two currencies (breadth-first), e.g.
 *  USD → MYR → ZAR → USDT. Null if they aren't connected at all. */
function corridorPath(from: CurrencyCode, to: CurrencyCode): CurrencyCode[] | null {
  const prev = new Map<CurrencyCode, CurrencyCode>();
  const seen = new Set<CurrencyCode>([from]);
  const queue: CurrencyCode[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const p of PAIRS) {
      const n = p.a === cur ? p.b : p.b === cur ? p.a : null;
      if (!n || seen.has(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!seen.has(to)) return null;
  const path: CurrencyCode[] = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return path;
}

/** Converts an amount between any two supported currencies at customer
 *  rates, following the shortest corridor chain (direct pair if one
 *  exists). Returns null only if a required leg isn't priced — customer-
 *  facing math fails safe, not silently wrong. */
export function convertBetween(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: RateRow[]
): number | null {
  if (from === to) return amount;
  const path = corridorPath(from, to);
  if (!path) return null;
  let amt = amount;
  for (let i = 0; i < path.length - 1; i++) {
    const row = rates.find((r) => r.from === path[i] && r.to === path[i + 1]);
    if (!row) return null;
    amt = isMultiplyCorridor(path[i], path[i + 1]) ? amt * row.rate : amt / row.rate;
  }
  return amt;
}

/** Same routing as convertBetween, but at the fair mid-market price (no
 *  margin) — used for bookkeeping, e.g. valuing today's MYR sales in USD.
 *  USDT is treated as USD. marketPrice is "a per 1 b", so a→b divides and
 *  b→a multiplies. */
export function convertMid(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rates: RateRow[]
): number | null {
  if (from === to) return amount;
  const path = corridorPath(from, to);
  if (!path) return null;
  let amt = amount;
  for (let i = 0; i < path.length - 1; i++) {
    const row = rates.find((r) => r.from === path[i] && r.to === path[i + 1]);
    if (!row || !row.marketPrice) return null;
    amt = isForwardDirection(path[i], path[i + 1]) ? amt / row.marketPrice : amt * row.marketPrice;
  }
  return amt;
}

/** Margin to book profit at when Ahmed records a sale in `currency` without
 *  naming the other side: the average margin across every pair that
 *  involves that currency. */
export function averageMarginFor(currency: CurrencyCode, rates: RateRow[]): number | null {
  const rows = PAIRS.filter((p) => p.a === currency || p.b === currency)
    .map((p) => rates.find((r) => r.from === p.a && r.to === p.b))
    .filter((r): r is RateRow => !!r);
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + r.marginPercent, 0) / rows.length;
}
