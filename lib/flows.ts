import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";
import type { CurrencyCode } from "./corridors";

/** A "flow" is one direction of a pair (SDG→ZAR is a different flow from
 *  ZAR→SDG). Ahmed can switch a flow off when he doesn't have liquidity on
 *  that side. Switched-off flows stay visible in the calculator — the
 *  customer just sees a note that it's temporarily unavailable. */
export function flowKey(from: CurrencyCode, to: CurrencyCode): string {
  return `${from}>${to}`;
}

export async function getDisabledFlows(): Promise<string[]> {
  if (!firebaseEnabled || !db) return [];
  try {
    const snap = await getDoc(doc(db, "settings", "flows"));
    if (!snap.exists()) return [];
    const list = snap.data().disabled;
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function setDisabledFlows(disabled: string[]) {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  await setDoc(doc(db, "settings", "flows"), { disabled, updatedAt: serverTimestamp() });
}

/** Realtime version for open pages — a flow switched off in /admin shows
 *  as paused on the site immediately. Returns an unsubscribe function. */
export function subscribeDisabledFlows(onFlows: (disabled: string[]) => void): () => void {
  if (!firebaseEnabled || !db) return () => {};
  return onSnapshot(
    doc(db, "settings", "flows"),
    (snap) => {
      const list = snap.exists() ? snap.data().disabled : [];
      onFlows(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
    },
    () => {}
  );
}
