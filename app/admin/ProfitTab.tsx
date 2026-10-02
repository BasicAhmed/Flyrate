"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, CalendarDays, Plus, RefreshCw, Target, Trash2, TrendingUp } from "lucide-react";
import { convertMid, type RateRow } from "@/lib/rates";
import { getDailyTarget, setDailyTarget } from "@/lib/settings";
import { addSale, deleteSale, getSales, type SaleEntry } from "@/lib/sales";
import { CURRENCIES, PAIRS, type CurrencyCode } from "@/lib/corridors";
import { cacheGet, cacheSet } from "@/lib/localCache";
import CapitalCard from "./CapitalCard";

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const CURRENCY_ORDER: CurrencyCode[] = ["MYR", "SDG", "ZAR", "USDT", "USD", "EGP", "SAR", "AED", "QAR"];

function flagFor(c: SaleEntry["currency"]) {
  return CURRENCIES[c as CurrencyCode]?.flag ?? "$";
}

/** Value of `amount` in USD at MARKET price (no margin), treating USDT = USD.
 *  Routes through the corridor graph, e.g. MYR → ZAR → USDT. */
function toUsd(amount: number, currency: SaleEntry["currency"], rates: RateRow[]): number | null {
  if (currency === "USD" || currency === "USDT") return amount;
  return convertMid(amount, currency, "USDT", rates);
}

/** Margin to prefill for a currency: the margin of its pair(s) if they all
 *  agree, otherwise the global default. */
function suggestedMargin(currency: CurrencyCode, rates: RateRow[], defaultMargin: number) {
  const margins = new Set(
    PAIRS.filter((p) => p.a === currency || p.b === currency)
      .map((p) => rates.find((r) => r.from === p.a && r.to === p.b)?.marginPercent)
      .filter((m): m is number => typeof m === "number")
  );
  return margins.size === 1 ? [...margins][0] : defaultMargin;
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className="card relative overflow-hidden p-4 sm:p-5">
      {highlight && (
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-accent/15" />
      )}
      <div className="relative">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Icon size={14} className="text-primary" /> {label}
        </p>
        <p className="mt-2 font-mono text-2xl font-extrabold text-ink sm:text-3xl" dir="ltr">
          {value}
        </p>
        <p className="mt-1 text-[11px] text-muted">{sub}</p>
      </div>
    </div>
  );
}

export default function ProfitTab({
  rates,
  defaultMargin,
  authReady,
  onError,
}: {
  rates: RateRow[];
  defaultMargin: number;
  authReady: boolean; // sales are private — only readable once the session is restored
  onError: (msg: string) => void;
}) {
  const [cached] = useState(() => cacheGet<{ sales: SaleEntry[]; target: number }>("profit"));
  const [loaded, setLoaded] = useState(!!cached);
  const [sales, setSales] = useState<SaleEntry[]>(cached?.sales ?? []);
  const [dailyTarget, setDailyTargetState] = useState(cached?.target ?? 2000);
  const [targetInput, setTargetInput] = useState(String(cached?.target ?? 2000));
  const [savingTarget, setSavingTarget] = useState(false);

  // Form
  const [date, setDate] = useState(todayStr());
  const [currency, setCurrency] = useState<CurrencyCode>("MYR");
  const [amount, setAmount] = useState("");
  const [marginInput, setMarginInput] = useState<string | null>(null); // null = use suggested
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady) return;
    Promise.all([getSales(), getDailyTarget()])
      .then(([s, t]) => {
        setSales(s);
        setDailyTargetState(t);
        setTargetInput(String(t));
        setLoaded(true);
      })
      .catch((err) => {
        // Keep whatever is cached; only complain when there's nothing to show.
        if (!cached) onError(err instanceof Error ? err.message : String(err));
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  useEffect(() => {
    if (loaded) cacheSet("profit", { sales, target: dailyTarget });
  }, [loaded, sales, dailyTarget]);

  const autoMargin = suggestedMargin(currency, rates, defaultMargin);
  const margin = marginInput === null || marginInput.trim() === "" ? autoMargin : parseFloat(marginInput) || 0;
  const amountNum = parseFloat(amount.replace(/,/g, "")) || 0;
  const previewUsd = amountNum > 0 ? toUsd(amountNum, currency, rates) : null;
  const previewProfit = previewUsd !== null ? previewUsd * (margin / 100) : null;

  const today = todayStr();
  const month = today.slice(0, 7);

  const stats = useMemo(() => {
    const sum = (list: SaleEntry[]) => ({
      usd: list.reduce((a, s) => a + s.usd, 0),
      profit: list.reduce((a, s) => a + s.profit, 0),
      count: list.length,
    });
    const todays = sales.filter((s) => s.date === today);
    const months = sales.filter((s) => s.date.startsWith(month));

    const byCurrency = new Map<string, { amount: number; usd: number; profit: number; count: number }>();
    for (const s of months) {
      const cur = byCurrency.get(s.currency) ?? { amount: 0, usd: 0, profit: 0, count: 0 };
      byCurrency.set(s.currency, {
        amount: cur.amount + s.amount,
        usd: cur.usd + s.usd,
        profit: cur.profit + s.profit,
        count: cur.count + 1,
      });
    }

    const monthly = new Map<string, { usd: number; profit: number }>();
    for (const s of sales) {
      const m = s.date.slice(0, 7);
      const cur = monthly.get(m) ?? { usd: 0, profit: 0 };
      monthly.set(m, { usd: cur.usd + s.usd, profit: cur.profit + s.profit });
    }

    return {
      today: sum(todays),
      month: sum(months),
      byCurrency: [...byCurrency.entries()].sort((a, b) => b[1].usd - a[1].usd),
      monthly: [...monthly.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 12),
    };
  }, [sales, today, month]);

  const dayEntries = sales
    .filter((s) => s.date === date)
    .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1));
  const targetProgress = dailyTarget > 0 ? Math.min(100, (stats.today.usd / dailyTarget) * 100) : 0;

  async function submit() {
    if (amountNum <= 0 || previewUsd === null) return;
    setSaving(true);
    try {
      const entry = await addSale({ date, currency, amount: amountNum, usd: previewUsd, margin });
      setSales((prev) => [entry, ...prev].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
      setAmount("");
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
    setSaving(false);
  }

  async function remove(entry: SaleEntry) {
    const label = `${num(entry.amount)} ${entry.currency}`;
    if (!window.confirm(`حذف عملية ${label}؟`)) return;
    setDeleting(entry.id);
    try {
      await deleteSale(entry.id);
      setSales((prev) => prev.filter((s) => s.id !== entry.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
    setDeleting(null);
  }

  async function saveTarget() {
    setSavingTarget(true);
    try {
      const val = parseFloat(targetInput);
      await setDailyTarget(val);
      setDailyTargetState(val);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
    setSavingTarget(false);
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <RefreshCw size={20} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <CapitalCard sales={sales} today={today} onError={onError} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi
          icon={TrendingUp}
          label="ربح اليوم"
          value={usd(stats.today.profit)}
          sub={`${stats.today.count} عملية · مبيعات ${usd(stats.today.usd, 0)}`}
          highlight
        />
        <Kpi
          icon={BarChart3}
          label="ربح الشهر"
          value={usd(stats.month.profit)}
          sub={`${stats.month.count} عملية · مبيعات ${usd(stats.month.usd, 0)}`}
        />
      </div>

      {/* Add sale */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-ink">تسجيل عملية بيع</p>
          <label className="flex items-center gap-1.5 rounded-full border border-border bg-surface2 px-3 py-1.5 text-xs text-muted shadow-well">
            <CalendarDays size={13} />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent font-mono text-xs text-ink outline-none"
              dir="ltr"
            />
          </label>
        </div>

        <p className="mt-4 text-[11px] font-medium text-subtle">العملة اللي بعتها</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-9" dir="ltr">
          {CURRENCY_ORDER.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCurrency(c);
                setMarginInput(null);
              }}
              className={`flex flex-col items-center gap-0.5 rounded-xl border py-2 text-xs font-bold transition-all ${
                currency === c
                  ? "border-primary bg-primary/10 text-primary shadow-soft"
                  : "border-border/70 bg-surface text-muted shadow-soft hover:border-primary/50"
              }`}
            >
              <span className="text-lg leading-none">{CURRENCIES[c].flag}</span>
              <span className="font-mono">{c}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-[1fr_7rem] gap-2.5" dir="ltr">
          <label className="text-[11px] font-medium text-subtle">
            <span className="block text-right">المبلغ</span>
            <div className="relative mt-1">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  const clean = e.target.value.replace(/[^0-9.]/g, "");
                  if (!clean) return setAmount("");
                  const [i, ...d] = clean.split(".");
                  const intFmt = Number(i || "0").toLocaleString("en-US");
                  setAmount(d.length ? `${intFmt}.${d.join("").slice(0, 2)}` : intFmt);
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="10,000"
                className="field py-3 pl-3.5 pr-16 font-mono text-lg font-bold"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center font-mono text-sm font-semibold text-subtle">
                {currency}
              </span>
            </div>
          </label>
          <label className="text-[11px] font-medium text-subtle">
            <span className="block text-right">
              الهامش {marginInput === null && <span className="text-accent">· تلقائي</span>}
            </span>
            <div className="relative mt-1">
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={marginInput ?? String(autoMargin)}
                onChange={(e) => setMarginInput(e.target.value)}
                className="field py-3 pl-3 pr-7 font-mono text-lg font-bold"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-subtle">%</span>
            </div>
          </label>
        </div>

        {/* Live preview */}
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-accent/5 p-3.5 shadow-well">
          <div>
            <p className="text-[11px] text-muted">القيمة بالدولار</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-ink" dir="ltr">
              {previewUsd !== null ? `≈ ${usd(previewUsd)}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted">ربحك من العملية</p>
            <p className="mt-0.5 font-mono text-lg font-bold text-emerald-500" dir="ltr">
              {previewProfit !== null ? `+ ${usd(previewProfit)}` : "—"}
            </p>
          </div>
        </div>
        {amountNum > 0 && previewUsd === null && (
          <p className="mt-2 text-xs text-red-500">ما في سعر محفوظ لتحويل {currency} للدولار — اضغط «تحديث الآن» في الأسعار.</p>
        )}

        <button
          onClick={submit}
          disabled={saving || amountNum <= 0 || previewUsd === null}
          className="btn-primary mt-3 w-full py-3.5 text-sm"
        >
          <Plus size={16} /> {saving ? "جارٍ الحفظ…" : "إضافة العملية"}
        </button>

        {/* Entries for the chosen day */}
        <div className="mt-5 border-t border-border/60 pt-4">
          <p className="text-xs font-semibold text-muted">
            عمليات {date === today ? "اليوم" : <span dir="ltr">{date}</span>}{" "}
            <span className="text-subtle">({dayEntries.length})</span>
          </p>
          {dayEntries.length === 0 ? (
            <p className="py-5 text-center text-xs text-subtle">ما في عمليات مسجلة في هذا اليوم.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              <AnimatePresence initial={false}>
                {dayEntries.map((s) => (
                  <motion.li
                    key={s.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 rounded-xl bg-surface2 px-3 py-2.5 shadow-well"
                  >
                    <span className="text-lg">{flagFor(s.currency)}</span>
                    <div className="min-w-0 flex-1" dir="ltr">
                      <p className="truncate text-right font-mono text-sm font-bold text-ink">
                        {num(s.amount)} {s.currency}
                      </p>
                      <p className="text-right font-mono text-[11px] text-subtle">
                        ≈ {usd(s.usd)} · {s.margin}%
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-emerald-500" dir="ltr">
                      +{usd(s.profit)}
                    </span>
                    <button
                      onClick={() => remove(s)}
                      disabled={deleting === s.id}
                      aria-label="حذف العملية"
                      className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>

      {/* Daily target */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Target size={14} className="text-primary" /> هدف المبيعات اليومي
          </p>
          <span className="font-mono text-xs font-bold text-primary">{targetProgress.toFixed(0)}%</span>
        </div>
        <p className="mt-2 font-mono text-xl font-bold text-ink" dir="ltr">
          {usd(stats.today.usd, 0)} <span className="text-sm font-medium text-subtle">/ {usd(dailyTarget, 0)}</span>
        </p>
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface2 shadow-well">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${targetProgress}%` }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full bg-brand-gradient"
          />
        </div>
        <div className="mt-3 flex gap-2" dir="ltr">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-subtle">$</span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              aria-label="الهدف اليومي"
              className="field py-2 pl-7 pr-3 font-mono text-sm"
            />
          </div>
          <button
            onClick={saveTarget}
            disabled={savingTarget}
            className="shrink-0 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-ink shadow-soft transition-all hover:-translate-y-px hover:border-primary/60 disabled:opacity-60"
          >
            {savingTarget ? "…" : "حفظ الهدف"}
          </button>
        </div>
      </div>

      {/* This month by currency */}
      {stats.byCurrency.length > 0 && (
        <div className="card overflow-hidden p-0">
          <p className="border-b border-border/60 px-5 py-3.5 text-sm font-semibold text-ink">هذا الشهر حسب العملة</p>
          <ul className="divide-y divide-border/50">
            {stats.byCurrency.map(([cur, v]) => {
              const share = stats.month.usd > 0 ? (v.usd / stats.month.usd) * 100 : 0;
              return (
                <li key={cur} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{flagFor(cur as SaleEntry["currency"])}</span>
                    <div className="min-w-0 flex-1" dir="ltr">
                      <p className="text-right font-mono text-sm font-bold text-ink">
                        {num(v.amount)} {cur}
                      </p>
                      <p className="text-right font-mono text-[11px] text-subtle">
                        {usd(v.usd, 0)} · {v.count} عملية
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold text-emerald-500" dir="ltr">
                      +{usd(v.profit)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2">
                    <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Monthly totals */}
      {stats.monthly.length > 0 && (
        <div className="card overflow-hidden p-0">
          <p className="border-b border-border/60 px-5 py-3.5 text-sm font-semibold text-ink">الإجمالي الشهري</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] border-collapse text-left font-mono text-sm" dir="ltr">
              <thead>
                <tr className="bg-surface2 text-xs text-subtle">
                  <th className="px-5 py-2.5 font-medium">Month</th>
                  <th className="px-5 py-2.5 font-medium">Sales (USD)</th>
                  <th className="px-5 py-2.5 font-medium">Profit</th>
                </tr>
              </thead>
              <tbody>
                {stats.monthly.map(([m, v]) => (
                  <tr key={m} className="border-t border-border/50">
                    <td className="px-5 py-3 text-ink">{m}</td>
                    <td className="px-5 py-3 text-muted">{usd(v.usd, 0)}</td>
                    <td className="px-5 py-3 font-semibold text-emerald-500">{usd(v.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
