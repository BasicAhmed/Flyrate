import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { maybeAutoUpdate } from "@/lib/rateUpdate";

export const dynamic = "force-dynamic";

/** Pinged by open pages (site + admin). Safe to call often and without a
 *  secret: it only refreshes from Binance when the interval chosen in
 *  /admin has passed, otherwise it does nothing. */
export async function POST() {
  try {
    const out = await maybeAutoUpdate(getAdminDb());
    if (out.ran) revalidatePath("/");
    return NextResponse.json({ ran: out.ran, reason: out.reason, updated: out.result?.updated.length });
  } catch (err) {
    return NextResponse.json({ ran: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
