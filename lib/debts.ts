import { doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db, firebaseEnabled } from "./firebase";
import { getCapital, type CapitalMove, type CapitalSettings } from "./capital";

/** المستحقات — money people owe FlyRate, and money FlyRate owes people.
 *
 *  owedToUs (مديون لنا): "سحب" = we hand them money → capital goes DOWN;
 *                        "سداد" = they pay us back → capital goes UP.
 *  weOwe    (مديون له):  "سحب" = we take money from them → capital goes UP;
 *                        "سداد" = we pay them back → capital goes DOWN.
 *
 *  Every entry writes a linked capital move in the same atomic save, so the
 *  capital card, capital statement and reports all include it. */
export type DebtKind = "owedToUs" | "weOwe";
export type DebtEntryType = "draw" | "payment"; // تسجيل سحب / تسجيل سداد

export interface DebtEntry {
  id: string;
  date: string; // YYYY-MM-DD
  type: DebtEntryType;
  amount: number; // USD, positive
  note?: string;
}

export interface DebtAccount {
  id: string;
  name: string;
  phone?: string;
  kind: DebtKind;
  entries: DebtEntry[]; // newest first
  createdAt: string;
}

/** Stored as one doc inside the `sales` collection because that collection
 *  is already private (signed-in only) in firestore.rules — `settings` is
 *  publicly readable. The doc has no `date` field, so sales queries never
 *  pick it up. */
const DEBTS_REF = () => doc(db!, "sales", "__debts");
const CAPITAL_REF = () => doc(db!, "settings", "capital");

export function outstanding(a: DebtAccount) {
  return a.entries.reduce((s, e) => s + (e.type === "draw" ? e.amount : -e.amount), 0);
}

/** + adds to capital, − takes from it. */
export function capitalEffect(kind: DebtKind, type: DebtEntryType, amount: number) {
  const out = (kind === "owedToUs" && type === "draw") || (kind === "weOwe" && type === "payment");
  return out ? -amount : amount;
}

export const KIND_LABEL: Record<DebtKind, string> = { owedToUs: "مديون لنا", weOwe: "مديون له" };
export const ENTRY_LABEL: Record<DebtEntryType, string> = { draw: "سحب", payment: "سداد" };

export async function getDebts(): Promise<DebtAccount[]> {
  if (!firebaseEnabled || !db) return [];
  const snap = await getDoc(DEBTS_REF());
  const list = snap.exists() ? snap.data().accounts : [];
  return Array.isArray(list) ? list : [];
}

const newId = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

/** Saves the debts list and the capital doc together. */
async function commit(accounts: DebtAccount[], cap: CapitalSettings | null) {
  const batch = writeBatch(db!);
  batch.set(DEBTS_REF(), { accounts, updatedAt: serverTimestamp() });
  if (cap) batch.set(CAPITAL_REF(), { ...cap, updatedAt: serverTimestamp() });
  await batch.commit();
}

function moveFor(acc: DebtAccount, e: DebtEntry): CapitalMove {
  const delta = capitalEffect(acc.kind, e.type, e.amount);
  return {
    id: `debt-${e.id}`,
    date: e.date,
    type: delta >= 0 ? "deposit" : "withdraw",
    amount: e.amount,
    note: `مستحقات · ${acc.name} — ${ENTRY_LABEL[e.type]}${e.note ? ` (${e.note})` : ""}`,
    debtId: acc.id,
    debtEntryId: e.id,
  };
}

/** Adds an entry to an account (creating the account if `accountId` is
 *  null) and the matching capital move. Returns the fresh state. */
export async function addDebtEntry(input: {
  accountId: string | null;
  name?: string;
  phone?: string;
  kind?: DebtKind;
  type: DebtEntryType;
  amount: number;
  date: string;
  note?: string;
}): Promise<{ accounts: DebtAccount[]; cap: CapitalSettings | null }> {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const [accounts, cap] = await Promise.all([getDebts(), getCapital()]);

  let acc = input.accountId ? accounts.find((a) => a.id === input.accountId) : undefined;
  if (!acc) {
    if (!input.name?.trim() || !input.kind) throw new Error("اكتب الاسم");
    acc = {
      id: newId(),
      name: input.name.trim(),
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
      kind: input.kind,
      entries: [],
      createdAt: new Date().toISOString(),
    };
    accounts.unshift(acc);
  }
  const entry: DebtEntry = {
    id: newId(),
    date: input.date,
    type: input.type,
    amount: input.amount,
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };
  acc.entries = [entry, ...acc.entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const nextCap = cap ? { ...cap, moves: [moveFor(acc, entry), ...cap.moves] } : null;
  await commit(accounts, nextCap);
  return { accounts, cap: nextCap };
}

/** Deletes one entry and its capital move. */
export async function deleteDebtEntry(accountId: string, entryId: string) {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const [accounts, cap] = await Promise.all([getDebts(), getCapital()]);
  const acc = accounts.find((a) => a.id === accountId);
  if (acc) acc.entries = acc.entries.filter((e) => e.id !== entryId);
  const nextCap = cap ? { ...cap, moves: cap.moves.filter((m) => m.debtEntryId !== entryId) } : null;
  await commit(accounts, nextCap);
  return { accounts, cap: nextCap };
}

/** Deletes a whole account and every capital move it created. */
export async function deleteDebtAccount(accountId: string) {
  if (!firebaseEnabled || !db) throw new Error("Firebase is not configured — see .env.example.");
  const [accounts, cap] = await Promise.all([getDebts(), getCapital()]);
  const next = accounts.filter((a) => a.id !== accountId);
  const nextCap = cap ? { ...cap, moves: cap.moves.filter((m) => m.debtId !== accountId) } : null;
  await commit(next, nextCap);
  return { accounts: next, cap: nextCap };
}
