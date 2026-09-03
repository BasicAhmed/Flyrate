/** Formats an already-rounded rate for display with exactly 2 decimals. */
export function formatRate(value: number): string {
  return value.toFixed(2);
}

/** Rounds a computed rate to 2 decimal places before it's shown or quoted
 *  anywhere (e.g. EGP→ZAR market price 3.165 → 3.17). */
export function roundForDisplay(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Like formatRate, but for numbers that can be much smaller than 1 (e.g.
 *  "1 SDG = 0.0028 ZAR" — SDG is worth a tiny fraction of a stronger
 *  currency). A fixed 2-decimal format would show these as a misleading
 *  "0.00". Shows more decimals only when the value actually needs them. */
export function formatSmart(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs >= 1) return value.toFixed(2);
  const decimals = Math.min(8, Math.max(2, Math.ceil(-Math.log10(abs)) + 2));
  return value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}
