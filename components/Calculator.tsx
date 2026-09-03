"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowLeftRight, ChevronDown, MessageCircle, Share2, Check } from "lucide-react";
import { FROM_CURRENCIES, validToCurrencies, CURRENCIES, isMultiplyCorridor, type CurrencyCode } from "@/lib/corridors";
import { formatRate } from "@/lib/format";
import type { RateRow } from "@/lib/rates";
import { getRateHistory, type RateHistoryPoint } from "@/lib/rateHistory";
import { buildOrderMessage, whatsappLink } from "@/lib/whatsapp";
import RateHistoryChart from "./RateHistoryChart";

type Mode = "send" | "receive";

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
};

export default function Calculator({ rates }: { rates: RateRow[] }) {
  const [mode, setMode] = useState<Mode>("send");
  const [fromCode, setFromCode] = useState<CurrencyCode>(FROM_CURRENCIES[0].code);
  const toOptions = useMemo(() => validToCurrencies(fromCode), [fromCode]);
  const [toCode, setToCode] = useState<CurrencyCode>(toOptions[0]?.code);
  const [amount, setAmount] = useState("1000");
  const [swapCount, setSwapCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [shared, setShared] = useState(false);

  const currentToOptions = useMemo(() => validToCurrencies(fromCode), [fromCode]);
  const toCurrency = currentToOptions.find((c) => c.code === toCode) ?? currentToOptions[0];
  const fromCurrency = CURRENCIES[fromCode];

  const rate = rates.find((r) => r.from === fromCode && r.to === toCurrency?.code);

  const involvesSudan = fromCode === "SDG" || toCurrency?.code === "SDG";

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

  const amountNum = parseFloat(amount) || 0;

  // Each pair has one market price; whichever side is the "b→a" leg of the
  // pair multiplies instead of dividing (see lib/corridors.ts + lib/rates.ts).
  const usesMultiply = toCurrency ? isMultiplyCorridor(fromCode, toCurrency.code) : false;

  // "send" mode: student knows what they're sending (fromCurrency amount).
  // "receive" mode: student knows what they need the recipient to get (toCurrency amount).
  const amountSent =
    mode === "send"
      ? amountNum
      : rate
      ? usesMultiply
        ? amountNum / rate.rate
        : amountNum * rate.rate
      : 0;
  const amountReceived =
    mode === "receive"
      ? amountNum
      : rate
      ? usesMultiply
        ? amountNum * rate.rate
        : amountNum / rate.rate
      : 0;

  const activeCurrency = mode === "send" ? fromCurrency : toCurrency;
  const quickAmounts = activeCurrency ? QUICK_AMOUNTS[activeCurrency.code] : [];

  function handleFromChange(code: CurrencyCode) {
    setFromCode(code);
    const next = validToCurrencies(code);
    setToCode(next[0]?.code);
  }

  function swapCurrencies() {
    if (!toCurrency) return;
    const newFrom = toCurrency.code;
    const newTo = fromCode;
    setFromCode(newFrom);
    setToCode(newTo);
    setSwapCount((n) => n + 1);
  }

  function orderNow() {
    if (!rate || !toCurrency) return;
    const message = buildOrderMessage({
      amountReceived: amountReceived.toLocaleString("en-US", { maximumFractionDigits: 2 }),
      toCurrency: toCurrency.code,
      amountSent: amountSent.toLocaleString("en-US", { maximumFractionDigits: 2 }),
      fromCurrency: fromCurrency.code,
    });
    window.open(whatsappLink(message), "_blank", "noopener,noreferrer");
  }

  async function shareResult() {
    if (!rate || !toCurrency) return;
    const text = [
      `FlyRate — ${fromCurrency.code} ⇄ ${toCurrency.code}`,
      `${amountSent.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${fromCurrency.code} = ${amountReceived.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${toCurrency.code}`,
    ].join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // user cancelled the share sheet — no-op
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      // clipboard unavailable — nothing more we can do
    }
  }

  return (
    <section id="calculator" className="border-t border-border py-16 sm:py-24">
      <div className="container-page">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div>
            <p className="eyebrow">الحاسبة</p>
            <h2 className="section-heading mt-3">احسبها صاح</h2>
            <p className="mt-3 max-w-md text-muted">
              شوف انت عاوز كم و حتحول كم باسهل طريقه و اطلب الان.
            </p>
          </div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-primary/10 blur-3xl"
            />
            <div className="rounded-3xl border border-border bg-surface p-5 sm:p-7">
              <div className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-border bg-surface2 p-1">
                {(
                  [
                    ["send", "عندي مبلغ محدد أرسله"],
                    ["receive", "عاوز يوصل مبلغ محدد"],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    onClick={() => setMode(value)}
                    className="relative rounded-full py-2 text-sm font-semibold transition-colors"
                  >
                    {mode === value && (
                      <motion.span
                        layoutId="mode-pill"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                        className="absolute inset-0 rounded-full bg-primary"
                      />
                    )}
                    <span className={`relative ${mode === value ? "text-bg" : "text-muted"}`}>{text}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-subtle">
                    من عملة
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-lg">
                      {fromCurrency.flag}
                    </span>
                    <select
                      value={fromCode}
                      onChange={(e) => handleFromChange(e.target.value as CurrencyCode)}
                      className="w-full appearance-none rounded-xl border border-border bg-surface2 py-2.5 pl-3.5 pr-10 text-sm font-medium text-ink focus:border-primary"
                    >
                      {FROM_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <motion.button
                  onClick={swapCurrencies}
                  animate={{ rotate: swapCount * 180 }}
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  aria-label="بدّل العملتين"
                  title="بدّل العملتين"
                  className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface2 text-muted transition-colors hover:border-primary hover:text-primary"
                >
                  <ArrowLeftRight size={15} />
                </motion.button>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-subtle">
                    إلى عملة
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-lg">
                      {toCurrency?.flag}
                    </span>
                    <select
                      value={toCurrency?.code}
                      onChange={(e) => setToCode(e.target.value as CurrencyCode)}
                      className="w-full appearance-none rounded-xl border border-border bg-surface2 py-2.5 pl-3.5 pr-10 text-sm font-medium text-ink focus:border-primary"
                    >
                      {currentToOptions.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-subtle">
                  {mode === "send"
                    ? `المبلغ اللي حترسله (${fromCurrency.code})`
                    : `المبلغ اللي عاوزه يوصل (${toCurrency?.code})`}
                </span>
                <input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-xl border border-border bg-surface2 px-3.5 py-2.5 text-left font-mono text-lg text-ink focus:border-primary"
                />
              </label>

              {quickAmounts.length > 0 && (
                <div className="mt-2 flex gap-2" dir="ltr">
                  {quickAmounts.map((q) => (
                    <button
                      key={q}
                      onClick={() => setAmount(String(q))}
                      className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
                        amountNum === q
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted hover:border-primary hover:text-primary"
                      }`}
                    >
                      {q.toLocaleString("en-US")}
                    </button>
                  ))}
                </div>
              )}

              {involvesSudan && (
                <div
                  className="mt-3 flex items-start gap-2.5 rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs text-ink"
                  role="alert"
                >
                  <span aria-hidden="true">⚠️</span>
                  <p>
                    سعر الجنيه السوداني بيتقلب بشكل كبير الفترة دي — تأكد من السعر مع الإدارة قبل ما تأكد الطلب.
                  </p>
                </div>
              )}

              {rate && toCurrency && (
                <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-red-500" />
                  </span>
                  <span className="font-mono text-sm font-bold text-red-500" dir="ltr">
                    {usesMultiply
                      ? `1 ${fromCurrency.code} = ${formatRate(rate.rate)} ${toCurrency.code}`
                      : `1 ${toCurrency.code} = ${formatRate(rate.rate)} ${fromCurrency.code}`}
                  </span>
                </div>
              )}

              <div className="mt-2.5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <p className="text-xs font-medium text-subtle">المستلم يستلم</p>
                  {rate && (
                    <button
                      onClick={shareResult}
                      aria-label="مشاركة النتيجة"
                      title="مشاركة النتيجة"
                      className="text-subtle transition-colors hover:text-primary"
                    >
                      {shared ? <Check size={13} className="text-primary" /> : <Share2 size={13} />}
                    </button>
                  )}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={`${amountReceived}-${toCurrency?.code}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-1 font-mono text-3xl font-bold text-primary sm:text-4xl"
                    dir="ltr"
                  >
                    {rate
                      ? `${amountReceived.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${toCurrency.code}`
                      : "اختر ممر التحويل"}
                  </motion.p>
                </AnimatePresence>
                <p className="mt-1.5 font-mono text-sm text-muted" dir="ltr">
                  مقابل {amountSent.toLocaleString("en-US", { maximumFractionDigits: 2 })} {fromCurrency.code}
                </p>
              </div>

              {toCurrency && (
                <div className="mt-2.5">
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

              <motion.button
                onClick={orderNow}
                disabled={!rate || amountNum <= 0}
                whileTap={{ scale: 0.98 }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-bg transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MessageCircle size={16} /> اطلب الآن عبر واتساب <ArrowLeft size={16} />
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
