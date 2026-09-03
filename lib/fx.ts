const USD_SOURCE_URL = "https://open.er-api.com/v6/latest/USD";
const BINANCE_P2P_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

async function fetchUsdBaseRates(): Promise<Record<string, number>> {
  const res = await fetch(USD_SOURCE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`مصدر أسعار الصرف رجّع HTTP ${res.status}`);
  const data = await res.json();
  if (data.result !== "success" || !data.rates) {
    throw new Error(`خطأ من مصدر أسعار الصرف: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.rates as Record<string, number>;
}

/** Binance P2P doesn't publish an official public API — this mirrors the
 *  exact request Binance's own web app makes for the "Buy USDT with SDG"
 *  list, averaging the first 4 offers (lowest price first), same as Ahmed
 *  checks manually. If Binance changes this endpoint or has no SDG ads,
 *  this throws and SDG pairs are simply skipped for that run — whatever
 *  price is already stored stays in place. */
async function fetchSdgPerUsdt(): Promise<{ avg: number; prices: number[] }> {
  const res = await fetch(BINANCE_P2P_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page: 1,
      rows: 4,
      payTypes: [],
      asset: "USDT",
      tradeType: "BUY",
      fiat: "SDG",
      merchantCheck: false,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Binance P2P رجّع HTTP ${res.status}`);
  const data = await res.json();
  const ads = data?.data;
  if (!Array.isArray(ads) || ads.length === 0) {
    throw new Error("Binance P2P ما رجّع أي عروض USDT/SDG");
  }
  const prices = ads
    .slice(0, 4)
    .map((item: any) => parseFloat(item?.adv?.price))
    .filter((n: number) => !Number.isNaN(n));
  if (prices.length === 0) throw new Error("تعذر قراءة أسعار Binance P2P");
  const avg = prices.reduce((sum: number, p: number) => sum + p, 0) / prices.length;
  return { avg, prices };
}

/** Units of each currency per 1 USD, combining both sources. SDG comes from
 *  Binance P2P (see above) instead of the normal FX API, since regular FX
 *  data doesn't track Sudan's real/black-market rate. Every other pair uses
 *  this the exact same way: marketPrice(a,b) = rates[a] / rates[b].
 *  sdgDetail is returned too so callers can show/store exactly which
 *  USDT/SDG price was used (the average) and which 4 offers fed it. */
export async function fetchCombinedUsdRates(): Promise<{
  rates: Record<string, number>;
  sdgDetail?: { usdtToSdg: number; prices: number[] };
  sdgError?: string;
}> {
  const [baseResult, sdgResult] = await Promise.allSettled([fetchUsdBaseRates(), fetchSdgPerUsdt()]);

  if (baseResult.status === "rejected") {
    throw baseResult.reason;
  }
  const rates = baseResult.value;

  if (sdgResult.status === "fulfilled") {
    rates.SDG = sdgResult.value.avg;
    return { rates, sdgDetail: { usdtToSdg: sdgResult.value.avg, prices: sdgResult.value.prices } };
  }
  return {
    rates,
    sdgError: sdgResult.reason instanceof Error ? sdgResult.reason.message : String(sdgResult.reason),
  };
}
