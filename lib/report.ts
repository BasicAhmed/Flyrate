import type { SaleEntry } from "./sales";
import type { CapitalMove, CapitalSettings } from "./capital";

/** One row in the combined history: a sale, a deposit or a withdrawal. */
export type HistoryItem =
  | { kind: "sale"; date: string; time: string | null; sale: SaleEntry }
  | { kind: "deposit" | "withdraw"; date: string; time: null; move: CapitalMove };

export interface Period {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  label: string;
}

export interface ReportData {
  period: Period;
  items: HistoryItem[]; // newest first
  totals: {
    salesUsd: number;
    profit: number;
    count: number;
    avgMargin: number;
    deposits: number;
    withdrawals: number;
    activeDays: number;
    bestDay: { date: string; profit: number } | null;
  };
  byCurrency: { currency: string; amount: number; usd: number; profit: number; count: number }[];
  byDay: { date: string; count: number; usd: number; profit: number; deposits: number; withdrawals: number }[];
  capital: { start: number; end: number } | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export type PeriodKey = "thisMonth" | "lastMonth" | "last30" | "all" | "custom";

/** Ready-made periods, in the device's local calendar. */
export function periodFor(key: PeriodKey, today: string, custom?: { from: string; to: string }): Period {
  const [y, m] = today.split("-").map(Number);
  if (key === "thisMonth") {
    return { from: `${y}-${pad(m)}-01`, to: today, label: `${MONTHS_AR[m - 1]} ${y}` };
  }
  if (key === "lastMonth") {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    const last = new Date(py, pm, 0).getDate();
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}`, label: `${MONTHS_AR[pm - 1]} ${py}` };
  }
  if (key === "last30") {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - 29);
    return { from: ymd(d), to: today, label: "آخر 30 يوم" };
  }
  if (key === "custom" && custom?.from && custom?.to) {
    const [f, t] = custom.from <= custom.to ? [custom.from, custom.to] : [custom.to, custom.from];
    return { from: f, to: t, label: `${f} → ${t}` };
  }
  return { from: "0000-01-01", to: "9999-12-31", label: "كل الفترات" };
}

function timeOf(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildReport(
  sales: SaleEntry[],
  cap: CapitalSettings | null,
  period: Period
): ReportData {
  const inRange = (d: string) => d >= period.from && d <= period.to;
  const s = sales.filter((x) => inRange(x.date));
  const moves = (cap?.moves ?? []).filter((x) => inRange(x.date));

  const items: HistoryItem[] = [
    ...s.map((sale): HistoryItem => ({ kind: "sale", date: sale.date, time: timeOf(sale.createdAt), sale })),
    ...moves.map((move): HistoryItem => ({ kind: move.type, date: move.date, time: null, move })),
  ].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.time ?? "") < (a.time ?? "") ? -1 : 1
  );

  const salesUsd = s.reduce((a, x) => a + x.usd, 0);
  const profit = s.reduce((a, x) => a + x.profit, 0);
  const deposits = moves.filter((x) => x.type === "deposit").reduce((a, x) => a + x.amount, 0);
  const withdrawals = moves.filter((x) => x.type === "withdraw").reduce((a, x) => a + x.amount, 0);

  const cur = new Map<string, ReportData["byCurrency"][number]>();
  for (const x of s) {
    const c = cur.get(x.currency) ?? { currency: x.currency, amount: 0, usd: 0, profit: 0, count: 0 };
    c.amount += x.amount; c.usd += x.usd; c.profit += x.profit; c.count += 1;
    cur.set(x.currency, c);
  }

  const days = new Map<string, ReportData["byDay"][number]>();
  const day = (d: string) => {
    let v = days.get(d);
    if (!v) { v = { date: d, count: 0, usd: 0, profit: 0, deposits: 0, withdrawals: 0 }; days.set(d, v); }
    return v;
  };
  for (const x of s) { const v = day(x.date); v.count += 1; v.usd += x.usd; v.profit += x.profit; }
  for (const m of moves) { const v = day(m.date); if (m.type === "deposit") v.deposits += m.amount; else v.withdrawals += m.amount; }
  const byDay = [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  const best = byDay.filter((d) => d.count > 0).sort((a, b) => b.profit - a.profit)[0];

  // Capital at the start/end of the period (same rules as the capital card).
  let capital: ReportData["capital"] = null;
  if (cap) {
    const valueAt = (end: string) => {
      const p = sales.filter((x) => x.date >= cap.startDate && x.date <= end).reduce((a, x) => a + x.profit, 0);
      const mv = cap.moves
        .filter((x) => x.date >= cap.startDate && x.date <= end)
        .reduce((a, x) => a + (x.type === "deposit" ? x.amount : -x.amount), 0);
      return cap.starting + p + mv;
    };
    const dayBefore = (d: string) => {
      const t = new Date(d + "T12:00:00");
      t.setDate(t.getDate() - 1);
      return ymd(t);
    };
    const lastActivity = [...sales.map((x) => x.date), ...cap.moves.map((x) => x.date)].sort().pop() ?? cap.startDate;
    const endDate = period.to > lastActivity ? lastActivity : period.to;
    const startDate = period.from < cap.startDate ? cap.startDate : period.from;
    capital = { start: startDate <= cap.startDate ? cap.starting : valueAt(dayBefore(startDate)), end: valueAt(endDate) };
  }

  return {
    period,
    items,
    totals: {
      salesUsd,
      profit,
      count: s.length,
      avgMargin: salesUsd > 0 ? (profit / salesUsd) * 100 : 0,
      deposits,
      withdrawals,
      activeDays: new Set(s.map((x) => x.date)).size,
      bestDay: best ? { date: best.date, profit: best.profit } : null,
    },
    byCurrency: [...cur.values()].sort((a, b) => b.usd - a.usd),
    byDay,
    capital,
  };
}

/* ---------------- PDF (print) ---------------- */

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const usd = (n: number, d = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Full A4 report as a standalone HTML page. Opened in a new tab and sent
 *  to the print dialog, where "Save as PDF" gives a real, searchable PDF
 *  with proper Arabic text. */
export function reportHtml(r: ReportData, logoUrl: string): string {
  const t = r.totals;
  const kpi = (label: string, value: string, sub = "", tone = "") =>
    `<div class="kpi ${tone}"><p class="l">${label}</p><p class="v" dir="ltr">${value}</p>${sub ? `<p class="s">${sub}</p>` : ""}</div>`;

  const rows = r.items
    .map((it) => {
      if (it.kind === "sale") {
        const x = it.sale;
        return `<tr><td dir="ltr">${x.date}</td><td dir="ltr">${it.time ?? "—"}</td><td><span class="tag sale">بيع</span></td>
          <td dir="ltr">${num(x.amount)} ${esc(x.currency)}${x.toCurrency && x.paid !== undefined ? ` → ${num(x.paid)} ${esc(x.toCurrency)}` : ""}</td><td dir="ltr">${usd(x.usd)}</td><td dir="ltr">${num(Number(x.margin))}%</td>
          <td dir="ltr" class="pos">+${usd(x.profit)}</td></tr>`;
      }
      const m = it.move, dep = it.kind === "deposit";
      return `<tr><td dir="ltr">${m.date}</td><td>—</td><td><span class="tag ${dep ? "dep" : "wd"}">${dep ? "إيداع" : "سحب"}</span></td>
        <td colspan="3">${esc(m.note || "")}</td><td dir="ltr" class="${dep ? "pos" : "neg"}">${dep ? "+" : "−"}${usd(m.amount)}</td></tr>`;
    })
    .join("");

  const curRows = r.byCurrency
    .map((c) => {
      const share = t.salesUsd > 0 ? (c.usd / t.salesUsd) * 100 : 0;
      return `<tr><td dir="ltr"><b>${esc(c.currency)}</b></td><td dir="ltr">${num(c.amount)}</td><td dir="ltr">${usd(c.usd, 0)}</td>
        <td dir="ltr">${share.toFixed(1)}%</td><td>${c.count}</td><td dir="ltr" class="pos">${usd(c.profit)}</td></tr>`;
    })
    .join("");

  const dayRows = r.byDay
    .map(
      (d) => `<tr><td dir="ltr">${d.date}</td><td>${d.count}</td><td dir="ltr">${usd(d.usd, 0)}</td>
      <td dir="ltr" class="pos">${usd(d.profit)}</td><td dir="ltr">${d.deposits ? usd(d.deposits, 0) : "—"}</td>
      <td dir="ltr">${d.withdrawals ? usd(d.withdrawals, 0) : "—"}</td></tr>`
    )
    .join("");

  const generated = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const range = r.period.from === "0000-01-01" ? "" : `<span dir="ltr">${r.period.from} → ${r.period.to}</span>`;

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FlyRate — تقرير ${esc(r.period.label)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "IBM Plex Sans Arabic", system-ui, sans-serif; color: #1C1917; background: #fff; font-size: 12px; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
  [dir=ltr], td[dir=ltr] { font-family: "IBM Plex Mono", ui-monospace, monospace; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px;
    background: linear-gradient(120deg, #FF7A3D, #FE5200 55%, #C43F00); color: #fff; border-radius: 16px; padding: 18px 22px; }
  header .brand { display: flex; align-items: center; gap: 12px; }
  header img { width: 44px; height: 44px; background: #fff; border-radius: 50%; padding: 6px; }
  header h1 { margin: 0; font-size: 22px; } header p { margin: 2px 0 0; opacity: .9; }
  header .meta { text-align: left; font-size: 11px; opacity: .95; }
  h2 { font-size: 14px; margin: 22px 0 8px; padding-right: 10px; border-right: 4px solid #FE5200; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
  .kpi { border: 1px solid #EFE3D7; background: #FFF8F1; border-radius: 12px; padding: 10px 12px; }
  .kpi.hi { background: #FE5200; border-color: #FE5200; color: #fff; }
  .kpi .l { margin: 0; font-size: 11px; color: #8A7F76; } .kpi.hi .l { color: rgba(255,255,255,.85); }
  .kpi .v { margin: 4px 0 0; font-size: 17px; font-weight: 600; font-family: "IBM Plex Mono", monospace; }
  .kpi .s { margin: 2px 0 0; font-size: 10px; color: #8A7F76; } .kpi.hi .s { color: rgba(255,255,255,.85); }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1C1917; color: #fff; font-weight: 600; font-size: 11px; padding: 7px 8px; text-align: right; }
  th:first-child { border-radius: 0 8px 0 0; } th:last-child { border-radius: 8px 0 0 0; }
  td { padding: 6px 8px; border-bottom: 1px solid #F1E7DE; text-align: right; }
  tr:nth-child(even) td { background: #FFFBF7; }
  tr { break-inside: avoid; }
  tfoot td { font-weight: 700; background: #FFF1E6 !important; border-top: 2px solid #FE5200; }
  .pos { color: #059669; font-weight: 600; } .neg { color: #DC2626; font-weight: 600; }
  .tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .tag.sale { background: #FFE8DA; color: #C43F00; } .tag.dep { background: #D1FAE5; color: #047857; } .tag.wd { background: #FEE2E2; color: #B91C1C; }
  .two { display: block; }
  td[dir=ltr] { white-space: nowrap; }
  tfoot { display: table-row-group; }
  .empty { padding: 30px; text-align: center; color: #8A7F76; border: 1px dashed #E3D3C4; border-radius: 12px; }
  footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #EFE3D7; color: #8A7F76; font-size: 10px; display: flex; justify-content: space-between; }
  .bar { position: sticky; top: 0; background: #fff; padding: 10px 16px; display: flex; gap: 8px; justify-content: center; border-bottom: 1px solid #eee; z-index: 2; }
  .bar button { font: inherit; font-weight: 600; border: 0; border-radius: 10px; padding: 10px 18px; background: #FE5200; color: #fff; cursor: pointer; }
  .bar button.ghost { background: #F4F1EC; color: #1C1917; }
  @media (max-width: 640px) { .kpis { grid-template-columns: repeat(2, 1fr); } td, th { padding: 5px 4px; font-size: 10px; } }
  @media print { .bar { display: none; } .wrap { padding: 0; max-width: none; } h2 { break-after: avoid; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">حفظ PDF / طباعة</button><button class="ghost" onclick="window.close()">إغلاق</button></div>
<div class="wrap">
<header>
  <div class="brand"><img src="${esc(logoUrl)}" alt=""><div><h1>FlyRate</h1><p>تقرير العمليات — ${esc(r.period.label)}</p></div></div>
  <div class="meta"><div>${range}</div><div dir="ltr">Generated ${esc(generated)}</div></div>
</header>

<div class="kpis">
  ${kpi("صافي الربح", usd(t.profit), `متوسط الهامش ${t.avgMargin.toFixed(2)}%`, "hi")}
  ${kpi("إجمالي المبيعات", usd(t.salesUsd, 0), `${t.count} عملية`)}
  ${kpi("أيام نشطة", String(t.activeDays), t.activeDays ? `متوسط ${usd(t.profit / t.activeDays)} / يوم` : "")}
  ${kpi("أفضل يوم", t.bestDay ? usd(t.bestDay.profit) : "—", t.bestDay ? `<span dir="ltr">${t.bestDay.date}</span>` : "")}
  ${kpi("الإيداعات", usd(t.deposits, 0))}
  ${kpi("السحوبات", usd(t.withdrawals, 0))}
  ${r.capital ? kpi("رأس المال — البداية", usd(r.capital.start, 0)) : ""}
  ${r.capital ? kpi("رأس المال — النهاية", usd(r.capital.end, 0), (r.capital.start ? `${(((r.capital.end - r.capital.start) / r.capital.start) * 100).toFixed(2)}%` : "")) : ""}
</div>

${r.items.length === 0 ? `<h2>العمليات</h2><div class="empty">ما في عمليات في الفترة دي.</div>` : `
<div class="two">
  <div><h2>حسب العملة</h2>
    <table><thead><tr><th>العملة</th><th>المبلغ</th><th>بالدولار</th><th>النسبة</th><th>عدد</th><th>الربح</th></tr></thead>
    <tbody>${curRows || `<tr><td colspan="6">—</td></tr>`}</tbody></table></div>
  <div><h2>حسب اليوم</h2>
    <table><thead><tr><th>التاريخ</th><th>عدد</th><th>مبيعات</th><th>ربح</th><th>إيداع</th><th>سحب</th></tr></thead>
    <tbody>${dayRows}</tbody></table></div>
</div>

<h2>كل العمليات (${r.items.length})</h2>
<table><thead><tr><th>التاريخ</th><th>الوقت</th><th>النوع</th><th>المبلغ</th><th>بالدولار</th><th>الهامش</th><th>الربح / المبلغ</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="4">الإجمالي</td><td dir="ltr">${usd(t.salesUsd)}</td><td dir="ltr">${t.avgMargin.toFixed(2)}%</td><td dir="ltr">${usd(t.profit)}</td></tr></tfoot>
</table>`}

<footer><span>FlyRate — flyrate.exchange</span><span>الأرقام بالدولار حسب سعر السوق وقت تسجيل كل عملية</span></footer>
</div>
<script>
  // Wait for fonts + logo, then open the print dialog once.
  window.addEventListener("load", function () {
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
      setTimeout(function () { window.print(); }, 350);
    });
  });
</script>
</body></html>`;
}

/** Opens the report in a new tab (must be called from a click so it isn't
 *  blocked). Falls back to downloading the HTML if pop-ups are blocked. */
export function openReport(r: ReportData) {
  const html = reportHtml(r, `${window.location.origin}/logo-icon.png`);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `flyrate-report-${r.period.from}-${r.period.to}.html`;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ================= Capital statement (كشف رأس المال) ================= */

export interface StatementLine {
  date: string;
  kind: "deposit" | "withdraw" | "profit";
  label: string;
  amount: number; // signed: + adds to capital, − takes from it
  balance: number; // capital right after this line
  moveId?: string;
}

export interface CapitalStatement {
  period: Period;
  opening: number;
  closing: number;
  deposits: number;
  withdrawals: number;
  profit: number;
  lines: StatementLine[]; // oldest first
}

/** Bank-statement style view of capital: opening balance, then every
 *  deposit, withdrawal and day of profit in order, with the balance after
 *  each, then the closing balance. */
export function buildCapitalStatement(cap: CapitalSettings, sales: SaleEntry[], period: Period): CapitalStatement {
  const from = period.from < cap.startDate ? cap.startDate : period.from;
  const counted = sales.filter((s) => s.date >= cap.startDate);
  const moves = cap.moves.filter((m) => m.date >= cap.startDate);

  // Everything before the period → opening balance
  let opening = cap.starting;
  for (const s of counted) if (s.date < from) opening += s.profit;
  for (const m of moves) if (m.date < from) opening += m.type === "deposit" ? m.amount : -m.amount;

  const inRange = (d: string) => d >= from && d <= period.to;
  const profitByDay = new Map<string, { profit: number; count: number }>();
  for (const s of counted) {
    if (!inRange(s.date)) continue;
    const v = profitByDay.get(s.date) ?? { profit: 0, count: 0 };
    v.profit += s.profit; v.count += 1;
    profitByDay.set(s.date, v);
  }

  type Raw = Omit<StatementLine, "balance">;
  const raw: Raw[] = [
    ...moves
      .filter((m) => inRange(m.date))
      .map((m): Raw => ({
        date: m.date,
        kind: m.type,
        label: m.note || (m.type === "deposit" ? "إيداع" : "سحب"),
        amount: m.type === "deposit" ? m.amount : -m.amount,
        moveId: m.id,
      })),
    ...[...profitByDay.entries()].map(([date, v]): Raw => ({
      date,
      kind: "profit",
      label: `أرباح اليوم (${v.count} عملية)`,
      amount: v.profit,
    })),
  ].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.kind === "profit" ? 1 : -1));

  let bal = opening;
  const lines = raw.map((l) => ({ ...l, balance: (bal += l.amount) }));
  const sum = (k: StatementLine["kind"]) => lines.filter((l) => l.kind === k).reduce((a, l) => a + Math.abs(l.amount), 0);

  return {
    period,
    opening,
    closing: bal,
    deposits: sum("deposit"),
    withdrawals: sum("withdraw"),
    profit: sum("profit"),
    lines,
  };
}

export function statementHtml(st: CapitalStatement, logoUrl: string): string {
  const change = st.closing - st.opening;
  const pct = st.opening ? (change / st.opening) * 100 : 0;
  const tag = (k: StatementLine["kind"]) =>
    k === "deposit" ? `<span class="tag dep">إيداع</span>` : k === "withdraw" ? `<span class="tag wd">سحب</span>` : `<span class="tag sale">ربح</span>`;
  const rows = st.lines
    .map(
      (l) => `<tr><td dir="ltr">${l.date}</td><td>${tag(l.kind)}</td><td>${esc(l.label)}</td>
      <td dir="ltr" class="${l.amount >= 0 ? "pos" : "neg"}">${l.amount >= 0 ? "+" : "−"}${usd(Math.abs(l.amount))}</td>
      <td dir="ltr"><b>${usd(l.balance)}</b></td></tr>`
    )
    .join("");
  const generated = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const range = st.period.from === "0000-01-01" ? "" : `<span dir="ltr">${st.period.from} → ${st.period.to}</span>`;
  // Reuse the sales report's look by swapping its body.
  const base = reportHtml(
    { period: st.period, items: [], totals: { salesUsd: 0, profit: 0, count: 0, avgMargin: 0, deposits: 0, withdrawals: 0, activeDays: 0, bestDay: null }, byCurrency: [], byDay: [], capital: null },
    logoUrl
  );
  const head = base.slice(0, base.indexOf("<div class=\"wrap\">")).replace(/<title>[^<]*<\/title>/, `<title>FlyRate — كشف رأس المال ${esc(st.period.label)}</title>`);
  const tail = base.slice(base.indexOf("<script>"));
  const kpi = (label: string, value: string, sub = "", tone = "") =>
    `<div class="kpi ${tone}"><p class="l">${label}</p><p class="v" dir="ltr">${value}</p>${sub ? `<p class="s" dir="ltr">${sub}</p>` : ""}</div>`;
  return `${head}<div class="wrap">
<header>
  <div class="brand"><img src="${esc(logoUrl)}" alt=""><div><h1>FlyRate</h1><p>كشف رأس المال — ${esc(st.period.label)}</p></div></div>
  <div class="meta"><div>${range}</div><div dir="ltr">Generated ${esc(generated)}</div></div>
</header>
<div class="kpis">
  ${kpi("الرصيد الافتتاحي", usd(st.opening))}
  ${kpi("الرصيد الختامي", usd(st.closing), `${change >= 0 ? "+" : "−"}${usd(Math.abs(change))} (${pct.toFixed(2)}%)`, "hi")}
  ${kpi("الإيداعات", `+${usd(st.deposits)}`)}
  ${kpi("السحوبات", `−${usd(st.withdrawals)}`)}
  ${kpi("الأرباح", `+${usd(st.profit)}`)}
</div>
<h2>الحركات (${st.lines.length})</h2>
${st.lines.length === 0 ? `<div class="empty">ما في حركات في الفترة دي.</div>` : `
<table><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th><th>الرصيد بعدها</th></tr></thead>
<tbody>
<tr><td colspan="4"><b>الرصيد الافتتاحي</b></td><td dir="ltr"><b>${usd(st.opening)}</b></td></tr>
${rows}
</tbody>
<tfoot><tr><td colspan="4">الرصيد الختامي</td><td dir="ltr">${usd(st.closing)}</td></tr></tfoot>
</table>`}
<footer><span>FlyRate — flyrate.exchange</span><span>المبالغ بالدولار</span></footer>
</div>
${tail}`;
}

/** Opens any report HTML in a new tab for Save as PDF. */
export function openHtml(html: string, filename: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
