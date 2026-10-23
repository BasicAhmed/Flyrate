import { PAIRS, CURRENCIES, isMultiplyCorridor, type CurrencyCode } from "./corridors";
import { computeRate, convertMid, type RateRow } from "./rates";
import { formatSmart } from "./format";
import type { SaleEntry } from "./sales";
import type { RateHistoryPoint } from "./rateHistory";

/** Rule-based advisor for the النصائح screen. Everything here is computed
 *  from the admin's own sales, the live rates and the stored price history —
 *  no guessing, no external AI. Pure functions, so it's easy to reason about. */

export type Tone = "good" | "warn" | "info" | "push";

export interface Idea {
  id: string;
  kind: "opportunity" | "push" | "leak" | "upsell" | "quiet" | "habit";
  tone: Tone;
  title: string;
  body: string;
  /** Customer-facing price for the suggested direction, e.g. "1 ZAR = 632.08 SDG". */
  priceLine?: string;
  /** Ready-to-send WhatsApp text for customers. */
  message?: string;
  flow?: { from: CurrencyCode; to: CurrencyCode };
  score: number;
}

export interface FlowStat {
  from: string;
  to?: string;
  count: number;
  usd: number;
  profit: number;
  margin: number; // profit / usd, %
  avgTicket: number;
  lastDate: string;
}

export interface Insights {
  plan: {
    target: number;
    todayUsd: number;
    todayProfit: number;
    remaining: number;
    progress: number; // 0–100
    avgTicket: number;
    dealsNeeded: number;
    avgMargin: number; // last 30 days, %
    profitIfHit: number; // expected profit at target with the usual margin
    weekdayAvg: number | null; // usual sales on this weekday
  };
  ideas: Idea[];
  topFlows: FlowStat[];
  habits: { bestHour: string | null; bestWeekday: string | null; avgDailyProfit: number; activeDays: number };
}

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const usd = (n: number, d = 0) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const pct = (n: number, d = 1) => `${n.toFixed(d)}%`;

function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function toUsd(amount: number, c: string, rates: RateRow[]) {
  if (c === "USD" || c === "USDT") return amount;
  return convertMid(amount, c as CurrencyCode, "USDT", rates);
}
function rateLine(from: CurrencyCode, to: CurrencyCode, r: number) {
  return isMultiplyCorridor(from, to) ? `1 ${from} = ${formatSmart(r)} ${to}` : `1 ${to} = ${formatSmart(r)} ${from}`;
}
function promoMessage(from: CurrencyCode, to: CurrencyCode, line: string, extra = "") {
  return [
    `🔥 سعر اليوم من FlyRate`,
    `${CURRENCIES[from].flag} ${from} ← → ${CURRENCIES[to].flag} ${to}`,
    `💱 ${line}`,
    extra,
    `⚡ التحويل خلال دقائق — راسلنا الآن`,
    `flyrate.exchange`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildInsights(opts: {
  sales: SaleEntry[];
  rates: RateRow[];
  history: Map<string, RateHistoryPoint[]>; // key a_b
  disabledFlows: string[]; // "A>B"
  target: number;
  today: string; // YYYY-MM-DD
}): Insights {
  const { sales, rates, history, disabledFlows, target, today } = opts;
  const since30 = addDays(today, -29);
  const recent = sales.filter((s) => s.date >= since30 && s.date <= today);
  const todays = sales.filter((s) => s.date === today);

  /* ---------- target plan ---------- */
  const todayUsd = todays.reduce((a, s) => a + s.usd, 0);
  const todayProfit = todays.reduce((a, s) => a + s.profit, 0);
  const vol30 = recent.reduce((a, s) => a + s.usd, 0);
  const prof30 = recent.reduce((a, s) => a + s.profit, 0);
  const avgTicket = recent.length ? vol30 / recent.length : 500;
  const avgMargin = vol30 ? (prof30 / vol30) * 100 : 3.5;
  const remaining = Math.max(0, target - todayUsd);
  const wd = new Date(today + "T12:00:00").getDay();
  const sameWeekday = new Map<string, number>();
  for (const s of sales) {
    if (s.date >= addDays(today, -56) && s.date < today && new Date(s.date + "T12:00:00").getDay() === wd)
      sameWeekday.set(s.date, (sameWeekday.get(s.date) ?? 0) + s.usd);
  }
  const weekdayAvg = sameWeekday.size ? [...sameWeekday.values()].reduce((a, v) => a + v, 0) / sameWeekday.size : null;

  const plan = {
    target,
    todayUsd,
    todayProfit,
    remaining,
    progress: target > 0 ? Math.min(100, (todayUsd / target) * 100) : 0,
    avgTicket,
    dealsNeeded: remaining > 0 ? Math.max(1, Math.ceil(remaining / Math.max(avgTicket, 1))) : 0,
    avgMargin,
    profitIfHit: target * (avgMargin / 100),
    weekdayAvg,
  };

  /* ---------- flows (last 30 days) ---------- */
  const flowMap = new Map<string, FlowStat>();
  for (const s of recent) {
    const key = s.toCurrency ? `${s.currency}>${s.toCurrency}` : s.currency;
    const f = flowMap.get(key) ?? { from: s.currency, to: s.toCurrency, count: 0, usd: 0, profit: 0, margin: 0, avgTicket: 0, lastDate: s.date };
    f.count += 1;
    f.usd += s.usd;
    f.profit += s.profit;
    if (s.date > f.lastDate) f.lastDate = s.date;
    flowMap.set(key, f);
  }
  const flows = [...flowMap.values()].map((f) => ({ ...f, margin: f.usd ? (f.profit / f.usd) * 100 : 0, avgTicket: f.usd / f.count }));
  const topFlows = [...flows].sort((a, b) => b.profit - a.profit).slice(0, 5);
  const flowShare = (from: string, to: string) => {
    const f = flowMap.get(`${from}>${to}`);
    return f && vol30 ? f.usd / vol30 : 0;
  };

  const ideas: Idea[] = [];
  const row = (from: CurrencyCode, to: CurrencyCode) => rates.find((r) => r.from === from && r.to === to);
  const isOn = (from: string, to: string) => !disabledFlows.includes(`${from}>${to}`);

  /* ---------- 1. price opportunities (vs 30-day average) ---------- */
  for (const { a, b } of PAIRS) {
    const h = (history.get(`${a}_${b}`) ?? []).slice(-30).filter((p) => p.marketPrice > 0);
    const live = row(a, b);
    if (h.length < 5 || !live) continue;
    const avg = h.reduce((s, p) => s + p.marketPrice, 0) / h.length;
    const cur = live.marketPrice;
    const dev = (cur - avg) / avg; // price = a per 1 b
    if (Math.abs(dev) < 0.01) continue;
    // Lower a-per-b → a customer sending a gets MORE b than usual → a→b is attractive.
    const [from, to] = (dev < 0 ? [a, b] : [b, a]) as [CurrencyCode, CurrencyCode];
    if (!isOn(from, to)) continue;
    const r = row(from, to);
    if (!r) continue;
    const line = rateLine(from, to, r.rate);
    const share = flowShare(from, to);
    ideas.push({
      id: `opp-${from}-${to}`,
      kind: "opportunity",
      tone: "good",
      title: `فرصة اليوم: ${from} → ${to}`,
      body: `العميل بياخد ${to} أكثر من متوسط آخر ${h.length} يوم بـ ${pct(Math.abs(dev) * 100)} — وقت ممتاز تعلن السعر ده${
        share > 0.05 ? ` (المسار ده ${pct(share * 100, 0)} من مبيعاتك)` : ""
      }.`,
      priceLine: line,
      message: promoMessage(from, to, line, `📈 أفضل من المعتاد بـ ${pct(Math.abs(dev) * 100)}`),
      flow: { from, to },
      score: Math.abs(dev) * 100 * (1 + share * 3) + 2,
    });
  }

  /* ---------- 2. push: behind target → slightly sharper price on the best route ---------- */
  const hour = new Date().getHours();
  const best = flows.filter((f) => f.to && isOn(f.from, f.to!)).sort((x, y) => y.usd - x.usd)[0];
  if (remaining > 0 && best?.to) {
    const from = best.from as CurrencyCode, to = best.to as CurrencyCode;
    const r = row(from, to);
    if (r) {
      const newMargin = Math.max(1.5, Math.round((r.marginPercent - 0.5) * 10) / 10);
      if (newMargin < r.marginPercent) {
        const sharper = computeRate(from, to, r.marketPrice, newMargin, r);
        const line = rateLine(from, to, sharper);
        const deals = Math.ceil(remaining / Math.max(best.avgTicket, 1));
        ideas.push({
          id: `push-${from}-${to}`,
          kind: "push",
          tone: "push",
          title: `عشان تلحق الهدف: سعر خاص ${from} → ${to}`,
          body: `ده أكثر مسار بتبيع فيه (متوسط العملية ${usd(best.avgTicket)}). نزّل الهامش مؤقتاً من ${r.marginPercent}% لـ ${newMargin}% وابعت السعر لعملائك — تحتاج حوالي ${deals} عمليات لتكمل ${usd(remaining)}.`,
          priceLine: line,
          message: promoMessage(from, to, line, "🎁 عرض لفترة محدودة اليوم"),
          flow: { from, to },
          score: hour >= 12 ? 9 : 6,
        });
      }
    }
  }

  /* ---------- 3. leaks: paying above the live amount ---------- */
  const leak = new Map<string, { from: string; to: string; extraUsd: number; n: number; pctSum: number }>();
  for (const s of recent) {
    if (!s.toCurrency || s.paid === undefined || s.suggested === undefined || s.suggested <= 0) continue;
    const over = s.paid - s.suggested;
    if (over <= 0) continue;
    const k = `${s.currency}>${s.toCurrency}`;
    const v = leak.get(k) ?? { from: s.currency, to: s.toCurrency, extraUsd: 0, n: 0, pctSum: 0 };
    v.extraUsd += toUsd(over, s.toCurrency, rates) ?? 0;
    v.n += 1;
    v.pctSum += (over / s.suggested) * 100;
    leak.set(k, v);
  }
  for (const v of leak.values()) {
    if (v.extraUsd < 3) continue;
    ideas.push({
      id: `leak-${v.from}-${v.to}`,
      kind: "leak",
      tone: "warn",
      title: `بتدفع زيادة في ${v.from} → ${v.to}`,
      body: `في ${v.n} عمليات دفعت فوق السعر المباشر بمتوسط ${pct(v.pctSum / v.n, 2)} — كلفتك ${usd(v.extraUsd, 2)} آخر 30 يوم. التزم بالسعر المقترح أو ارفع هامش المسار ده.`,
      flow: { from: v.from as CurrencyCode, to: v.to as CurrencyCode },
      score: 5 + v.extraUsd / 5,
    });
  }

  /* ---------- 4. upsell: customers accept more than the set margin ---------- */
  for (const f of flows) {
    if (!f.to || f.count < 4) continue;
    const r = row(f.from as CurrencyCode, f.to as CurrencyCode);
    if (!r || f.margin < r.marginPercent + 0.5) continue;
    ideas.push({
      id: `up-${f.from}-${f.to}`,
      kind: "upsell",
      tone: "info",
      title: `ممكن ترفع هامش ${f.from} → ${f.to}`,
      body: `هامشك الفعلي في المسار ده ${pct(f.margin, 2)} (${f.count} عمليات) والمحدد ${r.marginPercent}% — العملاء متقبلين، جرّب ترفعه ${pct(
        Math.min(f.margin - r.marginPercent, 1),
        1
      )}.`,
      flow: { from: f.from as CurrencyCode, to: f.to as CurrencyCode },
      score: 3 + f.count / 5,
    });
  }

  /* ---------- 5. quiet routes ---------- */
  const lastByFlow = new Map<string, string>();
  for (const s of sales) if (s.toCurrency) {
    const k = `${s.currency}>${s.toCurrency}`;
    if (!lastByFlow.has(k) || s.date > lastByFlow.get(k)!) lastByFlow.set(k, s.date);
  }
  for (const [k, last] of lastByFlow) {
    const [from, to] = k.split(">");
    if (!isOn(from, to) || last >= addDays(today, -13)) continue;
    const days = Math.round((new Date(today).getTime() - new Date(last).getTime()) / 86_400_000);
    const r = row(from as CurrencyCode, to as CurrencyCode);
    const line = r ? rateLine(from as CurrencyCode, to as CurrencyCode, r.rate) : undefined;
    ideas.push({
      id: `quiet-${k}`,
      kind: "quiet",
      tone: "info",
      title: `${from} → ${to} واقف من ${days} يوم`,
      body: `كنت بتبيع فيه وما في عمليات من ${last}. ابعت السعر لعملاء المسار ده القدام.`,
      priceLine: line,
      message: line ? promoMessage(from as CurrencyCode, to as CurrencyCode, line) : undefined,
      flow: { from: from as CurrencyCode, to: to as CurrencyCode },
      score: 2 + Math.min(days, 30) / 10,
    });
  }

  /* ---------- habits ---------- */
  const byHour = new Array(24).fill(0);
  const byWd = new Map<number, { p: number; days: Set<string> }>();
  for (const s of sales.filter((x) => x.date >= addDays(today, -59))) {
    if (s.createdAt) {
      const h = new Date(s.createdAt).getHours();
      if (!Number.isNaN(h)) byHour[h] += s.profit;
    }
    const w = new Date(s.date + "T12:00:00").getDay();
    const v = byWd.get(w) ?? { p: 0, days: new Set<string>() };
    v.p += s.profit;
    v.days.add(s.date);
    byWd.set(w, v);
  }
  let bestH = -1;
  for (let h = 0; h < 24; h++) {
    const two = byHour[h] + byHour[(h + 1) % 24];
    if (two > 0 && (bestH < 0 || two > byHour[bestH] + byHour[(bestH + 1) % 24])) bestH = h;
  }
  const fmtH = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "ص" : "م"}`;
  const bestWdEntry = [...byWd.entries()].sort((x, y) => y[1].p / y[1].days.size - x[1].p / x[1].days.size)[0];
  const activeDays = new Set(recent.map((s) => s.date)).size;
  const habits = {
    bestHour: bestH >= 0 ? `${fmtH(bestH)} – ${fmtH((bestH + 2) % 24)}` : null,
    bestWeekday: bestWdEntry ? WEEKDAYS[bestWdEntry[0]] : null,
    avgDailyProfit: activeDays ? prof30 / activeDays : 0,
    activeDays,
  };
  if (bestH >= 0 && remaining > 0 && hour < bestH) {
    ideas.push({
      id: "habit-hour",
      kind: "habit",
      tone: "info",
      title: `أقوى وقت عندك ${habits.bestHour}`,
      body: `أغلب أرباحك بتجي في الوقت ده. ابعت أسعار اليوم لعملائك قبله بساعة.`,
      score: 4,
    });
  }

  ideas.sort((x, y) => y.score - x.score);
  return { plan, ideas: ideas.slice(0, 8), topFlows, habits };
}
