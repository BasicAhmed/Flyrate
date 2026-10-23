"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, FileDown, History, Trash2 } from "lucide-react";
import type { SaleEntry } from "@/lib/sales";
import { getCapital, type CapitalSettings } from "@/lib/capital";
import { CURRENCIES, type CurrencyCode } from "@/lib/corridors";
import { cacheGet } from "@/lib/localCache";
import { buildReport, openReport, periodFor, type HistoryItem, type PeriodKey, type ReportData } from "@/lib/report";

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const flagFor = (c: string) => CURRENCIES[c as CurrencyCode]?.flag ?? "$";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "thisMonth", label: "هذا الشهر" },
  { key: "lastMonth", label: "الشهر الماضي" },
  { key: "last30", label: "آخر 30 يوم" },
  { key: "all", label: "الكل" },
  { key: "custom", label: "مخصص" },
];
type Kind = "all" | "sales" | "moves";
const PAGE = 60;

export default function HistoryPanel({
  sales,
  today,
  onDelete,
  deleting,
}: {
  sales: SaleEntry[];
  today: string;
  onDelete: (s: SaleEntry) => void;
  deleting: string | null;
}) {
  const [cap, setCap] = useState<CapitalSettings | null>(
    () => cacheGet<{ cap: CapitalSettings | null }>("capital")?.cap ?? null
  );
  const [periodKey, setPeriodKey] = useState<PeriodKey>("thisMonth");
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState<Kind>("all");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    getCapital().then(setCap).catch(() => {});
  }, []);
  useEffect(() => setShown(PAGE), [periodKey, from, to, kind]);

  const period = periodFor(periodKey, today, { from, to });
  const report = useMemo(() => buildReport(sales, cap, period), [sales, cap, period.from, period.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = report.items.filter((i) => kind === "all" || (kind === "sales" ? i.kind === "sale" : i.kind !== "sale"));
  const visible = list.slice(0, shown);
  const groups: { date: string; items: HistoryItem[] }[] = [];
  for (const it of visible) {
    const g = groups[groups.length - 1];
    if (g && g.date === it.date) g.items.push(it);
    else groups.push({ date: it.date, items: [it] });
  }
  const dayInfo = new Map<string, ReportData["byDay"][number]>(report.byDay.map((d) => [d.date, d] as const));
  const t = report.totals;

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-5 py-3.5">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <History size={15} className="text-primary" /> سجل العمليات
        </p>
        <button
          onClick={() => openReport(report)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-soft transition-transform hover:-translate-y-px"
        >
          <FileDown size={14} /> تصدير PDF
        </button>
      </div>

      <div className="space-y-3 px-5 pt-4">
        {/* Period */}
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodKey(p.key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                periodKey === p.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/70 text-muted hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodKey === "custom" && (
          <div className="grid grid-cols-2 gap-2" dir="ltr">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من" className="field px-3 py-2 font-mono text-xs" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى" className="field px-3 py-2 font-mono text-xs" />
          </div>
        )}

        {/* Totals for the period */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { l: "الربح", v: usd(t.profit), c: "text-emerald-500" },
            { l: "المبيعات", v: usd(t.salesUsd, 0), c: "text-ink" },
            { l: "العمليات", v: String(t.count), c: "text-ink" },
          ].map((k) => (
            <div key={k.l} className="rounded-xl bg-surface2 px-3 py-2.5 shadow-well">
              <p className="text-[10px] text-subtle">{k.l}</p>
              <p className={`mt-0.5 truncate font-mono text-sm font-bold ${k.c}`} dir="ltr">
                {k.v}
              </p>
            </div>
          ))}
        </div>
        {(t.deposits > 0 || t.withdrawals > 0) && (
          <p className="text-[11px] text-subtle">
            إيداع <span className="font-mono text-emerald-500" dir="ltr">+{usd(t.deposits, 0)}</span> · سحب{" "}
            <span className="font-mono text-red-500" dir="ltr">−{usd(t.withdrawals, 0)}</span>
          </p>
        )}

        {/* Type filter */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface2 p-1 shadow-well">
          {(
            [
              ["all", "الكل"],
              ["sales", "مبيعات"],
              ["moves", "إيداع وسحب"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg py-1.5 text-[11px] font-semibold ${kind === k ? "bg-surface text-ink shadow-soft" : "text-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped list */}
      {list.length === 0 ? (
        <p className="px-5 py-10 text-center text-xs text-subtle">ما في عمليات في الفترة دي.</p>
      ) : (
        <div className="mt-3">
          {groups.map((g) => {
            const d = dayInfo.get(g.date);
            return (
              <div key={g.date}>
                <div className="flex items-center justify-between bg-surface2/70 px-5 py-1.5 text-[11px]">
                  <span className="font-mono font-semibold text-muted" dir="ltr">
                    {g.date}
                  </span>
                  {d && d.count > 0 && (
                    <span className="text-subtle">
                      {d.count} عملية ·{" "}
                      <span className="font-mono font-semibold text-emerald-500" dir="ltr">
                        +{usd(d.profit)}
                      </span>
                    </span>
                  )}
                </div>
                <ul className="divide-y divide-border/40">
                  {g.items.map((it) =>
                    it.kind === "sale" ? (
                      <li key={it.sale.id} className="flex items-center gap-3 px-5 py-2.5">
                        <span className="text-lg">{flagFor(it.sale.currency)}</span>
                        <div className="min-w-0 flex-1" dir="ltr">
                          <p className="truncate text-right font-mono text-sm font-bold text-ink">
                            {num(it.sale.amount)} {it.sale.currency}
                            {it.sale.toCurrency && it.sale.paid !== undefined && (
                              <span className="text-[12px] font-semibold text-muted">
                                {" "}
                                → {num(it.sale.paid)} {it.sale.toCurrency}
                              </span>
                            )}
                          </p>
                          <p className="text-right font-mono text-[11px] text-subtle">
                            {it.time ? `${it.time} · ` : ""}≈ {usd(it.sale.usd)} · {it.sale.margin}%
                          </p>
                        </div>
                        <span className="font-mono text-sm font-bold text-emerald-500" dir="ltr">
                          +{usd(it.sale.profit)}
                        </span>
                        <button
                          onClick={() => onDelete(it.sale)}
                          disabled={deleting === it.sale.id}
                          aria-label="حذف العملية"
                          className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ) : (
                      <li key={it.move.id} className="flex items-center gap-3 px-5 py-2.5">
                        <span
                          className={`rounded-lg p-1.5 ${
                            it.kind === "deposit" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
                          }`}
                        >
                          {it.kind === "deposit" ? <ArrowDownToLine size={13} /> : <ArrowUpFromLine size={13} />}
                        </span>
                        <p className="min-w-0 flex-1 truncate text-xs text-ink">
                          {it.move.note || (it.kind === "deposit" ? "إيداع" : "سحب")}
                        </p>
                        <span
                          className={`font-mono text-sm font-bold ${it.kind === "deposit" ? "text-emerald-500" : "text-red-500"}`}
                          dir="ltr"
                        >
                          {it.kind === "deposit" ? "+" : "−"}
                          {usd(it.move.amount)}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            );
          })}
          {list.length > shown && (
            <button
              onClick={() => setShown((n) => n + PAGE)}
              className="w-full border-t border-border/60 py-3 text-xs font-semibold text-primary"
            >
              عرض المزيد ({list.length - shown})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
