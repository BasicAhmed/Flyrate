import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";
import type { SaleEntry } from "./sales";

/** Money Ahmed puts in or takes out of the business, outside of sales. */
export interface CapitalMove {
  id: string;
  date: string; // YYYY-MM-DD
  type: "deposit" | "withdraw";
  amount: number; // USD, always positive
  note?: string;
}

export interface CapitalSettings {
  starting: number; // USD
  startDate: string; // YYYY-MM-DD — only sales on/after this date count
  moves: CapitalMove[];
}

/** Everything lives in one doc under `settings` — already writable by the
 *  signed-in admin in the existing Firestore rules, so nothing to deploy. */
export async function getCapital(): Promise<CapitalSettings | null> {
  if (!firebaseEnabled || !db) return null;
  // Not caught on purpose: null means "not set yet", a throw means "couldn't
  // read" — the caller keeps its cached copy in that case.
  const snap = await getDoc(doc(db, "settings", "capital"));
  if (!snap.exists()) return null;
  const d = snap.data();
  if (typeof d.starting !== "number" || typeof d.startDate !== "string") return null;
  return {
    starting: d.starting,
    startDate: d.startDate,
    moves: Array.isArray(d.moves) ? d.moves : [],
  };
}

export async function saveCapital(c: CapitalSettings) {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await setDoc(doc(db, "settings", "capital"), { ...c, updatedAt: serverTimestamp() });
}

export interface CapitalSummary {
  current: number;
  starting: number;
  profit: number; // all profit since startDate
  deposits: number;
  withdrawals: number;
  growthPct: number; // profit relative to money put in (starting + deposits)
  monthProfit: number;
  monthReturnPct: number; // this month's profit vs capital at the start of the month
  avgDailyProfit: number; // over the last 30 days
  daysTracked: number;
  series: { date: string; value: number }[]; // capital at end of each day
}

/** Pure calendar math in UTC so it never drifts with the device timezone
 *  (local midnight → toISOString would step backwards in UTC+ zones). */
function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function summarizeCapital(cap: CapitalSettings, sales: SaleEntry[], today: string): CapitalSummary {
  const counted = sales.filter((s) => s.date >= cap.startDate && s.date <= today);
  const moves = cap.moves.filter((m) => m.date >= cap.startDate);

  const profit = counted.reduce((a, s) => a + s.profit, 0);
  const deposits = moves.filter((m) => m.type === "deposit").reduce((a, m) => a + m.amount, 0);
  const withdrawals = moves.filter((m) => m.type === "withdraw").reduce((a, m) => a + m.amount, 0);
  const current = cap.starting + profit + deposits - withdrawals;
  const invested = cap.starting + deposits;

  // Daily net change → running capital series
  const delta = new Map<string, number>();
  for (const s of counted) delta.set(s.date, (delta.get(s.date) ?? 0) + s.profit);
  for (const m of moves) delta.set(m.date, (delta.get(m.date) ?? 0) + (m.type === "deposit" ? m.amount : -m.amount));

  const series: { date: string; value: number }[] = [];
  let running = cap.starting;
  let guard = 0;
  for (let d = cap.startDate; d <= today && guard < 1000; d = addDays(d, 1), guard++) {
    running += delta.get(d) ?? 0;
    series.push({ date: d, value: running });
  }

  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const monthProfit = counted.filter((s) => s.date >= monthStart).reduce((a, s) => a + s.profit, 0);
  const beforeMonth = series.filter((p) => p.date < monthStart).pop()?.value ?? cap.starting;

  const since30 = addDays(today, -29);
  const last30 = counted.filter((s) => s.date >= since30).reduce((a, s) => a + s.profit, 0);
  const days30 = Math.min(30, series.length || 1);

  return {
    current,
    starting: cap.starting,
    profit,
    deposits,
    withdrawals,
    growthPct: invested > 0 ? (profit / invested) * 100 : 0,
    monthProfit,
    monthReturnPct: beforeMonth > 0 ? (monthProfit / beforeMonth) * 100 : 0,
    avgDailyProfit: last30 / days30,
    daysTracked: series.length,
    series,
  };
}
