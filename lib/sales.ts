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
}

export async function addSale(entry: Omit<SaleEntry, "id" | "createdAt" | "profit">): Promise<SaleEntry> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const profit = entry.usd * (entry.margin / 100);
  const ref = await addDoc(collection(db, "sales"), {
    ...entry,
    profit,
    createdAt: serverTimestamp(),
  });
  return { ...entry, id: ref.id, profit, createdAt: new Date().toISOString() };
}

export async function deleteSale(id: string): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await deleteDoc(doc(db, "sales", id));
}

/** Newest first. Also reads the older one-doc-per-day format (usdSold +
 *  profit, no currency) so nothing logged before this change disappears. */
export async function getSales(max = 2000): Promise<SaleEntry[]> {
  if (!firebaseEnabled || !db) return [];
  try {
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
      };
    });
  } catch {
    return [];
  }
}
