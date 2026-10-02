import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

/** Called by /admin right after a price, margin or flow change so the
 *  cached homepage is rebuilt immediately — new visitors get the new price
 *  on first paint instead of waiting out the 60s cache window. Requires the
 *  admin's Firebase ID token so nobody else can force rebuilds. */
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await getAdminAuth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  revalidatePath("/");
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
