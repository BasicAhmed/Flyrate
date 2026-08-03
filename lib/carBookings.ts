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

// waiting = booked but keys not yet handed over
// active = car is out with the renter
// completed = car has been returned
export type BookingStatus = "waiting" | "active" | "completed";

export interface CarBooking {
  id: string;
  renterName: string;
  renterPhone: string;
  bankUsed: string;
  rateType: RateType;
  quantity: number;
  rate: number; // per-unit rate snapshotted at booking time
  total: number;
  collectionAt: string; // ISO datetime — planned pickup/handover time
  returnAt: string; // ISO datetime — computed from collectionAt + duration
  status: BookingStatus;
  createdAt: string | null;
  completedAt: string | null;
}

/** Adds duration (day/week/month * quantity) to a collection date to get
 *  the expected return date. */
export function computeReturnDate(collectionAt: Date, rateType: RateType, quantity: number): Date {
  const d = new Date(collectionAt);
  if (rateType === "day") d.setDate(d.getDate() + quantity);
  else if (rateType === "week") d.setDate(d.getDate() + quantity * 7);
  else if (rateType === "month") d.setMonth(d.getMonth() + quantity);
  return d;
}

/** Creates a new booking. Status starts "waiting" (keys not yet handed over). */
export async function createBooking(input: {
  renterName: string;
  renterPhone: string;
  bankUsed: string;
  rateType: RateType;
  quantity: number;
  rate: number;
  collectionAt: string; // ISO
}): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const total = input.rate * input.quantity;
  const returnAt = computeReturnDate(new Date(input.collectionAt), input.rateType, input.quantity).toISOString();
  await addDoc(collection(db, "carBookings"), {
    ...input,
    total,
    returnAt,
    status: "waiting",
    createdAt: serverTimestamp(),
    completedAt: null,
  });
}

/** Marks the keys as handed over — car is now out with the renter. */
export async function markKeysHandedOver(id: string): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await updateDoc(doc(db, "carBookings", id), { status: "active" });
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
        bankUsed: data.bankUsed ?? "",
        rateType: data.rateType,
        quantity: data.quantity,
        rate: data.rate,
        total: data.total,
        collectionAt: data.collectionAt,
        returnAt: data.returnAt,
        status: data.status,
        createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
        completedAt: data.completedAt?.toDate?.().toISOString?.() ?? null,
      };
    });
  } catch {
    return [];
  }
}
