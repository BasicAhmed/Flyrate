import type { CurrencyCode } from "./corridors";

const BINANCE_P2P_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

/** How many top ads to ignore, and how many after that to average.
 *  Sellers sometimes push fake/low-volume ads to the very top just to look
 *  best, so the first 2 aren't reliable — ads #3–#7 are steadier. */
const SKIP_ADS = 2;
const AVG_ADS = 5;

/** Every fiat priced from Binance P2P. USDT itself is always 1. */
export const BINANCE_FIATS: CurrencyCode[] = ["SDG", "ZAR", "EGP", "MYR", "SAR", "QAR", "AED", "KES", "USD"];

/** One currency's live Binance P2P price, in units of that currency per 1 USDT.
 *  buy  = "Buy USDT" list (what you pay to get USDT — the higher price).
 *  sell = "Sell USDT" list (what you get for your USDT — the lower price).
 *  mid  = halfway between, used for charts/history and bookkeeping. */
export interface BinanceQuote {
  buy: number;
  sell: number;
  mid: number;
  buyAds: number[];
  sellAds: number[];
}

export type BinanceQuotes = Partial<Record<CurrencyCode, BinanceQuote>>;

/** Binance P2P has no official public API — this mirrors the request
 *  Binance's own web app makes for its P2P ad lists. */
async function fetchSide(fiat: CurrencyCode, tradeType: "BUY" | "SELL"): Promise<number[]> {
  const res = await fetch(BINANCE_P2P_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page: 1,
      rows: SKIP_ADS + AVG_ADS,
      payTypes: [],
      asset: "USDT",
      tradeType,
      fiat,
      merchantCheck: false,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Binance P2P ${fiat} ${tradeType}: HTTP ${res.status}`);
  const data = await res.json();
  const ads = data?.data;
  if (!Array.isArray(ads) || ads.length === 0) {
    throw new Error(`Binance P2P ما رجّع أي عروض USDT/${fiat} (${tradeType})`);
  }
  // Ads #3–#7. If there are fewer, use whatever exists past the first 2;
  // if there's nothing past the first 2, use everything rather than fail.
  const windowAds = ads.length > SKIP_ADS ? ads.slice(SKIP_ADS, SKIP_ADS + AVG_ADS) : ads;
  const prices = windowAds
    .map((item: any) => parseFloat(item?.adv?.price))
    .filter((n: number) => !Number.isNaN(n) && n > 0);
  if (prices.length === 0) throw new Error(`تعذر قراءة أسعار Binance P2P لـ ${fiat} (${tradeType})`);
  return prices;
}

const average = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Buy + sell price for one fiat. If only one side has ads, that side is
 *  used for both so the currency still gets a price. */
async function fetchQuote(fiat: CurrencyCode): Promise<BinanceQuote> {
  const [buyRes, sellRes] = await Promise.allSettled([fetchSide(fiat, "BUY"), fetchSide(fiat, "SELL")]);
  const buyAds = buyRes.status === "fulfilled" ? buyRes.value : null;
  const sellAds = sellRes.status === "fulfilled" ? sellRes.value : null;
  if (!buyAds && !sellAds) {
    throw buyRes.status === "rejected" ? buyRes.reason : new Error(`No Binance data for ${fiat}`);
  }
  const buy = average(buyAds ?? sellAds!);
  const sell = average(sellAds ?? buyAds!);
  return { buy, sell, mid: (buy + sell) / 2, buyAds: buyAds ?? [], sellAds: sellAds ?? [] };
}

/** Live Binance P2P buy/sell for every currency at once. A currency that
 *  fails is listed in `errors` and its pairs are skipped for this run —
 *  the price already stored stays in place. USD falls back to 1 (same as
 *  USDT) if Binance has no USD ads. */
export async function fetchBinanceQuotes(): Promise<{ quotes: BinanceQuotes; errors: Record<string, string> }> {
  const quotes: BinanceQuotes = { USDT: { buy: 1, sell: 1, mid: 1, buyAds: [], sellAds: [] } };
  const errors: Record<string, string> = {};
  const results = await Promise.allSettled(BINANCE_FIATS.map(fetchQuote));
  results.forEach((r, i) => {
    const fiat = BINANCE_FIATS[i];
    if (r.status === "fulfilled") quotes[fiat] = r.value;
    else if (fiat === "USD") quotes.USD = { buy: 1, sell: 1, mid: 1, buyAds: [], sellAds: [] };
    else errors[fiat] = r.reason instanceof Error ? r.reason.message : String(r.reason);
  });
  return { quotes, errors };
}

/** The three prices stored for one pair, all quoted as units of `a` per 1 `b`:
 *  - buyPrice:  cost for a → b. Turn `a` into USDT at a's BUY price, then
 *               USDT into `b` at b's SELL price → a.buy / b.sell (higher).
 *  - sellPrice: cost for b → a. Turn `b` into USDT at b's BUY price, then
 *               USDT into `a` at a's SELL price → a.sell / b.buy (lower).
 *  - marketPrice: mid / mid, kept for charts, history and bookkeeping.
 *  Null if either currency has no quote this run. */
export function pairPrices(
  a: CurrencyCode,
  b: CurrencyCode,
  quotes: BinanceQuotes
): { marketPrice: number; buyPrice: number; sellPrice: number } | null {
  const qa = quotes[a];
  const qb = quotes[b];
  if (!qa || !qb) return null;
  return {
    marketPrice: qa.mid / qb.mid,
    buyPrice: qa.buy / qb.sell,
    sellPrice: qa.sell / qb.buy,
  };
}

/** Fields written to a pair's Firestore doc on every auto-update. The SDG
 *  fields keep the admin's USDT/SDG display + manual override working. */
export function pairDocFields(a: CurrencyCode, b: CurrencyCode, quotes: BinanceQuotes) {
  const prices = pairPrices(a, b, quotes);
  if (!prices) return null;
  const sdg = a === "SDG" || b === "SDG" ? quotes.SDG : undefined;
  return {
    ...prices,
    source: "binance-p2p",
    binance: { [a]: quotes[a], [b]: quotes[b] },
    ...(sdg ? { sdgUsdtToSdg: sdg.mid, sdgPrices: [...sdg.buyAds, ...sdg.sellAds] } : {}),
  };
}
