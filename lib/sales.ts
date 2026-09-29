import {
  collection,
  doc,
  setDoc,
  getDocs,
  orderBy,
  query,
  limit as fbLimit,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";
import type { CurrencyCode } from "./corridors";

/** Per-currency running totals inside one day. `amount` is in the currency
 *  itself (e.g. 10,000 MYR); `usd` and `profit` are already converted. */
export interface CurrencyTotals {
  amount: number;
  usd: number;
  profit: number;
}

export interface SaleEntry {
  date: string; // YYYY-MM-DD
  usdSold: number; // sum of every currency's USD value that day
  profit: number; // USD
  byCurrency: Partial<Record<CurrencyCode, CurrencyTotals>>;
  updatedAt: string | null;
}

export interface SaleInput {
  date: string;
  currency: CurrencyCode; // the currency Ahmed sold, e.g. MYR
  amount: number; // in that currency, e.g. 10000
  usdValue: number; // amount converted to USD at mid-market
  marginPercent: number; // margin of the pair the sale went through
}

/** Adds one sale to its day. Everything accumulates (increment), so several
 *  sales on the same day in different currencies all land in one doc, and
 *  profit for each addition uses the margin at the time it was recorded. */
export async function addSale(s: SaleInput): Promise<{ usd: number; profit: number }> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const profit = s.usdValue * (s.marginPercent / 100);
  await setDoc(
    doc(db, "sales", s.date),
    {
      date: s.date,
      usdSold: increment(s.usdValue),
      profit: increment(profit),
      byCurrency: {
        [s.currency]: {
          amount: increment(s.amount),
          usd: increment(s.usdValue),
          profit: increment(profit),
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return { usd: s.usdValue, profit };
}

function parseByCurrency(raw: unknown): SaleEntry["byCurrency"] {
  if (!raw || typeof raw !== "object") return {};
  const out: SaleEntry["byCurrency"] = {};
  for (const [code, v] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    out[code as CurrencyCode] = {
      amount: typeof v?.amount === "number" ? v.amount : 0,
      usd: typeof v?.usd === "number" ? v.usd : 0,
      profit: typeof v?.profit === "number" ? v.profit : 0,
    };
  }
  return out;
}

export async function getRecentSales(days = 30): Promise<SaleEntry[]> {
  if (!firebaseEnabled || !db) return [];
  try {
    const q = query(collection(db, "sales"), orderBy("date", "desc"), fbLimit(days));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        date: data.date,
        usdSold: data.usdSold ?? 0,
        profit: data.profit ?? 0,
        byCurrency: parseByCurrency(data.byCurrency),
        updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null,
      };
    });
  } catch {
    return [];
  }
}
