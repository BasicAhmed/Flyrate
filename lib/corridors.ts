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

// FlyRate's exact supported corridors — one direction each (not bidirectional).
export const CORRIDORS: { from: CurrencyCode; to: CurrencyCode }[] = [
  { from: "SDG", to: "ZAR" },
  { from: "SDG", to: "EGP" },
  { from: "SDG", to: "MYR" },
  { from: "SDG", to: "SAR" },
  { from: "SDG", to: "USDT" },
  { from: "EGP", to: "ZAR" },
  { from: "EGP", to: "MYR" },
  { from: "SAR", to: "MYR" },
  { from: "SAR", to: "ZAR" },
  { from: "QAR", to: "ZAR" },
  { from: "AED", to: "ZAR" },
];

export function pairKey(from: CurrencyCode, to: CurrencyCode) {
  return `${from}_${to}`;
}

// Corridors where the calculator multiplies instead of divides.
export const MULTIPLY_CORRIDORS = new Set(["SAR_ZAR", "QAR_ZAR"]);

export function isMultiplyCorridor(from: CurrencyCode, to: CurrencyCode): boolean {
  return MULTIPLY_CORRIDORS.has(pairKey(from, to));
}

export function validToCurrencies(from: CurrencyCode): CurrencyInfo[] {
  return CORRIDORS.filter((p) => p.from === from).map((p) => CURRENCIES[p.to]);
}

export const FROM_CURRENCIES: CurrencyInfo[] = Array.from(
  new Set(CORRIDORS.map((p) => p.from))
).map((c) => CURRENCIES[c]);
