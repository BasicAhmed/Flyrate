import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  orderBy,
  query,
  limit as fbLimit,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";

export interface SaleEntry {
  date: string; // YYYY-MM-DD
  usdSold: number;
  profit: number;
  updatedAt: string | null;
}

/** Adds a transaction amount to the given day's running total (does NOT
 *  overwrite — each call accumulates). Profit for this addition is computed
 *  from the margin at the time of the call, so changing margin mid-day
 *  doesn't retroactively change earlier entries' profit contribution. */
export async function addSale(date: string, amountDelta: number, marginPercent: number): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const profitDelta = amountDelta * (marginPercent / 100);
  await setDoc(
    doc(db, "sales", date),
    {
      date,
      usdSold: increment(amountDelta),
      profit: increment(profitDelta),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getTodaySale(date: string): Promise<SaleEntry | null> {
  if (!firebaseEnabled || !db) return null;
  try {
    const snap = await getDoc(doc(db, "sales", date));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      date: data.date,
      usdSold: data.usdSold ?? 0,
      profit: data.profit ?? 0,
      updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null,
    };
  } catch {
    return null;
  }
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
        updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null,
      };
    });
  } catch {
    return [];
  }
}
