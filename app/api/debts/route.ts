import { NextResponse } from "next/server";
import { applyDebtAction, type DebtAccount, type DebtAction } from "@/lib/debtsCore";
import type { CapitalSettings } from "@/lib/capital";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** المستحقات via the Admin SDK (works whatever the Firestore rules are).
 *  Signed-in admin only. Every failure comes back as JSON { error } so the
 *  admin sees the real reason; the browser falls back to a direct save. */

const DEBTS = "sales/__debts";
const CAPITAL = "settings/capital";

async function admin() {
  // Imported lazily so a missing/invalid service account becomes a readable
  // error instead of crashing the whole route.
  const mod = await import("@/lib/firebaseAdmin");
  return { db: mod.getAdminDb(), auth: mod.getAdminAuth() };
}

function fail(err: unknown, status = 500) {
  const msg = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: msg, server: true }, { status });
}

async function check(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const { db, auth } = await admin();
  try {
    await auth.verifyIdToken(token);
  } catch {
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  }
  return db;
}

function readCap(d: Record<string, unknown> | undefined): CapitalSettings | null {
  if (!d || typeof d.starting !== "number" || typeof d.startDate !== "string") return null;
  return { starting: d.starting, startDate: d.startDate, moves: Array.isArray(d.moves) ? (d.moves as CapitalSettings["moves"]) : [] };
}

export async function GET(request: Request) {
  try {
    const db = await check(request);
    const snap = await db.doc(DEBTS).get();
    const accounts = snap.exists ? snap.data()?.accounts ?? [] : [];
    return NextResponse.json({ accounts });
  } catch (err) {
    return fail(err, (err as { status?: number })?.status ?? 500);
  }
}

export async function POST(request: Request) {
  try {
    const db = await check(request);
    const action = (await request.json()) as DebtAction;
    const out = await db.runTransaction(async (tx) => {
      const dRef = db.doc(DEBTS), cRef = db.doc(CAPITAL);
      const dSnap = await tx.get(dRef);
      const cSnap = await tx.get(cRef);
      const accounts: DebtAccount[] = dSnap.exists ? dSnap.data()?.accounts ?? [] : [];
      const cap = readCap(cSnap.exists ? cSnap.data() : undefined);
      const next = applyDebtAction(accounts, cap, action);
      const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
      tx.set(dRef, { accounts: clean(next.accounts), updatedAt: new Date() });
      if (next.cap) tx.set(cRef, { ...clean(next.cap), updatedAt: new Date() }, { merge: true });
      return next;
    });
    return NextResponse.json({ accounts: out.accounts });
  } catch (err) {
    return fail(err, (err as { status?: number })?.status ?? 500);
  }
}
