import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";

export type RateType = "day" | "week" | "month";
export type BookingStatus = "active" | "completed";

export interface CarBooking {
  id: string;
  renterName: string;
  renterPhone: string;
  rateType: RateType;
  quantity: number;
  rate: number; // per-unit rate snapshotted at booking time
  total: number;
  status: BookingStatus;
  createdAt: string | null;
  completedAt: string | null;
}

/** Creates a new booking. Status starts "active" (payment collected, car
 *  handed over) — mark it "completed" separately once the car is returned. */
export async function createBooking(input: {
  renterName: string;
  renterPhone: string;
  rateType: RateType;
  quantity: number;
  rate: number;
}): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const total = input.rate * input.quantity;
  await addDoc(collection(db, "carBookings"), {
    ...input,
    total,
    status: "active",
    createdAt: serverTimestamp(),
    completedAt: null,
  });
}

/** Marks a booking as completed — the car has been returned. */
export async function completeBooking(id: string): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await updateDoc(doc(db, "carBookings", id), {
    status: "completed",
    completedAt: serverTimestamp(),
  });
}

export async function getBookings(): Promise<CarBooking[]> {
  if (!firebaseEnabled || !db) return [];
  try {
    const q = query(collection(db, "carBookings"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        renterName: data.renterName,
        renterPhone: data.renterPhone,
        rateType: data.rateType,
        quantity: data.quantity,
        rate: data.rate,
        total: data.total,
        status: data.status,
        createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
        completedAt: data.completedAt?.toDate?.().toISOString?.() ?? null,
      };
    });
  } catch {
    return [];
  }
}
