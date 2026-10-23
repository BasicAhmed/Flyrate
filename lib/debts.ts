import { doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { auth, db, firebaseEnabled } from "./firebase";
import { applyDebtAction, type DebtAccount, type DebtAction, type DebtEntryType, type DebtKind } from "./debtsCore";
import type { CapitalSettings } from "./capital";

export * from "./debtsCore";

/** Browser side of المستحقات. Tries the server route first (Admin SDK —
 *  independent of Firestore rules); if that's unavailable it saves directly
 *  with the signed-in client SDK. If both fail, both reasons are shown. */

type Res = { accounts: DebtAccount[] };

async function viaServer(method: "GET" | "POST", body?: DebtAction): Promise<Res> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("سجّل الدخول مرة تانية");
  const res = await fetch("/api/debts", {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error ? `server: ${data.error}` : `server: HTTP ${res.status}`);
  return { accounts: Array.isArray(data.accounts) ? data.accounts : [] };
}

const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

async function viaClient(body?: DebtAction): Promise<Res> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured");
  const dRef = doc(db, "sales", "__debts");
  const cRef = doc(db, "settings", "capital");
  const [dSnap, cSnap] = await Promise.all([getDoc(dRef), body ? getDoc(cRef) : Promise.resolve(null)]);
  const accounts: DebtAccount[] = dSnap.exists() ? dSnap.data().accounts ?? [] : [];
  if (!body) return { accounts };
  const c = cSnap?.exists() ? cSnap.data() : undefined;
  const cap: CapitalSettings | null =
    c && typeof c.starting === "number" && typeof c.startDate === "string"
      ? { starting: c.starting, startDate: c.startDate, moves: Array.isArray(c.moves) ? c.moves : [] }
      : null;
  const next = applyDebtAction(accounts, cap, body);
  const batch = writeBatch(db);
  batch.set(dRef, { accounts: clean(next.accounts), updatedAt: serverTimestamp() });
  if (next.cap) batch.set(cRef, { ...clean(next.cap), updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
  return { accounts: next.accounts };
}

async function call(method: "GET" | "POST", body?: DebtAction): Promise<Res> {
  try {
    return await viaServer(method, body);
  } catch (serverErr) {
    // Bad input (e.g. missing name) — don't retry, just show it.
    const msg = serverErr instanceof Error ? serverErr.message : String(serverErr);
    if (/اكتب الاسم|المبلغ غير صحيح|التاريخ غير صحيح|سجّل الدخول/.test(msg)) throw new Error(msg.replace(/^server: /, ""));
    try {
      return await viaClient(body);
    } catch (clientErr) {
      const c = clientErr instanceof Error ? clientErr.message : String(clientErr);
      throw new Error(`${msg} | direct: ${c}`);
    }
  }
}

export async function getDebts(): Promise<DebtAccount[]> {
  return (await call("GET")).accounts;
}

export function addDebtEntry(input: {
  accountId: string | null;
  name?: string;
  phone?: string;
  kind?: DebtKind;
  type: DebtEntryType;
  amount: number;
  date: string;
  note?: string;
  affectsCapital?: boolean;
}) {
  return call("POST", { action: "add", ...input });
}

export function deleteDebtEntry(accountId: string, entryId: string) {
  return call("POST", { action: "deleteEntry", accountId, entryId });
}

export function deleteDebtAccount(accountId: string) {
  return call("POST", { action: "deleteAccount", accountId });
}
