"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { convertBetween, convertMid, type RateRow } from "@/lib/rates";
import { getDailyTarget, setDailyTarget } from "@/lib/settings";
import { addSale, deleteSale, getSales, type SaleEntry } from "@/lib/sales";
import { CURRENCIES, FROM_CURRENCIES, isForwardDirection, isMultiplyCorridor, validToCurrencies, type CurrencyCode } from "@/lib/corridors";
import { formatSmart } from "@/lib/format";
import { cacheGet, cacheSet } from "@/lib/localCache";
import CapitalCard from "./CapitalCard";
import HistoryPanel from "./HistoryPanel";
import DebtsPanel from "./DebtsPanel";
import InsightsPanel from "./InsightsPanel";

function todayStr() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const parseNum = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;
/** "1234.5" → "1,234.5" while typing (max 2 decimals). */
const fmtTyping = (raw: string) => {
  const clean = raw.replace(/[^0-9.]/g, "");
  if (!clean) return "";
  const [i, ...d] = clean.split(".");
  const intFmt = Number(i || "0").toLocaleString("en-US");
  return d.length ? `${intFmt}.${d.join("").slice(0, 2)}` : intFmt;
};

function flagFor(c: SaleEntry["currency"]) {
  return CURRENCIES[c as CurrencyCode]?.flag ?? "$";
}

/** Value of `amount` in USD at MARKET price (no margin), treating USDT = USD.
 *  Routes through the corridor graph, e.g. MYR → ZAR → USDT. */
function toUsd(amount: number, currency: SaleEntry["currency"], rates: RateRow[]): number | null {
  if (currency === "USD" || currency === "USDT") return amount;
  return convertMid(amount, currency, "USDT", rates);
}

export type View = "add" | "capital" | "debts" | "reports" | "insights";

export default function ProfitTab({
  rates,
  defaultMargin,
  authReady,
  onError,
  view,
  disabledFlows = [],
  onOpenInsights,
}: {
  view: View; // which section the bottom bar has open
  disabledFlows?: string[];
  onOpenInsights?: () => void;
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
  const [editingTarget, setEditingTarget] = useState(false);

  // Form
  const [date, setDate] = useState(todayStr());
  // Flow sale: customer gives `fromC`, gets `toC`. Last flow is remembered.
  const [fromC, setFromC] = useState<CurrencyCode>(() => cacheGet<{ f: CurrencyCode }>("saleFlow")?.f ?? "SDG");
  const [toC, setToC] = useState<CurrencyCode>(() => cacheGet<{ t: CurrencyCode }>("saleFlow")?.t ?? "ZAR");
  const [amount, setAmount] = useState(""); // received, in fromC
  const [paidInput, setPaidInput] = useState<string | null>(null); // null = pay the suggested amount
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

  // ----- flow sale math -----
  const toOptions = validToCurrencies(fromC);
  const flowTo: CurrencyCode = toOptions.some((c) => c.code === toC) ? toC : (toOptions[0]?.code ?? toC);
  const flowRow = rates.find((r) => r.from === fromC && r.to === flowTo);
  const amountNum = parseNum(amount);
  // What the live customer rate says he should receive
  const suggested = amountNum > 0 ? convertBetween(amountNum, fromC, flowTo, rates) : null;
  const paidNum = paidInput === null ? suggested : parseNum(paidInput);
  const paidEdited = paidInput !== null && suggested !== null && Math.abs((paidNum ?? 0) - suggested) > 0.004;
  // Profit is measured against the real Binance price for this direction
  // (the same price the margin is added to), not the mid price — so with the
  // default payout the real margin equals the set margin exactly.
  //   forward a→b: customer rate = buy  × (1 + m)
  //   reverse b→a: customer rate = sell × (1 − m)
  const forward = isForwardDirection(fromC, flowTo);
  const basePrice = flowRow ? (forward ? flowRow.buyPrice ?? flowRow.marketPrice : flowRow.sellPrice ?? flowRow.marketPrice) : null;
  // What the customer would get at the raw Binance price (no margin)
  const atBinance =
    amountNum > 0 && basePrice ? (isMultiplyCorridor(fromC, flowTo) ? amountNum * basePrice : amountNum / basePrice) : null;
  const previewUsd = amountNum > 0 ? toUsd(amountNum, fromC, rates) : null;
  const profitInTo = atBinance !== null && paidNum && paidNum > 0 ? atBinance - paidNum : null;
  const previewProfit =
    profitInTo === null ? null : (Math.sign(profitInTo) || 1) * (toUsd(Math.abs(profitInTo), flowTo, rates) ?? 0);
  const liveMargin = flowRow?.marginPercent ?? defaultMargin;
  const rateLine = (r: number) =>
    isMultiplyCorridor(fromC, flowTo) ? `1 ${fromC} = ${formatSmart(r)} ${flowTo}` : `1 ${flowTo} = ${formatSmart(r)} ${fromC}`;
  const effRate =
    amountNum > 0 && paidNum && paidNum > 0
      ? isMultiplyCorridor(fromC, flowTo)
        ? paidNum / amountNum
        : amountNum / paidNum
      : null;
  // Real margin, the same way the site applies it to the Binance price
  const effMargin =
    effRate !== null && basePrice ? (forward ? (effRate / basePrice - 1) * 100 : (1 - effRate / basePrice) * 100) : null;
  const diffPaid = paidEdited && suggested !== null && paidNum !== null ? paidNum - suggested : 0;
  const diffUsd = paidEdited && suggested !== null ? (toUsd(Math.abs(diffPaid), flowTo, rates) ?? 0) : 0;

  function pickFlow(f: CurrencyCode, t?: CurrencyCode) {
    const opts = validToCurrencies(f);
    const nextTo = t && opts.some((c) => c.code === t) ? t : (opts[0]?.code ?? f);
    setFromC(f);
    setToC(nextTo);
    setPaidInput(null);
    cacheSet("saleFlow", { f, t: nextTo });
  }

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
    if (amountNum <= 0 || previewUsd === null || previewProfit === null || !paidNum) return;
    if (previewProfit < 0 && !window.confirm(`العملية دي فيها خسارة ${usd(-previewProfit)}. تسجلها؟`)) return;
    setSaving(true);
    try {
      const entry = await addSale({
        date,
        currency: fromC,
        amount: amountNum,
        usd: previewUsd,
        margin: Math.round((effMargin ?? 0) * 100) / 100,
        profit: previewProfit,
        toCurrency: flowTo,
        paid: paidNum,
        ...(suggested !== null ? { suggested } : {}),
        ...(effRate ? { rate: rateLine(effRate) } : {}),
      });
      setSales((prev) => [entry, ...prev].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
      setAmount("");
      setPaidInput(null);
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
      setEditingTarget(false);
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
    <div className="mt-4 space-y-4">
      {/* Summary — on the sale and reports screens */}
      {(view === "add" || view === "reports") && (
        <div className="relative overflow-hidden rounded-[26px] bg-brand-gradient p-5 text-white shadow-[0_20px_40px_-20px_rgba(254,82,0,0.8)]">
          <div aria-hidden="true" className="pointer-events-none absolute -left-12 -top-16 size-48 rounded-full bg-white/10" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-20 size-44 rounded-full bg-white/10" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-white/80">ربح اليوم</p>
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold">{stats.today.count} عملية</span>
            </div>
            <p className="mt-1 font-mono text-[42px] font-bold leading-none tracking-tight" dir="ltr" style={{ textAlign: "right" }}>
              {usd(stats.today.profit)}
            </p>
            <p className="mt-2 text-[12px] text-white/75">
              مبيعات اليوم <span className="font-mono" dir="ltr">{usd(stats.today.usd, 0)}</span>
            </p>

            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/20 pt-3.5">
              <div>
                <p className="text-[11px] text-white/70">ربح الشهر</p>
                <p className="mt-0.5 font-mono text-lg font-bold" dir="ltr" style={{ textAlign: "right" }}>
                  {usd(stats.month.profit)}
                </p>
                <p className="text-[10px] text-white/65">{stats.month.count} عملية</p>
              </div>
              <button onClick={() => setEditingTarget((v) => !v)} className="text-right" aria-label="تعديل الهدف اليومي">
                <span className="flex items-center justify-between text-[11px] text-white/70">
                  <span className="flex items-center gap-1">
                    الهدف اليومي {editingTarget ? <X size={11} /> : <Pencil size={11} />}
                  </span>
                  <span className="font-mono font-bold text-white">{targetProgress.toFixed(0)}%</span>
                </span>
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-white/25">
                  <motion.span
                    initial={{ width: 0 }}
                    animate={{ width: `${targetProgress}%` }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="block h-full rounded-full bg-white"
                  />
                </span>
                <span className="mt-1 block font-mono text-[10px] text-white/70" dir="ltr" style={{ textAlign: "right" }}>
                  {usd(stats.today.usd, 0)} / {usd(dailyTarget, 0)}
                </span>
              </button>
            </div>

            <AnimatePresence initial={false}>
              {editingTarget && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex gap-2" dir="ltr">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-white/70">$</span>
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        value={targetInput}
                        onChange={(e) => setTargetInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveTarget()}
                        aria-label="الهدف اليومي"
                        className="w-full rounded-xl bg-white/20 py-2.5 pl-7 pr-3 font-mono text-sm text-white outline-none placeholder:text-white/60"
                      />
                    </div>
                    <button
                      onClick={saveTarget}
                      disabled={savingTarget}
                      className="shrink-0 rounded-xl bg-white px-4 text-xs font-bold text-primary disabled:opacity-60"
                    >
                      {savingTarget ? "…" : "حفظ"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {view === "add" && onOpenInsights && (
        <button
          onClick={onOpenInsights}
          className="card-sm flex w-full items-center gap-3 px-4 py-3 text-right"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-ink">نصائح لتحقيق الهدف</span>
            <span className="block text-[11px] text-subtle">أسعار اليوم المناسبة وإيه تبيع عشان تكمل الهدف</span>
          </span>
          <ChevronLeft size={16} className="shrink-0 text-subtle" />
        </button>
      )}

      {view === "insights" && (
        <InsightsPanel sales={sales} rates={rates} target={dailyTarget} today={today} disabledFlows={disabledFlows} />
      )}

      {view === "add" && (
        <>
          {/* Add sale */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-bold text-ink">عملية جديدة</p>
              <label className="flex items-center gap-1.5 rounded-full bg-surface2 px-3 py-1.5 text-xs text-muted">
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

            {/* Flow: من → إلى */}
            <div className="mt-3 flex items-center gap-2">
              {(
                [
                  ["من", fromC, FROM_CURRENCIES, (c: CurrencyCode) => pickFlow(c, flowTo)],
                  ["إلى", flowTo, toOptions, (c: CurrencyCode) => pickFlow(fromC, c)],
                ] as const
              ).map(([label, value, options, onPick], idx) => (
                <div key={label} className={`relative flex-1 ${idx === 1 ? "order-3" : ""}`}>
                  <div className="flex items-center gap-2 rounded-2xl bg-surface2 px-3 py-2.5">
                    <span className="text-2xl leading-none">{CURRENCIES[value].flag}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] text-subtle">{label}</span>
                      <span className="block font-mono text-[15px] font-bold text-ink">{value}</span>
                    </span>
                    <ChevronDown size={14} className="text-subtle" />
                  </div>
                  <select
                    value={value}
                    onChange={(e) => onPick(e.target.value as CurrencyCode)}
                    aria-label={label}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  >
                    {options.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button
                onClick={() => validToCurrencies(flowTo).some((c) => c.code === fromC) && pickFlow(flowTo, fromC)}
                aria-label="عكس الاتجاه"
                className="order-2 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
              >
                <ArrowLeftRight size={16} />
              </button>
            </div>

            {/* Live customer rate */}
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl px-1 text-[11px]">
              <span className="flex items-center gap-1.5 text-muted">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                {flowRow ? (
                  <span className="font-mono" dir="ltr">
                    {rateLine(flowRow.rate)}
                  </span>
                ) : (
                  "ما في سعر لهذا الاتجاه"
                )}
              </span>
              <span className="rounded-full bg-surface2 px-2 py-0.5 font-semibold text-muted">هامش {liveMargin}%</span>
            </div>

            {/* Received */}
            <label className="mt-3 block rounded-2xl bg-surface2 px-4 py-3">
              <span className="block text-[11px] font-medium text-subtle">استلمت من العميل</span>
              <span className="mt-0.5 flex items-baseline gap-2" dir="ltr">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(fmtTyping(e.target.value));
                    setPaidInput(null); // new amount → back to the suggested payout
                  }}
                  placeholder="0"
                  className="w-full min-w-0 bg-transparent font-mono text-[30px] font-bold text-ink outline-none placeholder:text-subtle/60"
                />
                <span className="shrink-0 font-mono text-sm font-semibold text-subtle">{fromC}</span>
              </span>
            </label>

            {/* Paid — pre-filled from the live rate, editable */}
            <label
              className={`mt-2 block rounded-2xl px-4 py-3 transition-colors ${
                paidEdited ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/40" : "bg-primary/10"
              }`}
            >
              <span className="flex items-center justify-between text-[11px] font-medium">
                <span className={paidEdited ? "text-amber-600" : "text-primary"}>
                  {paidEdited ? "دفعت فعلياً (معدّل)" : "حيستلم — حسب السعر المباشر"}
                </span>
                {paidEdited && suggested !== null && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setPaidInput(null);
                    }}
                    className="flex items-center gap-1 text-subtle"
                  >
                    <RotateCcw size={11} /> <span className="font-mono" dir="ltr">{num(suggested)}</span>
                  </button>
                )}
              </span>
              <span className="mt-0.5 flex items-baseline gap-2" dir="ltr">
                <input
                  type="text"
                  inputMode="decimal"
                  value={paidInput ?? (suggested !== null ? fmtTyping(suggested.toFixed(2)) : "")}
                  onChange={(e) => setPaidInput(fmtTyping(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="0"
                  className="w-full min-w-0 bg-transparent font-mono text-[30px] font-bold text-ink outline-none placeholder:text-subtle/60"
                />
                <span className="shrink-0 font-mono text-sm font-semibold text-subtle">{flowTo}</span>
              </span>
            </label>

            {/* Result */}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div
                className={`rounded-2xl px-3 py-2.5 ${
                  previewProfit === null ? "bg-surface2" : previewProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"
                }`}
              >
                <p className="text-[10px] text-subtle">ربحك</p>
                <p
                  className={`mt-0.5 truncate font-mono text-[15px] font-bold ${
                    previewProfit === null ? "text-ink" : previewProfit >= 0 ? "text-emerald-500" : "text-red-500"
                  }`}
                  dir="ltr"
                  style={{ textAlign: "right" }}
                >
                  {previewProfit === null ? "—" : `${previewProfit >= 0 ? "+" : "−"}${usd(Math.abs(previewProfit))}`}
                </p>
              </div>
              <div className="rounded-2xl bg-surface2 px-3 py-2.5">
                <p className="text-[10px] text-subtle">الهامش الفعلي</p>
                <p className="mt-0.5 truncate font-mono text-[15px] font-bold text-ink" dir="ltr" style={{ textAlign: "right" }}>
                  {effMargin === null ? "—" : `${effMargin.toFixed(2)}%`}
                </p>
              </div>
              <div className="rounded-2xl bg-surface2 px-3 py-2.5">
                <p className="text-[10px] text-subtle">بالدولار</p>
                <p className="mt-0.5 truncate font-mono text-[15px] font-bold text-ink" dir="ltr" style={{ textAlign: "right" }}>
                  {previewUsd !== null ? usd(previewUsd, previewUsd >= 1000 ? 0 : 2) : "—"}
                </p>
              </div>
            </div>

            {/* Smart hints */}
            {effRate !== null && (
              <p className="mt-2 px-1 text-[11px] text-subtle">
                السعر الفعلي{" "}
                <span className="font-mono text-muted" dir="ltr">
                  {rateLine(effRate)}
                </span>
              </p>
            )}
            {paidEdited && diffPaid !== 0 && (
              <p
                className={`mt-1.5 rounded-xl px-3 py-2 text-[11px] ${
                  diffPaid > 0 ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-500"
                }`}
              >
                {diffPaid > 0 ? "دفعت زيادة" : "دفعت أقل"}{" "}
                <span className="font-mono font-semibold" dir="ltr">
                  {num(Math.abs(diffPaid))} {flowTo}
                </span>{" "}
                عن السعر المباشر — {diffPaid > 0 ? "ربحك قل" : "ربحك زاد"}{" "}
                <span className="font-mono font-semibold" dir="ltr">
                  {usd(diffUsd)}
                </span>
              </p>
            )}
            {previewProfit !== null && previewProfit < 0 && (
              <p className="mt-1.5 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-500">
                انتبه: العملية دي بخسارة
              </p>
            )}
            {amountNum > 0 && (suggested === null || previewUsd === null) && (
              <p className="mt-2 text-xs text-red-500">ما في سعر محفوظ للاتجاه ده — اضغط «تحديث» في الأسعار.</p>
            )}

            <button
              onClick={submit}
              disabled={saving || amountNum <= 0 || previewProfit === null}
              className="btn-primary mt-3 h-[52px] w-full text-[15px]"
            >
              <Plus size={18} /> {saving ? "جارٍ الحفظ…" : "إضافة العملية"}
            </button>
          </div>

          {/* Entries for the chosen day */}
          <div>
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="text-[13px] font-semibold text-muted">
                عمليات {date === today ? "اليوم" : <span dir="ltr">{date}</span>}
              </p>
              <p className="text-[12px] text-subtle">{dayEntries.length}</p>
            </div>
            {dayEntries.length === 0 ? (
              <div className="card py-8 text-center text-xs text-subtle">ما في عمليات مسجلة في هذا اليوم.</div>
            ) : (
              <ul className="card group-list overflow-hidden p-0">
                <AnimatePresence initial={false}>
                  {dayEntries.map((s) => (
                    <motion.li
                      key={s.id}
                      layout
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface2 text-xl">
                        {flagFor(s.currency)}
                      </span>
                      <div className="min-w-0 flex-1" dir="ltr">
                        <p className="truncate text-right font-mono text-[15px] font-bold text-ink">
                          {num(s.amount)} {s.currency}
                          {s.toCurrency && s.paid !== undefined && (
                            <span className="text-[12px] font-semibold text-muted">
                              {" "}
                              → {num(s.paid)} {s.toCurrency}
                            </span>
                          )}
                        </p>
                        <p className="text-right font-mono text-[11px] text-subtle">
                          ≈ {usd(s.usd)} · {Number(s.margin).toFixed(2)}%
                        </p>
                      </div>
                      <span className={`font-mono text-[15px] font-bold ${s.profit >= 0 ? "text-emerald-500" : "text-red-500"}`} dir="ltr">
                        {s.profit >= 0 ? "+" : "−"}
                        {usd(Math.abs(s.profit))}
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
        </>
      )}

      {view === "capital" && <CapitalCard sales={sales} today={today} onError={onError} />}

      {view === "debts" && <DebtsPanel today={today} authReady={authReady} onError={onError} />}

      {view === "reports" && (
        <>
          <HistoryPanel sales={sales} today={today} onDelete={remove} deleting={deleting} />
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
          {stats.byCurrency.length === 0 && stats.monthly.length === 0 && (
            <div className="card p-8 text-center text-xs text-subtle">ما في عمليات مسجلة لسه.</div>
          )}
        </>
      )}
    </div>
  );
}
