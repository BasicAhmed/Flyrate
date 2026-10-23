import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { applyDebtAction, type DebtAccount, type DebtAction } from "@/lib/debtsCore";
import type { CapitalSettings } from "@/lib/capital";

export const dynamic = "force-dynamic";

/** All المستحقات reads/writes go through here with the Admin SDK, so they
 *  work whatever the published Firestore rules are. Only a signed-in admin
 *  (valid Firebase ID token) can use it. Debts + the linked capital moves
 *  are saved in one transaction. */
async function authed(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  try {
    await getAdminAuth().verifyIdToken(token);
    return true;
  } catch {
    return false;
  }
}

const DEBTS = "sales/__debts";
const CAPITAL = "settings/capital";

function readCap(d: FirebaseFirestore.DocumentData | undefined): CapitalSettings | null {
  if (!d || typeof d.starting !== "number" || typeof d.startDate !== "string") return null;
  return { starting: d.starting, startDate: d.startDate, moves: Array.isArray(d.moves) ? d.moves : [] };
}

export async function GET(request: Request) {
  if (!(await authed(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const snap = await getAdminDb().doc(DEBTS).get();
    const accounts = snap.exists ? snap.data()?.accounts ?? [] : [];
    return NextResponse.json({ accounts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await authed(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let action: DebtAction;
  try {
    action = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const db = getAdminDb();
    const out = await db.runTransaction(async (tx) => {
      const [dSnap, cSnap] = await Promise.all([tx.get(db.doc(DEBTS)), tx.get(db.doc(CAPITAL))]);
      const accounts: DebtAccount[] = dSnap.exists ? dSnap.data()?.accounts ?? [] : [];
      const cap = readCap(cSnap.exists ? cSnap.data() : undefined);
      const next = applyDebtAction(accounts, cap, action);
      // Strip undefined (Firestore rejects it)
      const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
      tx.set(db.doc(DEBTS), { accounts: clean(next.accounts), updatedAt: new Date() });
      if (next.cap) tx.set(db.doc(CAPITAL), { ...clean(next.cap), updatedAt: new Date() }, { merge: true });
      return next;
    });
    return NextResponse.json({ accounts: out.accounts, capitalLinked: !!out.cap });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
