/** Formats an already-rounded rate for display with exactly 2 decimals. */
export function formatRate(value: number): string {
  return value.toFixed(2);
}

/** Rounds a computed rate to 2 decimal places before it's shown or quoted
 *  anywhere (e.g. EGP→ZAR market price 3.165 → 3.17). */
export function roundForDisplay(value: number): number {
  return Math.round(value * 100) / 100;
}
