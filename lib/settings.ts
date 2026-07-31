import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";

const DEFAULT_MARGIN_PERCENT = 3.5;
const DEFAULT_DAILY_TARGET = 2000;

/** Reads the global profit margin (%). Falls back to 3.5% if unset or Firebase
 *  isn't configured yet, so the site always has a working rate calculation. */
export async function getMarginPercent(): Promise<number> {
  if (!firebaseEnabled || !db) return DEFAULT_MARGIN_PERCENT;
  try {
    const snap = await getDoc(doc(db, "settings", "margin"));
    if (!snap.exists()) return DEFAULT_MARGIN_PERCENT;
    const v = snap.data().percent;
    return typeof v === "number" ? v : DEFAULT_MARGIN_PERCENT;
  } catch {
    return DEFAULT_MARGIN_PERCENT;
  }
}

export async function setMarginPercent(percent: number) {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await setDoc(doc(db, "settings", "margin"), { percent, updatedAt: serverTimestamp() });
}

/** Reads the daily USD sales target. Falls back to $2000 if unset. */
export async function getDailyTarget(): Promise<number> {
  if (!firebaseEnabled || !db) return DEFAULT_DAILY_TARGET;
  try {
    const snap = await getDoc(doc(db, "settings", "dailyTarget"));
    if (!snap.exists()) return DEFAULT_DAILY_TARGET;
    const v = snap.data().amount;
    return typeof v === "number" ? v : DEFAULT_DAILY_TARGET;
  } catch {
    return DEFAULT_DAILY_TARGET;
  }
}

export async function setDailyTarget(amount: number) {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await setDoc(doc(db, "settings", "dailyTarget"), { amount, updatedAt: serverTimestamp() });
}
