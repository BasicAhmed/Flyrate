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

// awaiting_payment = self-booked by renter, payment not yet confirmed (expires in 3h)
// waiting = payment confirmed, keys not yet handed over
// active = car is out with the renter
// completed = car has been returned
// cancelled = payment window expired without confirmation
export type BookingStatus = "awaiting_payment" | "waiting" | "active" | "completed" | "cancelled";

export interface CarBooking {
  id: string;
  bookingNumber: string;
  renterName: string;
  renterPhone: string;
  bankUsed: string;
  rateType: RateType;
  quantity: number;
  rate: number;
  total: number;
  collectionAt: string; // ISO datetime — planned pickup/handover time
  returnAt: string; // ISO datetime — computed from collectionAt + duration
  paymentDeadline: string | null; // ISO datetime — only set for self-bookings
  status: BookingStatus;
  createdAt: string | null;
  completedAt: string | null;
}

export function computeReturnDate(collectionAt: Date, rateType: RateType, quantity: number): Date {
  const d = new Date(collectionAt);
  if (rateType === "day") d.setDate(d.getDate() + quantity);
  else if (rateType === "week") d.setDate(d.getDate() + quantity * 7);
  else if (rateType === "month") d.setMonth(d.getMonth() + quantity);
  return d;
}

function genBookingNumber(): string {
  return `FR-${Date.now().toString().slice(-6)}`;
}

/** Used by the private /lancer dashboard — booking starts "waiting"
 *  (payment already handled in person, just needs key handover). */
export async function createBooking(input: {
  renterName: string;
  renterPhone: string;
  bankUsed: string;
  rateType: RateType;
  quantity: number;
  rate: number;
  collectionAt: string;
}): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const total = input.rate * input.quantity;
  const returnAt = computeReturnDate(new Date(input.collectionAt), input.rateType, input.quantity).toISOString();
  await addDoc(collection(db, "carBookings"), {
    ...input,
    total,
    returnAt,
    bookingNumber: genBookingNumber(),
    paymentDeadline: null,
    status: "waiting",
    createdAt: serverTimestamp(),
    completedAt: null,
  });
}

/** Used by the PUBLIC self-booking page (no auth). Status is forced to
 *  "awaiting_payment" by the Firestore rules regardless of what's sent. */
export async function createPublicBooking(input: {
  renterName: string;
  renterPhone: string;
  bankUsed: string;
  rateType: RateType;
  quantity: number;
  rate: number;
  collectionAt: string;
}): Promise<string> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const total = input.rate * input.quantity;
  const returnAt = computeReturnDate(new Date(input.collectionAt), input.rateType, input.quantity).toISOString();
  const bookingNumber = genBookingNumber();
  const paymentDeadline = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
  await addDoc(collection(db, "carBookings"), {
    ...input,
    total,
    returnAt,
    bookingNumber,
    paymentDeadline,
    status: "awaiting_payment",
    createdAt: serverTimestamp(),
    completedAt: null,
  });
  return bookingNumber;
}

/** Friend/Ahmed confirms payment proof received — moves to "waiting". */
export async function confirmPayment(id: string): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await updateDoc(doc(db, "carBookings", id), { status: "waiting" });
}

export async function cancelBooking(id: string): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await updateDoc(doc(db, "carBookings", id), { status: "cancelled" });
}

export async function markKeysHandedOver(id: string): Promise<void> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await updateDoc(doc(db, "carBookings", id), { status: "active" });
}

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
    const bookings = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        bookingNumber: data.bookingNumber ?? "—",
        renterName: data.renterName,
        renterPhone: data.renterPhone,
        bankUsed: data.bankUsed ?? "",
        rateType: data.rateType,
        quantity: data.quantity,
        rate: data.rate,
        total: data.total,
        collectionAt: data.collectionAt,
        returnAt: data.returnAt,
        paymentDeadline: data.paymentDeadline ?? null,
        status: data.status,
        createdAt: data.createdAt?.toDate?.().toISOString?.() ?? null,
        completedAt: data.completedAt?.toDate?.().toISOString?.() ?? null,
      } as CarBooking;
    });

    // Sweep: any awaiting-payment booking past its deadline gets cancelled.
    // This runs whenever anyone loads the dashboard — there's no background
    // job, so cancellation happens the next time the page is opened rather
    // than the instant the clock runs out.
    const now = Date.now();
    const expired = bookings.filter(
      (b) => b.status === "awaiting_payment" && b.paymentDeadline && new Date(b.paymentDeadline).getTime() < now
    );
    for (const b of expired) {
      await cancelBooking(b.id);
      b.status = "cancelled";
    }

    return bookings;
  } catch {
    return [];
  }
}
