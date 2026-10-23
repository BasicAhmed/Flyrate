import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  limit as fbLimit,
  serverTimestamp,
} from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";
import type { CurrencyCode } from "./corridors";

/** One logged sale. Stored as its own document in the `sales` collection
 *  (same collection the Firestore rules already protect), so entries can be
 *  deleted individually. USD value and profit are fixed at the moment the
 *  sale is logged — later rate or margin changes never rewrite history. */
export interface SaleEntry {
  id: string;
  date: string; // YYYY-MM-DD
  currency: CurrencyCode | "USD";
  amount: number; // in `currency`
  usd: number; // USD value at logging time
  margin: number; // % used for the profit
  profit: number; // USD
  createdAt: string | null;
  /** Flow sales (من → إلى): what was paid out and in which currency. */
  toCurrency?: CurrencyCode;
  paid?: number; // amount actually paid, in toCurrency
  suggested?: number; // what the live rate said to pay
  rate?: string; // customer rate shown at the time, e.g. "1 ZAR = 345.2 SDG"
}

/** Pass `profit` when it's known exactly (flow sales: received − paid at
 *  market value); otherwise it's usd × margin. Undefined fields are dropped
 *  (Firestore rejects them). */
export async function addSale(
  entry: Omit<SaleEntry, "id" | "createdAt" | "profit"> & { profit?: number }
): Promise<SaleEntry> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const profit = typeof entry.profit === "number" ? entry.profit : entry.usd * (entry.margin / 100);
  const data = Object.fromEntries(Object.entries({ ...entry, profit }).filter(([, v]) => v !== undefined));
  const ref = await addDoc(collection(db, "sales"), { ...data, createdAt: serverTimestamp() });
  return { ...(data as Omit<SaleEntry, "id" | "createdAt">), id: ref.id, createdAt: new Date().toISOString() };
}

export async function deleteSale(id: string): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await deleteDoc(doc(db, "sales", id));
}

/** Newest first. Also reads the older one-doc-per-day format (usdSold +
 *  profit, no currency) so nothing logged before this change disappears.
 *  Throws on failure (offline / not signed in) so callers can keep showing
 *  what they already have instead of an empty list. */
export async function getSales(max = 2000): Promise<SaleEntry[]> {
  if (!firebaseEnabled || !db) return [];
  {
    const q = query(collection(db, "sales"), orderBy("date", "desc"), fbLimit(max));
    const snap = await getDocs(q);
    return snap.docs.map((d): SaleEntry => {
      const x = d.data();
      const createdAt = (x.createdAt ?? x.updatedAt)?.toDate?.().toISOString?.() ?? null;
      if (typeof x.currency !== "string") {
        const usd = Number(x.usdSold ?? 0);
        return {
          id: d.id,
          date: x.date,
          currency: "USD" as const,
          amount: usd,
          usd,
          margin: usd ? (Number(x.profit ?? 0) / usd) * 100 : 0,
          profit: Number(x.profit ?? 0),
          createdAt,
        };
      }
      return {
        id: d.id,
        date: x.date,
        currency: x.currency as SaleEntry["currency"],
        amount: Number(x.amount ?? 0),
        usd: Number(x.usd ?? 0),
        margin: Number(x.margin ?? 0),
        profit: Number(x.profit ?? 0),
        createdAt,
        ...(typeof x.toCurrency === "string" ? { toCurrency: x.toCurrency as CurrencyCode } : {}),
        ...(typeof x.paid === "number" ? { paid: x.paid } : {}),
        ...(typeof x.suggested === "number" ? { suggested: x.suggested } : {}),
        ...(typeof x.rate === "string" ? { rate: x.rate } : {}),
      };
    });
  }
}
