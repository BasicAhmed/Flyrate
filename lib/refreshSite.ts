import { auth } from "./firebase";

let timer: ReturnType<typeof setTimeout> | undefined;

/** Asks the server to rebuild the cached homepage now. Fire-and-forget and
 *  debounced — several quick saves trigger one rebuild. Open pages already
 *  update live through the realtime listener; this covers first paint for
 *  new visitors. Failures are ignored (the 60s cache still expires). */
export function refreshSite() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      await fetch("/api/revalidate", { method: "POST", headers: { Authorization: `Bearer ${token}` }, keepalive: true });
    } catch {
      // best effort
    }
  }, 600);
}
