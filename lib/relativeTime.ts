/** Casual Arabic relative time, e.g. "منذ 5 دقيقة" — matches the site's
 *  informal tone rather than strict MSA grammar. Falls back to a plain date
 *  once it's more than a week old. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return "الآن";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `منذ ${diffHour} ساعة`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `منذ ${diffDay} يوم`;

  return new Date(iso).toISOString().slice(0, 10);
}
