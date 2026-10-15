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
import { pairDocFields, type BinanceQuotes } from "./fx";

/** For SDG pairs only: the raw USDT/SDG data the marketPrice was derived
 *  from, so it can be shown in /admin for verification. */
export interface SdgSourceDetail {
  usdtToSdg: number; // the average used
  prices: number[]; // the individual Binance P2P offers averaged
}

export interface RateRow {
  from: CurrencyCode;
  to: CurrencyCode;
  marketPrice: number; // the pair's mid cross-rate, quoted a-per-b (charts, history, bookkeeping)
  buyPrice?: number; // Binance cost for a → b, quoted a-per-b (higher)
  sellPrice?: number; // Binance cost for b → a, quoted a-per-b (lower)
  rate: number; // marketPrice adjusted by the profit margin — what customers see/get
  marginPercent: number; // the margin actually applied to this flow (override or global default)
  marginOverride?: number; // set only if this flow (direction) has its own margin; absent = global default
  updatedAt: string | null;
  sdgSource?: SdgSourceDetail;
}

export interface PairSides {
  buyPrice?: number;
  sellPrice?: number;
}

/** Applies a margin to get the customer-facing rate for ONE direction of a
 *  pair. All prices are quoted as "units of pair.a per 1 unit of pair.b".
 *  a → b (forward): rate = buyPrice  * (1 + margin); amount_b = amount_a / rate.
 *  b → a (reverse): rate = sellPrice * (1 - margin); amount_a = amount_b * rate.
 *  buyPrice/sellPrice are the real Binance P2P buy/sell costs for each
 *  direction; if a pair doesn't have them yet (seed data, old docs), the
 *  mid marketPrice is used for both, same as before. */
export function computeRate(
  from: CurrencyCode,
  to: CurrencyCode,
  marketPrice: number,
  marginPercent: number,
  sides: PairSides = {}
): number {
  const factor = marginPercent / 100;
  const raw = isForwardDirection(from, to)
    ? (sides.buyPrice ?? marketPrice) * (1 + factor)
    : (sides.sellPrice ?? marketPrice) * (1 - factor);
  return roundForDisplay(raw);
}

/** Each flow (direction) of a pair has its own optional margin override. */
export interface FlowMargins {
  forward?: number; // a → b
  reverse?: number; // b → a
}

function rowsForPair(
  from: CurrencyCode,
  to: CurrencyCode,
  marketPrice: number,
  defaultMargin: number,
  overrides: FlowMargins,
  updatedAt: string | null,
  sdgSource?: SdgSourceDetail,
  sides: PairSides = {}
): RateRow[] {
  const shared = { marketPrice, ...sides, updatedAt, sdgSource };
  const fwd = overrides.forward ?? defaultMargin;
  const rev = overrides.reverse ?? defaultMargin;
  return [
    {
      from,
      to,
      ...shared,
      marginPercent: fwd,
      marginOverride: overrides.forward,
      rate: computeRate(from, to, marketPrice, fwd, sides),
    },
    {
      from: to,
      to: from,
      ...shared,
      marginPercent: rev,
      marginOverride: overrides.reverse,
      rate: computeRate(to, from, marketPrice, rev, sides),
    },
  ];
}

function seedRows(defaultMargin: number): RateRow[] {
  return seed.rates.flatMap((r) => {
    const a = r.from as CurrencyCode;
    const b = r.to as CurrencyCode;
    return rowsForPair(a, b, r.marketPrice, defaultMargin, {}, null);
  });
}

interface StoredPair extends PairSides {
  marketPrice: number;
  flowMargins: FlowMargins;
  updatedAt: string | null;
  sdgSource?: SdgSourceDetail;
}

const num = (v: unknown) => (typeof v === "number" ? v : undefined);

/** Per-flow margins live in `flowMargins: { "A>B": n, "B>A": n }`. Older docs
 *  only have one pair-wide `marginPercent` — that still applies to any flow
 *  that hasn't been given its own margin yet. */
function parseRateDoc(id: string, data: DocumentData): StoredPair {
  const [a, b] = id.split("_");
  const legacy = num(data.marginPercent);
  const fm = data.flowMargins ?? {};
  return {
    flowMargins: {
      forward: num(fm[`${a}>${b}`]) ?? legacy,
      reverse: num(fm[`${b}>${a}`]) ?? legacy,
    },
    marketPrice: data.marketPrice,
    buyPrice: typeof data.buyPrice === "number" ? data.buyPrice : undefined,
    sellPrice: typeof data.sellPrice === "number" ? data.sellPrice : undefined,
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
    const hasStored = typeof entry?.marketPrice === "number";
    const marketPrice = hasStored ? entry!.marketPrice : SEED_PRICES.get(key)!;
    return rowsForPair(
      a,
      b,
      marketPrice,
      defaultMargin,
      entry?.flowMargins ?? {},
      entry?.updatedAt ?? null,
      entry?.sdgSource,
      hasStored ? { buyPrice: entry!.buyPrice, sellPrice: entry!.sellPrice } : {}
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
    snap.forEach((d) => map.set(d.id, parseRateDoc(d.id, d.data())));
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
      snap.forEach((d) => next.set(d.id, parseRateDoc(d.id, d.data({ serverTimestamps: "estimate" }))));
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
      // A hand-typed price replaces Binance's buy/sell until the next auto-update.
      buyPrice: deleteField(),
      sellPrice: deleteField(),
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
    // SDG is pair.a in every SDG pair, so all three prices scale the same way.
    const ratio = newUsdtToSdg / oldUsdtToSdg;
    const newMarketPrice = oldMarketPrice * ratio;
    batch.set(
      doc(db, "rates", key),
      {
        from: a,
        to: b,
        marketPrice: newMarketPrice,
        ...(typeof data?.buyPrice === "number" ? { buyPrice: data.buyPrice * ratio } : {}),
        ...(typeof data?.sellPrice === "number" ? { sellPrice: data.sellPrice * ratio } : {}),
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

/** Sets (or clears) the margin for each flow (direction) of one pair,
 *  independent of price. Pass `null` for a flow to remove its override and
 *  use the global default margin (Settings → margin in /admin). Lets e.g.
 *  ZAR → SDG carry a different margin than SDG → ZAR. */
export async function setFlowMargins(
  a: CurrencyCode,
  b: CurrencyCode,
  margins: { forward: number | null; reverse: number | null }
) {
  if (!firebaseEnabled || !db) {
    throw new Error("Firebase is not configured — see .env.example.");
  }
  const pair = PAIRS.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))!;
  // Normalise to the pair's stored a→b order.
  const flipped = pair.a !== a;
  const fwd = flipped ? margins.reverse : margins.forward;
  const rev = flipped ? margins.forward : margins.reverse;
  await setDoc(
    doc(db, "rates", pairKey(a, b)),
    {
      flowMargins: {
        [`${pair.a}>${pair.b}`]: fwd === null ? deleteField() : fwd,
        [`${pair.b}>${pair.a}`]: rev === null ? deleteField() : rev,
      },
      // Old pair-wide margin is replaced by the two flow margins above.
      marginPercent: deleteField(),
    },
    { merge: true }
  );
}

export interface FxUpdateResult {
  updated: {
    from: CurrencyCode;
    to: CurrencyCode;
    marketPrice: number;
    buyPrice: number;
    sellPrice: number;
    sdgSource?: SdgSourceDetail;
  }[];
  skipped: string[];
}

/** Client-side "update now" — same Binance P2P source and math as the daily
 *  cron (app/api/cron/update-rates), run on demand from a logged-in admin
 *  session. Pulls live buy/sell quotes via the same-origin /api/fx relay
 *  (avoids browser CORS issues). Only touches prices, never margin
 *  overrides. Returns each updated pair so the caller can patch its own
 *  state directly instead of re-fetching the whole collection. */
export async function updateRatesFromLiveFx(): Promise<FxUpdateResult> {
  if (!firebaseEnabled || !db) {
    throw new Error("Firebase is not configured — see .env.example.");
  }
  const [res, history] = await Promise.all([fetch("/api/fx", { cache: "no-store" }), readAllHistory()]);
  const data = await res.json();
  if (!res.ok || !data.quotes) {
    throw new Error(data?.error ?? "تعذر جلب أسعار Binance الحالية");
  }
  const quotes = data.quotes as BinanceQuotes;
  const sources = (data.sources ?? {}) as Record<string, "binance" | "fx">;

  const updated: FxUpdateResult["updated"] = [];
  const skipped: string[] = [];

  // Every pair's price + history goes out in a single atomic batch.
  const batch = writeBatch(db);
  const today = todayDateStr();
  for (const { a, b } of PAIRS) {
    const key = pairKey(a, b);
    const fields = pairDocFields(a, b, quotes, sources);
    if (!fields) {
      skipped.push(key);
      continue;
    }
    batch.set(doc(db, "rates", key), { from: a, to: b, ...fields, updatedAt: serverTimestamp() }, { merge: true });
    batch.set(doc(db, "rateHistory", key), {
      entries: mergeHistoryEntry(history.get(key) ?? [], today, fields.marketPrice),
    });
    updated.push({
      from: a,
      to: b,
      marketPrice: fields.marketPrice,
      buyPrice: fields.buyPrice,
      sellPrice: fields.sellPrice,
      sdgSource:
        "sdgUsdtToSdg" in fields && typeof fields.sdgUsdtToSdg === "number"
          ? { usdtToSdg: fields.sdgUsdtToSdg, prices: fields.sdgPrices ?? [] }
          : undefined,
    });
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
 *  involves that currency, counting each direction. */
export function averageMarginFor(currency: CurrencyCode, rates: RateRow[]): number | null {
  // Both flows of every pair touching this currency (each flow has its own margin).
  const rows = rates.filter((r) => r.from === currency || r.to === currency);
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + r.marginPercent, 0) / rows.length;
}
