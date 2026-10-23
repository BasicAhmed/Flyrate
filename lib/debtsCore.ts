/** Pure debt logic shared by the browser (display) and the server (saves).
 *  No Firebase imports here. */
import type { CapitalMove, CapitalSettings } from "./capital";

export type DebtKind = "owedToUs" | "weOwe";
export type DebtEntryType = "draw" | "payment"; // تسجيل سحب / تسجيل سداد

export interface DebtEntry {
  id: string;
  date: string; // YYYY-MM-DD
  type: DebtEntryType;
  amount: number; // USD, positive
  note?: string;
  /** false = recorded on the debt only, capital untouched. Missing = true. */
  capital?: boolean;
}

export interface DebtAccount {
  id: string;
  name: string;
  phone?: string;
  kind: DebtKind;
  entries: DebtEntry[]; // newest first
  createdAt: string;
}

export const KIND_LABEL: Record<DebtKind, string> = { owedToUs: "مديون لنا", weOwe: "مديون له" };
export const ENTRY_LABEL: Record<DebtEntryType, string> = { draw: "سحب", payment: "سداد" };

export function outstanding(a: DebtAccount) {
  return a.entries.reduce((s, e) => s + (e.type === "draw" ? e.amount : -e.amount), 0);
}

/** + adds to capital, − takes from it.
 *  owedToUs: draw = we hand money out (−), payment = they pay us back (+)
 *  weOwe:    draw = we take money in (+),  payment = we pay them back (−) */
export function capitalEffect(kind: DebtKind, type: DebtEntryType, amount: number) {
  const out = (kind === "owedToUs" && type === "draw") || (kind === "weOwe" && type === "payment");
  return out ? -amount : amount;
}

export const newId = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;

export function moveFor(acc: DebtAccount, e: DebtEntry): CapitalMove {
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

export type DebtAction =
  | {
      action: "add";
      accountId: string | null;
      name?: string;
      phone?: string;
      kind?: DebtKind;
      type: DebtEntryType;
      amount: number;
      date: string;
      note?: string;
      affectsCapital?: boolean; // default true
    }
  | { action: "deleteEntry"; accountId: string; entryId: string }
  | { action: "deleteAccount"; accountId: string };

/** Applies one action to the current state and returns the new state. */
export function applyDebtAction(
  accounts: DebtAccount[],
  cap: CapitalSettings | null,
  a: DebtAction
): { accounts: DebtAccount[]; cap: CapitalSettings | null } {
  const list = accounts.map((x) => ({ ...x, entries: [...x.entries] }));

  if (a.action === "add") {
    if (!(a.amount > 0)) throw new Error("المبلغ غير صحيح");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) throw new Error("التاريخ غير صحيح");
    let acc = a.accountId ? list.find((x) => x.id === a.accountId) : undefined;
    if (!acc) {
      if (!a.name?.trim() || (a.kind !== "owedToUs" && a.kind !== "weOwe")) throw new Error("اكتب الاسم");
      acc = {
        id: newId(),
        name: a.name.trim().slice(0, 80),
        ...(a.phone?.trim() ? { phone: a.phone.trim().slice(0, 30) } : {}),
        kind: a.kind,
        entries: [],
        createdAt: new Date().toISOString(),
      };
      list.unshift(acc);
    }
    const entry: DebtEntry = {
      id: newId(),
      date: a.date,
      type: a.type === "payment" ? "payment" : "draw",
      amount: Math.round(a.amount * 100) / 100,
      ...(a.note?.trim() ? { note: a.note.trim().slice(0, 200) } : {}),
      ...(a.affectsCapital === false ? { capital: false } : {}),
    };
    acc.entries = [entry, ...acc.entries].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    const linked = cap && entry.capital !== false;
    return { accounts: list, cap: linked ? { ...cap!, moves: [moveFor(acc, entry), ...cap!.moves] } : cap };
  }

  if (a.action === "deleteEntry") {
    const acc = list.find((x) => x.id === a.accountId);
    if (acc) acc.entries = acc.entries.filter((e) => e.id !== a.entryId);
    return { accounts: list, cap: cap ? { ...cap, moves: cap.moves.filter((m) => m.debtEntryId !== a.entryId) } : null };
  }

  return {
    accounts: list.filter((x) => x.id !== a.accountId),
    cap: cap ? { ...cap, moves: cap.moves.filter((m) => m.debtId !== a.accountId) } : null,
  };
}
