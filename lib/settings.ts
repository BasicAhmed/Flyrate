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

export interface CarRates {
  day: number;
  week: number;
  month: number;
}

const DEFAULT_CAR_RATES: CarRates = { day: 400, week: 2500, month: 9000 };

/** Reads the Lancer's day/week/month rental rates (ZAR). Falls back to
 *  sensible defaults if unset. */
export async function getCarRates(): Promise<CarRates> {
  if (!firebaseEnabled || !db) return DEFAULT_CAR_RATES;
  try {
    const snap = await getDoc(doc(db, "settings", "carRates"));
    if (!snap.exists()) return DEFAULT_CAR_RATES;
    const data = snap.data();
    return {
      day: typeof data.day === "number" ? data.day : DEFAULT_CAR_RATES.day,
      week: typeof data.week === "number" ? data.week : DEFAULT_CAR_RATES.week,
      month: typeof data.month === "number" ? data.month : DEFAULT_CAR_RATES.month,
    };
  } catch {
    return DEFAULT_CAR_RATES;
  }
}

export async function setCarRates(rates: CarRates) {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await setDoc(doc(db, "settings", "carRates"), { ...rates, updatedAt: serverTimestamp() });
}

export interface BankAccount {
  id: string;
  bankName: string;
  details: string; // free-text: account name, number, branch code, etc.
}

/** Reads the list of bank accounts renters can pay into. Public data —
 *  shown on the self-booking page before any auth. */
export async function getBankAccounts(): Promise<BankAccount[]> {
  if (!firebaseEnabled || !db) return [];
  try {
    const snap = await getDoc(doc(db, "settings", "bankAccounts"));
    if (!snap.exists()) return [];
    const accounts = snap.data().accounts;
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

export async function setBankAccounts(accounts: BankAccount[]) {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await setDoc(doc(db, "settings", "bankAccounts"), { accounts, updatedAt: serverTimestamp() });
}
