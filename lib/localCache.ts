/** Tiny device cache for /admin: last-known data is shown instantly on open
 *  and replaced as soon as the fresh copy arrives from Firestore. Every
 *  access is guarded — private mode or blocked storage just means no cache. */
const PREFIX = "flyrate:admin:";

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — the app works without it
  }
}

/** Wipes everything cached for /admin (used on sign-out). */
export function cacheClear() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // nothing to clear
  }
}
