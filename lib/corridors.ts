export type CurrencyCode = "SDG" | "ZAR" | "EGP" | "MYR" | "SAR" | "QAR" | "AED" | "USDT";

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string; // Arabic display name
  flag: string; // emoji flag, or a symbol for non-country currencies like USDT
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  SDG: { code: "SDG", name: "السودان", flag: "🇸🇩" },
  ZAR: { code: "ZAR", name: "جنوب أفريقيا", flag: "🇿🇦" },
  EGP: { code: "EGP", name: "مصر", flag: "🇪🇬" },
  MYR: { code: "MYR", name: "ماليزيا", flag: "🇲🇾" },
  SAR: { code: "SAR", name: "السعودية", flag: "🇸🇦" },
  QAR: { code: "QAR", name: "قطر", flag: "🇶🇦" },
  AED: { code: "AED", name: "الإمارات", flag: "🇦🇪" },
  USDT: { code: "USDT", name: "USDT (تيثر)", flag: "₮" },
};

export interface CurrencyPair {
  a: CurrencyCode;
  b: CurrencyCode;
}

/** Each PAIR is one corridor that works in both directions, priced from a
 *  single market price (see lib/rates.ts for the formula). `a` and `b` just
 *  fix which side the stored marketPrice is quoted from — not a "forward is
 *  better" distinction. Add a currency's whole route list here once; both
 *  directions become available automatically. */
export const PAIRS: CurrencyPair[] = [
  { a: "SDG", b: "ZAR" },
  { a: "SDG", b: "EGP" },
  { a: "SDG", b: "MYR" },
  { a: "SDG", b: "SAR" },
  { a: "SDG", b: "USDT" },
  { a: "SDG", b: "QAR" },
  { a: "SDG", b: "AED" },
  { a: "EGP", b: "ZAR" },
  { a: "EGP", b: "MYR" },
  { a: "SAR", b: "MYR" },
  { a: "QAR", b: "MYR" },
  { a: "AED", b: "MYR" },
  { a: "ZAR", b: "MYR" },
  { a: "ZAR", b: "SAR" },
  { a: "ZAR", b: "QAR" },
  { a: "ZAR", b: "AED" },
  { a: "ZAR", b: "USDT" },
];

export function findPair(x: CurrencyCode, y: CurrencyCode): CurrencyPair | undefined {
  return PAIRS.find((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x));
}

/** Firestore/seed key — always the pair's stored a_b order, regardless of
 *  which side someone is converting from. */
export function pairKey(x: CurrencyCode, y: CurrencyCode): string {
  const pair = findPair(x, y);
  if (!pair) throw new Error(`No corridor between ${x} and ${y}`);
  return `${pair.a}_${pair.b}`;
}

/** True when `from`→`to` matches the pair's stored a→b side (divide-by-rate
 *  math); false means it's the b→a side (multiply-by-rate math). Same market
 *  price either way — see computeRate in lib/rates.ts. */
export function isForwardDirection(from: CurrencyCode, to: CurrencyCode): boolean {
  const pair = findPair(from, to);
  return !!pair && pair.a === from && pair.b === to;
}

// Kept for components that only need "is this leg multiply or divide" —
// it's just the inverse of isForwardDirection now that a single market
// price drives both directions of a pair.
export function isMultiplyCorridor(from: CurrencyCode, to: CurrencyCode): boolean {
  const pair = findPair(from, to);
  return !!pair && !isForwardDirection(from, to);
}

export function validToCurrencies(from: CurrencyCode): CurrencyInfo[] {
  return PAIRS.filter((p) => p.a === from || p.b === from).map((p) =>
    CURRENCIES[p.a === from ? p.b : p.a]
  );
}

export const FROM_CURRENCIES: CurrencyInfo[] = Array.from(
  new Set(PAIRS.flatMap((p) => [p.a, p.b]))
).map((c) => CURRENCIES[c]);
