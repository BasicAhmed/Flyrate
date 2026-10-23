import { auth } from "./firebase";
import type { DebtAccount, DebtAction, DebtEntryType, DebtKind } from "./debtsCore";

export * from "./debtsCore";

/** Browser side of المستحقات — talks to /api/debts with the admin's
 *  sign-in token. Saves happen on the server (Admin SDK), so they don't
 *  depend on the published Firestore rules. */
async function call(method: "GET" | "POST", body?: DebtAction): Promise<{ accounts: DebtAccount[] }> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("سجّل الدخول مرة تانية");
  const res = await fetch("/api/debts", {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return { accounts: Array.isArray(data.accounts) ? data.accounts : [] };
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
