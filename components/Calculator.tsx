"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpDown, ChevronDown, Share2, Check, PauseCircle, AlertTriangle, Gift } from "lucide-react";
import { FROM_CURRENCIES, validToCurrencies, CURRENCIES, isMultiplyCorridor, type CurrencyCode } from "@/lib/corridors";
import { formatRate } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relativeTime";
import { createShareCardBlob } from "@/lib/shareCard";
import { convertBetween, type RateRow } from "@/lib/rates";
import { flowKey } from "@/lib/flows";
import { DISCOUNT_THRESHOLD_USDT, DISCOUNT_AMOUNT_USDT } from "@/lib/promotions";
import { getRateHistory, type RateHistoryPoint } from "@/lib/rateHistory";
import { buildOrderMessage, whatsappLink } from "@/lib/whatsapp";
import RateHistoryChart from "./RateHistoryChart";
import WhatsAppIcon from "./WhatsAppIcon";

type Mode = "send" | "receive";

/** Other sections (hero chips, rates table) dispatch this to jump the
 *  calculator to a specific corridor. */
export const CALC_SELECT_EVENT = "calc:select";
export function selectCorridor(from: CurrencyCode, to: CurrencyCode) {
  window.dispatchEvent(new CustomEvent(CALC_SELECT_EVENT, { detail: { from, to } }));
  document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Convenience tap-to-fill amounts, roughly scaled to how students actually
// send each currency (a few hundred SAR vs hundreds of thousands SDG).
const QUICK_AMOUNTS: Record<CurrencyCode, number[]> = {
  SDG: [50000, 100000, 300000],
  ZAR: [500, 1000, 5000],
  EGP: [1000, 5000, 10000],
  MYR: [200, 500, 2000],
  SAR: [200, 500, 2000],
  QAR: [200, 500, 2000],
  AED: [200, 500, 2000],
  USDT: [50, 100, 500],
  USD: [100, 500, 1000],
};

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const parseAmount = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;

function CurrencySelect({
  value,
  options,
  onChange,
  disabledFlows,
  pairFrom,
  side,
}: {
  value: CurrencyCode;
  options: { code: CurrencyCode; name: string }[];
  onChange: (c: CurrencyCode) => void;
  disabledFlows: Set<string>;
  pairFrom?: CurrencyCode; // only for the "to" select — marks paused flows
  side: "from" | "to";
}) {
  const c = CURRENCIES[value];
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        aria-label={side === "from" ? "عملة الإرسال" : "عملة الاستلام"}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => {
          const paused = pairFrom ? disabledFlows.has(flowKey(pairFrom, o.code)) : false;
          return (
            <option key={o.code} value={o.code}>
              {o.name} ({o.code}){paused ? " — متوقف مؤقتاً" : ""}
            </option>
          );
        })}
      </select>
      <div
        className="pointer-events-none flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink"
        dir="ltr"
      >
        <span className="text-lg leading-none">{c.flag}</span>
        <span>{c.code}</span>
        <ChevronDown size={14} className="text-subtle" />
      </div>
    </div>
  );
}

export default function Calculator({
  rates,
  disabledFlows = [],
}: {
  rates: RateRow[];
  disabledFlows?: string[];
}) {
  const [mode, setMode] = useState<Mode>("send");
  const [fromCode, setFromCode] = useState<CurrencyCode>(FROM_CURRENCIES[0].code);
  const [toCode, setToCode] = useState<CurrencyCode>(validToCurrencies(FROM_CURRENCIES[0].code)[0]?.code);
  const [amount, setAmount] = useState("100,000");
  const [swapCount, setSwapCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);

  const paused = useMemo(() => new Set(disabledFlows), [disabledFlows]);

  const currentToOptions = useMemo(() => validToCurrencies(fromCode), [fromCode]);
  const toCurrency = currentToOptions.find((c) => c.code === toCode) ?? currentToOptions[0];
  const fromCurrency = CURRENCIES[fromCode];

  const rate = rates.find((r) => r.from === fromCode && r.to === toCurrency?.code);
  const flowPaused = toCurrency ? paused.has(flowKey(fromCode, toCurrency.code)) : false;
  const involvesSudan = fromCode === "SDG" || toCurrency?.code === "SDG";

  // Jump to a corridor when another section asks for it
  useEffect(() => {
    function onSelect(e: Event) {
      const { from, to } = (e as CustomEvent<{ from: CurrencyCode; to: CurrencyCode }>).detail;
      setFromCode(from);
      setToCode(to);
      setMode("send");
      setAmount(fmt(QUICK_AMOUNTS[from][1]));
    }
    window.addEventListener(CALC_SELECT_EVENT, onSelect);
    return () => window.removeEventListener(CALC_SELECT_EVENT, onSelect);
  }, []);

  const [history, setHistory] = useState<RateHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  useEffect(() => {
    if (!toCurrency) return;
    let cancelled = false;
    setHistoryLoading(true);
    getRateHistory(fromCode, toCurrency.code, 30).then((points) => {
      if (!cancelled) {
        setHistory(points);
        setHistoryLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fromCode, toCurrency]);

  const amountNum = parseAmount(amount);
  const usesMultiply = toCurrency ? isMultiplyCorridor(fromCode, toCurrency.code) : false;

  // Fixed convention regardless of direction: price up = red, down = green.
  const trend = useMemo<"up" | "down" | null>(() => {
    if (history.length < 2) return null;
    const prev = history[history.length - 2].marketPrice;
    const latest = history[history.length - 1].marketPrice;
    if (prev === latest) return null;
    return latest > prev ? "up" : "down";
  }, [history]);

  const amountSent =
    mode === "send" ? amountNum : rate ? (usesMultiply ? amountNum / rate.rate : amountNum * rate.rate) : 0;
  const amountReceived =
    mode === "receive" ? amountNum : rate ? (usesMultiply ? amountNum * rate.rate : amountNum / rate.rate) : 0;

  // Volume discount: send amount worth ≥1500 USDT gets a flat 15 USDT bonus
  // on top of what they'd normally receive.
  const usdtEquivalent = amountSent > 0 ? convertBetween(amountSent, fromCode, "USDT", rates) : null;
  const discountApplies = usdtEquivalent !== null && usdtEquivalent >= DISCOUNT_THRESHOLD_USDT;
  const discountBonus =
    discountApplies && toCurrency ? convertBetween(DISCOUNT_AMOUNT_USDT, "USDT", toCurrency.code, rates) ?? 0 : 0;
  const finalAmountReceived = amountReceived + discountBonus;

  const rateLine =
    rate && toCurrency
      ? usesMultiply
        ? `1 ${fromCurrency.code} = ${formatRate(rate.rate)} ${toCurrency.code}`
        : `1 ${toCurrency.code} = ${formatRate(rate.rate)} ${fromCurrency.code}`
      : "";

  const sendDisplay = mode === "send" ? amount : amountSent > 0 ? fmt(amountSent) : "";
  const receiveDisplay = mode === "receive" ? amount : amountReceived > 0 ? fmt(amountReceived) : "";

  function handleFromChange(code: CurrencyCode) {
    setFromCode(code);
    const next = validToCurrencies(code);
    if (!next.some((c) => c.code === toCode)) setToCode(next[0]?.code);
  }

  function swapCurrencies() {
    if (!toCurrency) return;
    setFromCode(toCurrency.code);
    setToCode(fromCode);
    setSwapCount((n) => n + 1);
  }

  function focusBox(target: Mode) {
    if (mode === target) return;
    // Carry the currently shown number over so the user edits what they see
    const carried = target === "send" ? amountSent : amountReceived;
    setAmount(carried > 0 ? fmt(carried) : "");
    setMode(target);
  }

  function orderNow() {
    if (!rate || !toCurrency) return;
    if (flowPaused) {
      const msg = [
        "السلام عليكم 👋",
        `التحويل من ${fromCurrency.code} إلى ${toCurrency.code} متوفر حالياً؟`,
        `المبلغ تقريباً: ${fmt(amountSent)} ${fromCurrency.code}`,
      ].join("\n");
      window.open(whatsappLink(msg), "_blank", "noopener,noreferrer");
      return;
    }
    const message = buildOrderMessage({
      amountReceived: fmt(finalAmountReceived),
      toCurrency: toCurrency.code,
      toFlag: toCurrency.flag,
      amountSent: fmt(amountSent),
      fromCurrency: fromCurrency.code,
      fromFlag: fromCurrency.flag,
      rateLine,
      discountNote: discountApplies
        ? `خصم ${DISCOUNT_AMOUNT_USDT} USDT (تحويل فوق ${DISCOUNT_THRESHOLD_USDT} USDT) — محسوب في المبلغ`
        : undefined,
    });
    window.open(whatsappLink(message), "_blank", "noopener,noreferrer");
  }

  async function shareResult() {
    if (!rate || !toCurrency) return;
    setSharing(true);
    try {
      const trendLabel = trend === "up" ? "▲ زيادة" : trend === "down" ? "▼ انخفاض" : undefined;
      const updatedCaption = rate.updatedAt ? `آخر تحديث للسعر: ${formatRelativeTime(rate.updatedAt)}` : undefined;

      const blob = await createShareCardBlob({
        fromFlag: fromCurrency.flag,
        fromCode: fromCurrency.code,
        toFlag: toCurrency.flag,
        toCode: toCurrency.code,
        amountSent: fmt(amountSent),
        amountReceived: fmt(finalAmountReceived),
        rateLine,
        trendLabel,
        trendColor: trend === "up" ? "bad" : trend === "down" ? "good" : "neutral",
        updatedCaption,
        history,
      });
      if (!blob) throw new Error("canvas unsupported");

      const file = new File([blob], "flyrate-quote.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "FlyRate" });
        } catch {
          // user cancelled the share sheet
        }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "flyrate-quote.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        setShared(true);
        setTimeout(() => setShared(false), 1800);
      }
    } catch {
      const text = [
        `FlyRate — ${fromCurrency.code} ⇄ ${toCurrency.code}`,
        `${fmt(amountSent)} ${fromCurrency.code} = ${fmt(finalAmountReceived)} ${toCurrency.code}`,
      ].join("\n");
      try {
        if (navigator.share) await navigator.share({ text });
        else {
          await navigator.clipboard.writeText(text);
          setShared(true);
          setTimeout(() => setShared(false), 1800);
        }
      } catch {
        // cancelled / unavailable
      }
    }
    setSharing(false);
  }

  const trendTone =
    trend === "up"
      ? { box: "border-red-500/30 bg-red-500/10", text: "text-red-500", dot: "bg-red-500" }
      : trend === "down"
      ? { box: "border-emerald-500/30 bg-emerald-500/10", text: "text-emerald-500", dot: "bg-emerald-500" }
      : { box: "border-primary/30 bg-primary/10", text: "text-primary", dot: "bg-primary" };

  const boxClass = (active: boolean) =>
    `rounded-2xl border bg-surface2 p-4 transition-colors ${
      active ? "border-primary/60 ring-4 ring-primary/10" : "border-border"
    }`;

  return (
    <section id="calculator" className="scroll-mt-16 overflow-x-clip py-14 sm:py-20">
      <div className="container-page">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center [&>*]:min-w-0">
          <div className="text-center lg:text-right">
            <p className="eyebrow">الحاسبة</p>
            <h2 className="section-heading mt-3">احسبها صاح</h2>
            <p className="mx-auto mt-3 max-w-md text-muted lg:mx-0">
              اكتب المبلغ اللي حترسله أو اللي عاوزه يوصل — والباقي علينا. السعر اللي تشوفه هو اللي
              تتعامل بيه.
            </p>
            <ul className="mx-auto mt-6 hidden max-w-sm space-y-2.5 text-sm text-muted lg:mx-0 lg:block">
              <li className="flex items-center gap-2">
                <Check size={16} className="text-emerald-500" /> بدون رسوم مخفية
              </li>
              <li className="flex items-center gap-2">
                <Check size={16} className="text-emerald-500" /> التحويل في أقل من 30 دقيقة
              </li>
              <li className="flex items-center gap-2">
                <Check size={16} className="text-emerald-500" /> خصم {DISCOUNT_AMOUNT_USDT} USDT للتحويلات فوق{" "}
                {DISCOUNT_THRESHOLD_USDT} USDT
              </li>
            </ul>
          </div>

          <div className="relative">
            <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-primary/10 blur-3xl" />
            <div className="card-raised p-4 sm:p-6">
              {/* Send box */}
              <div className={boxClass(mode === "send")}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-subtle">ترسل</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <CurrencySelect
                    side="from"
                    value={fromCode}
                    options={FROM_CURRENCIES}
                    onChange={handleFromChange}
                    disabledFlows={paused}
                  />
                  <input
                    inputMode="decimal"
                    size={1}
                    value={sendDisplay}
                    onFocus={() => focusBox("send")}
                    onBlur={() => amountNum > 0 && setAmount(fmt(amountNum))}
                    onChange={(e) => {
                      setMode("send");
                      setAmount(e.target.value.replace(/[^\d.,]/g, ""));
                    }}
                    placeholder="0"
                    dir="ltr"
                    aria-label="المبلغ المرسل"
                    className="min-w-0 flex-1 bg-transparent text-left font-mono text-2xl font-bold text-ink outline-none placeholder:text-subtle sm:text-3xl"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5" dir="ltr">
                  {QUICK_AMOUNTS[fromCode].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setMode("send");
                        setAmount(fmt(q));
                      }}
                      className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                        mode === "send" && amountNum === q
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted hover:border-primary hover:text-primary"
                      }`}
                    >
                      {q.toLocaleString("en-US")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Swap */}
              <div className="relative z-10 -my-3 flex justify-center">
                <motion.button
                  onClick={swapCurrencies}
                  animate={{ rotate: swapCount * 180 }}
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  aria-label="بدّل العملتين"
                  title="بدّل العملتين"
                  className="flex size-10 items-center justify-center rounded-full border-4 border-surface bg-primary text-bg shadow-lg"
                >
                  <ArrowUpDown size={16} />
                </motion.button>
              </div>

              {/* Receive box */}
              <div className={boxClass(mode === "receive")}>
                <span className="text-xs font-medium text-subtle">المستلم يستلم</span>
                <div className="mt-2 flex items-center gap-3">
                  {toCurrency && (
                    <CurrencySelect
                      side="to"
                      value={toCurrency.code}
                      options={currentToOptions}
                      onChange={setToCode}
                      disabledFlows={paused}
                      pairFrom={fromCode}
                    />
                  )}
                  <input
                    inputMode="decimal"
                    size={1}
                    value={receiveDisplay}
                    onFocus={() => focusBox("receive")}
                    onBlur={() => amountNum > 0 && setAmount(fmt(amountNum))}
                    onChange={(e) => {
                      setMode("receive");
                      setAmount(e.target.value.replace(/[^\d.,]/g, ""));
                    }}
                    placeholder="0"
                    dir="ltr"
                    aria-label="المبلغ المستلم"
                    className="min-w-0 flex-1 bg-transparent text-left font-mono text-2xl font-bold text-primary outline-none placeholder:text-subtle sm:text-3xl"
                  />
                </div>
              </div>

              {/* Rate + freshness */}
              {rate && toCurrency && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${fromCode}-${toCurrency.code}-${trend ?? "flat"}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${trendTone.box}`}
                    >
                      <span className="relative flex size-2">
                        <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${trendTone.dot}`} />
                        <span className={`relative inline-flex size-2 rounded-full ${trendTone.dot}`} />
                      </span>
                      <span className={`font-mono text-sm font-bold ${trendTone.text}`} dir="ltr">
                        {rateLine}
                      </span>
                      {trend && (
                        <span className={`text-[11px] ${trendTone.text}`}>{trend === "up" ? "▲ زيادة" : "▼ انخفاض"}</span>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  {rate.updatedAt && (
                    <span className="text-[11px] text-subtle">تحديث {formatRelativeTime(rate.updatedAt)}</span>
                  )}
                </div>
              )}

              {/* Discount */}
              {discountApplies && toCurrency && !flowPaused && (
                <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-ink">
                  <Gift size={16} className="shrink-0 text-emerald-500" />
                  <p>
                    <span className="font-semibold text-emerald-500">خصم {DISCOUNT_AMOUNT_USDT} USDT</span> مضاف — المستلم
                    يستلم{" "}
                    <span className="font-mono font-semibold" dir="ltr">
                      {fmt(finalAmountReceived)} {toCurrency.code}
                    </span>
                  </p>
                </div>
              )}

              {/* Notes */}
              {flowPaused && toCurrency ? (
                <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-ink" role="status">
                  <PauseCircle size={16} className="mt-px shrink-0 text-amber-500" />
                  <p>
                    التحويل من <b dir="ltr">{fromCurrency.code}</b> إلى <b dir="ltr">{toCurrency.code}</b> متوقف مؤقتاً.
                    السعر للعلم بس — راسلنا ونشوف ليك أقرب وقت متاح.
                  </p>
                </div>
              ) : (
                involvesSudan && (
                  <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-border bg-surface2 p-3 text-xs text-muted">
                    <AlertTriangle size={15} className="mt-px shrink-0 text-amber-500" />
                    <p>سعر الجنيه السوداني بيتقلب — بنأكد ليك السعر النهائي في واتساب قبل التحويل.</p>
                  </div>
                )
              )}

              {/* Actions */}
              <div className="mt-4 flex gap-2">
                <motion.button
                  onClick={orderNow}
                  disabled={!rate || amountNum <= 0}
                  whileTap={{ scale: 0.98 }}
                  className="btn-whatsapp flex-1 py-3.5 text-sm"
                >
                  <WhatsAppIcon size={19} />
                  {flowPaused ? "اسأل عن التوفر" : "اطلب الآن عبر واتساب"}
                </motion.button>
                <button
                  onClick={shareResult}
                  disabled={!rate || sharing}
                  aria-label="مشاركة النتيجة كصورة"
                  title="مشاركة النتيجة كصورة"
                  className="flex size-[50px] shrink-0 items-center justify-center rounded-full border border-border bg-surface2 text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
                >
                  {sharing ? (
                    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}>
                      <Share2 size={18} />
                    </motion.span>
                  ) : shared ? (
                    <Check size={18} className="text-primary" />
                  ) : (
                    <Share2 size={18} />
                  )}
                </button>
              </div>

              {toCurrency && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowHistory((v) => !v)}
                    className="flex w-full items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-subtle transition-colors hover:text-primary"
                  >
                    {showHistory ? "إخفاء سعر آخر 30 يوم" : "عرض سعر آخر 30 يوم"}
                    <motion.span animate={{ rotate: showHistory ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown size={14} />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {showHistory && !historyLoading && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <RateHistoryChart points={history} label={`${fromCurrency.code} ⇄ ${toCurrency.code}`} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
