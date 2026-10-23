/** Server-only. Checks a Firebase ID token (from the signed-in admin's
 *  browser) by asking Google's Identity Toolkit who it belongs to.
 *
 *  Used instead of firebase-admin's verifyIdToken, which pulls in jwks-rsa →
 *  jose v6 (ES module) and crashes on Vercel with "require() of ES Module …
 *  not supported". This needs no extra packages: a valid, unexpired token
 *  for this Firebase project returns the user; anything else is rejected. */
export async function verifyAdminToken(token: string): Promise<{ uid: string; email?: string }> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is not set");
  if (!token) throw new Error("unauthorized");
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("unauthorized");
  const data = await res.json().catch(() => null);
  const user = data?.users?.[0];
  if (!user?.localId || user.disabled) throw new Error("unauthorized");
  return { uid: user.localId, email: user.email };
}

/** Pulls "Bearer <token>" out of a request and verifies it. */
export async function requireAdmin(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return verifyAdminToken(token);
}
