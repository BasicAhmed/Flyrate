import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { runRateUpdate } from "@/lib/rateUpdate";

export const dynamic = "force-dynamic";

/** Daily backup update (Vercel cron) — always runs, whatever the auto-update
 *  setting. Prices come from Binance P2P (ads #3–#7, buy and sell). */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runRateUpdate(getAdminDb());
    revalidatePath("/");
    return NextResponse.json({ ok: true, at: new Date().toISOString(), ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
