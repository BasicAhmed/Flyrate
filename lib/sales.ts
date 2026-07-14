import {
  collection,
  doc,
  setDoc,
  getDocs,
  orderBy,
  query,
  limit as fbLimit,
  serverTimestamp,
} from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";

export interface SaleEntry {
  date: string; // YYYY-MM-DD
  usdSold: number;
  marginPercent: number;
  profit: number;
  updatedAt: string | null;
}

/** Records (or overwrites) a day's total USD sold and computes profit from
 *  the margin at the time of entry. One entry per date — saving again for
 *  the same date replaces it. */
export async function addSale(date: string, usdSold: number, marginPercent: number): Promise<number> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const profit = usdSold * (marginPercent / 100);
  await setDoc(doc(db, "sales", date), {
    date,
    usdSold,
    marginPercent,
    profit,
    updatedAt: serverTimestamp(),
  });
  return profit;
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
        usdSold: data.usdSold,
        marginPercent: data.marginPercent,
        profit: data.profit,
        updatedAt: data.updatedAt?.toDate?.().toISOString?.() ?? null,
      };
    });
  } catch {
    return [];
  }
}
