"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock,
  Gift,
  PauseCircle,
  AlertTriangle,
  Search,
  Share2,
  ShieldCheck,
  X,
} from "lucide-react";
import { FROM_CURRENCIES, validToCurrencies, CURRENCIES, isMultiplyCorridor, type CurrencyCode } from "@/lib/corridors";
import { formatRate } from "@/lib/format";
import { formatRelativeTime } from "@/lib/relativeTime";
import { createShareCardBlob } from "@/lib/shareCard";
import { convertBetween, type RateRow } from "@/lib/rates";
import { flowKey } from "@/lib/flows";
import { DISCOUNT_THRESHOLD_USDT, DISCOUNT_AMOUNT_USDT } from "@/lib/promotions";
import { getRateHistory, type RateHistoryPoint } from "@/lib/rateHistory";
import { buildOrderMessage, whatsappLink } from "@/lib/whatsapp";
import WhatsAppIcon from "./WhatsAppIcon";
import { useLiveRates } from "./LiveRates";

type Mode = "send" | "receive";

/** Other sections (hero chips, rates table) dispatch this to jump the
 *  calculator to a specific corridor. */
export const CALC_SELECT_EVENT = "calc:select";
export function selectCorridor(from: CurrencyCode, to: CurrencyCode) {
  window.dispatchEvent(new CustomEvent(CALC_SELECT_EVENT, { detail: { from, to } }));
  document.getElementById("calculator")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Tap-to-fill amounts, roughly scaled to how students actually send each
// currency (a few hundred SAR vs hundreds of thousands SDG).
const QUICK_AMOUNTS: Record<CurrencyCode, number[]> = {
  SDG: [50000, 100000, 300000, 500000],
  ZAR: [500, 1000, 5000, 10000],
  EGP: [1000, 5000, 10000, 25000],
  MYR: [200, 500, 2000, 5000],
  SAR: [200, 500, 2000, 5000],
  QAR: [200, 500, 2000, 5000],
  AED: [200, 500, 2000, 5000],
  KES: [5000, 10000, 50000, 100000],
  USDT: [50, 100, 500, 1000],
  USD: [100, 500, 1000, 2000],
};

// One-tap popular routes shown above the calculator
const POPULAR: [CurrencyCode, CurrencyCode][] = [
  ["SDG", "MYR"],
  ["SDG", "EGP"],
  ["SAR", "MYR"],
  ["SDG", "ZAR"],
  ["EGP", "ZAR"],
  ["AED", "MYR"],
];

const MEMO_KEY = "flyrate:calc";
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const parseAmount = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;
/** Adds thousands separators while typing, keeping a trailing "." or decimals. */
function formatTyping(raw: string) {
  const clean = raw.replace(/[^\d.]/g, "");
  if (!clean) return "";
  const [i, ...d] = clean.split(".");
  const intFmt = i ? Number(i).toLocaleString("en-US") : "0";
  return clean.includes(".") ? `${intFmt}.${d.join("").slice(0, 2)}` : intFmt;
}
/** Big numbers shrink so they always fit on one line. */
function sizeFor(text: string) {
  const n = text.length;
  return n <= 7 ? "text-[34px] sm:text-[40px]" : n <= 10 ? "text-[28px] sm:text-[34px]" : n <= 13 ? "text-[23px] sm:text-[28px]" : "text-[19px] sm:text-[22px]";
}

/** Smoothly tweens a number toward its new value (for the computed box). */
function useTween(value: number, ms = 450) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current, b = value;
    if (a === b) return;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (b - a) * e;
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/* ------------------------------------------------------------------ */
/* Currency picker — bottom sheet on phones, centred panel on desktop  */
/* ------------------------------------------------------------------ */
function CurrencyPicker({
  open,
  title,
  options,
  value,
  onPick,
  onClose,
  rateFor,
  isPaused,
}: {
  open: boolean;
  title: string;
  options: { code: CurrencyCode; name: string; flag: string }[];
  value: CurrencyCode;
  onPick: (c: CurrencyCode) => void;
  onClose: () => void;
  rateFor?: (c: CurrencyCode) => string | null;
  isPaused?: (c: CurrencyCode) => boolean;
}) {
  const [q, setQ] = useState("");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    setQ("");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const list = options.filter((o) => {
    const s = q.trim().toLowerCase();
    return !s || o.code.toLowerCase().includes(s) || o.name.includes(q.trim());
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex touch-none items-end justify-center overscroll-none sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button aria-label="إغلاق" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="relative max-h-[80vh] w-full overflow-hidden rounded-t-[28px] border border-border/70 bg-surface shadow-lift sm:max-w-md sm:rounded-[28px]"
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border sm:hidden" />
            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <p className="font-display text-lg font-bold text-ink">{title}</p>
              <button onClick={onClose} aria-label="إغلاق" className="flex size-9 items-center justify-center rounded-full bg-surface2 text-muted">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 pb-3">
              <label className="flex items-center gap-2 rounded-2xl bg-surface2 px-3.5 py-2.5">
                <Search size={16} className="text-subtle" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث بالدولة أو العملة"
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-subtle"
                />
              </label>
            </div>
            <ul className="max-h-[56vh] touch-pan-y overflow-y-auto overscroll-contain px-2 pb-[max(env(safe-area-inset-bottom),12px)]">
              {list.map((o) => {
                const sel = o.code === value;
                const paused = isPaused?.(o.code);
                const r = rateFor?.(o.code);
                return (
                  <li key={o.code}>
                    <button
                      onClick={() => {
                        onPick(o.code);
                        onClose();
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-right transition-colors ${
                        sel ? "bg-primary/10" : "hover:bg-surface2"
                      }`}
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface2 text-2xl">{o.flag}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-ink">{o.name}</span>
                        <span className="block font-mono text-[11px] text-subtle" dir="ltr" style={{ textAlign: "right" }}>
                          {r ?? o.code}
                        </span>
                      </span>
                      {paused && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">متوقف</span>}
                      <span className="font-mono text-xs font-bold text-muted">{o.code}</span>
                      {sel && <Check size={16} className="text-primary" />}
                    </button>
                  </li>
                );
              })}
              {list.length === 0 && <li className="py-8 text-center text-xs text-subtle">ما لقينا عملة بالاسم ده</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */

function Sparkline({ points }: { points: RateHistoryPoint[] }) {
  if (points.length < 2) return null;
  const w = 120, h = 34, v = points.map((p) => p.marketPrice);
  const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const xy = v.map((y, i) => [(i / (v.length - 1)) * w, 3 + (1 - (y - min) / r) * (h - 6)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[30px] w-[84px]" aria-hidden>
      <defs>
        <linearGradient id="calc-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FE5200" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FE5200" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="url(#calc-spark)" />
      <path d={d} fill="none" stroke="#FE5200" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="#FE5200" />
    </svg>
  );
}

export default function Calculator(props: { rates: RateRow[]; disabledFlows?: string[] }) {
  const { rates, disabledFlows } = useLiveRates(props.rates, props.disabledFlows);
  const [mode, setMode] = useState<Mode>("send");
  const [fromCode, setFromCode] = useState<CurrencyCode>(FROM_CURRENCIES[0].code);
  const [toCode, setToCode] = useState<CurrencyCode>(validToCurrencies(FROM_CURRENCIES[0].code)[0]?.code);
  const [amount, setAmount] = useState("100,000");
  const [swapCount, setSwapCount] = useState(0);
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);

  const paused = useMemo(() => new Set(disabledFlows), [disabledFlows]);
  const currentToOptions = useMemo(() => validToCurrencies(fromCode), [fromCode]);
  const toCurrency = currentToOptions.find((c) => c.code === toCode) ?? currentToOptions[0];
  const fromCurrency = CURRENCIES[fromCode];

  const rate = rates.find((r) => r.from === fromCode && r.to === toCurrency?.code);
  const flowPaused = toCurrency ? paused.has(flowKey(fromCode, toCurrency.code)) : false;
  const involvesSudan = fromCode === "SDG" || toCurrency?.code === "SDG";

  // Restore the last route + amount for returning visitors
  useEffect(() => {
    try {
      const m = JSON.parse(localStorage.getItem(MEMO_KEY) ?? "null");
      if (m?.from && CURRENCIES[m.from as CurrencyCode]) {
        setFromCode(m.from);
        if (m.to) setToCode(m.to);
        if (typeof m.amount === "string" && m.amount) setAmount(m.amount);
      }
    } catch {}
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (mode === "send") localStorage.setItem(MEMO_KEY, JSON.stringify({ from: fromCode, to: toCurrency?.code, amount }));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [fromCode, toCurrency, amount, mode]);

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
  useEffect(() => {
    if (!toCurrency) return;
    let cancelled = false;
    getRateHistory(fromCode, toCurrency.code, 30).then((points) => {
      if (!cancelled) setHistory(points);
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
  const change30 =
    history.length >= 2 ? ((history[history.length - 1].marketPrice - history[0].marketPrice) / history[0].marketPrice) * 100 : null;

  const amountSent =
    mode === "send" ? amountNum : rate ? (usesMultiply ? amountNum / rate.rate : amountNum * rate.rate) : 0;
  const amountReceived =
    mode === "receive" ? amountNum : rate ? (usesMultiply ? amountNum * rate.rate : amountNum / rate.rate) : 0;

  // Volume discount: send amount worth ≥ threshold USDT gets a flat bonus
  const usdtEquivalent = amountSent > 0 ? convertBetween(amountSent, fromCode, "USDT", rates) : null;
  const discountApplies = usdtEquivalent !== null && usdtEquivalent >= DISCOUNT_THRESHOLD_USDT;
  const discountBonus =
    discountApplies && toCurrency ? convertBetween(DISCOUNT_AMOUNT_USDT, "USDT", toCurrency.code, rates) ?? 0 : 0;
  const finalAmountReceived = amountReceived + discountBonus;
  // Nudge when close to the discount (60%+ of the way)
  const toDiscountUsdt = usdtEquivalent !== null ? DISCOUNT_THRESHOLD_USDT - usdtEquivalent : null;
  const nearDiscount = toDiscountUsdt !== null && !discountApplies && usdtEquivalent! >= DISCOUNT_THRESHOLD_USDT * 0.6;
  const toDiscountLocal = nearDiscount ? convertBetween(toDiscountUsdt!, "USDT", fromCode, rates) : null;

  const rateLine =
    rate && toCurrency
      ? usesMultiply
        ? `1 ${fromCurrency.code} = ${formatRate(rate.rate)} ${toCurrency.code}`
        : `1 ${toCurrency.code} = ${formatRate(rate.rate)} ${fromCurrency.code}`
      : "";
  const lineFor = (from: CurrencyCode, to: CurrencyCode) => {
    const r = rates.find((x) => x.from === from && x.to === to);
    if (!r) return null;
    return isMultiplyCorridor(from, to) ? `1 ${from} = ${formatRate(r.rate)} ${to}` : `1 ${to} = ${formatRate(r.rate)} ${from}`;
  };

  // The box you're NOT typing in rolls smoothly to its new value
  const tweenSent = useTween(amountSent);
  const tweenRecv = useTween(finalAmountReceived);
  const sendDisplay = mode === "send" ? amount : amountSent > 0 ? fmt(tweenSent) : "";
  const receiveDisplay = mode === "receive" ? amount : finalAmountReceived > 0 ? fmt(tweenRecv) : "";

  function handleFromChange(code: CurrencyCode) {
    setFromCode(code);
    const next = validToCurrencies(code);
    if (!next.some((c) => c.code === toCode)) setToCode(next[0]?.code);
    if (mode === "send") setAmount(fmt(QUICK_AMOUNTS[code][1]));
  }
  function pickRoute(f: CurrencyCode, t: CurrencyCode) {
    setFromCode(f);
    setToCode(t);
    setMode("send");
    setAmount(fmt(QUICK_AMOUNTS[f][1]));
  }
  function swapCurrencies() {
    if (!toCurrency || !validToCurrencies(toCurrency.code).some((c) => c.code === fromCode)) return;
    const recv = finalAmountReceived;
    setFromCode(toCurrency.code);
    setToCode(fromCode);
    setMode("send");
    if (recv > 0) setAmount(fmt(Math.round(recv)));
    setSwapCount((n) => n + 1);
  }
  function focusBox(target: Mode) {
    if (mode === target) return;
    const carried = target === "send" ? amountSent : amountReceived;
    setAmount(carried > 0 ? fmt(Math.round(carried * 100) / 100) : "");
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
    trend === "up" ? "text-red-500" : trend === "down" ? "text-emerald-500" : "text-primary";

  /* ---------- pieces ---------- */
  const currencyButton = (side: "from" | "to") => {
    const c = side === "from" ? fromCurrency : toCurrency ? CURRENCIES[toCurrency.code] : null;
    if (!c) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          (document.activeElement as HTMLElement | null)?.blur(); // close the keyboard first
          setPicker(side);
        }}
        aria-label={side === "from" ? "اختيار عملة الإرسال" : "اختيار عملة الاستلام"}
        className="flex shrink-0 items-center gap-2 rounded-full bg-surface py-1.5 pl-2.5 pr-1.5 shadow-soft ring-1 ring-border/70 transition-transform active:scale-95"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-surface2 text-xl leading-none">{c.flag}</span>
        <span className="font-mono text-[15px] font-bold text-ink">{c.code}</span>
        <ChevronDown size={15} className="text-subtle" />
      </button>
    );
  };

  const amountBox = (side: Mode) => {
    const active = mode === side;
    const value = side === "send" ? sendDisplay : receiveDisplay;
    const country = side === "send" ? fromCurrency.name : toCurrency?.name;
    return (
      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          document.getElementById(`calc-${side}`)?.focus();
        }}
        className={`relative cursor-text rounded-[22px] p-4 transition-all duration-200 sm:p-5 ${
          active ? "bg-surface2 ring-2 ring-primary/60" : "bg-surface2/70 ring-1 ring-border/60"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-subtle">{side === "send" ? "بترسل" : "المستلم يستلم"}</span>
          <span className="text-[11px] text-subtle">{country}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          {currencyButton(side === "send" ? "from" : "to")}
          <input
            id={`calc-${side}`}
            inputMode="decimal"
            size={1}
            value={value}
            onFocus={(e) => {
              focusBox(side);
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => amountNum > 0 && setAmount(fmt(amountNum))}
            onChange={(e) => {
              setMode(side);
              setAmount(formatTyping(e.target.value));
            }}
            onKeyDown={(e) => e.key === "Enter" && orderNow()}
            placeholder="0"
            dir="ltr"
            aria-label={side === "send" ? "المبلغ المرسل" : "المبلغ المستلم"}
            className={`min-w-0 flex-1 bg-transparent text-left font-mono font-bold tabular-nums outline-none placeholder:text-subtle/50 ${sizeFor(
              value || "0"
            )} ${side === "receive" ? "text-primary" : "text-ink"}`}
          />
        </div>
        {side === "send" && (
          <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1" dir="ltr">
            {QUICK_AMOUNTS[fromCode].map((q) => (
              <button
                key={q}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMode("send");
                  setAmount(fmt(q));
                }}
                className={`shrink-0 rounded-full px-3 py-1 font-mono text-[12px] font-semibold transition-colors ${
                  mode === "send" && amountNum === q ? "bg-primary text-white" : "bg-surface text-muted ring-1 ring-border/70 hover:text-primary"
                }`}
              >
                {q.toLocaleString("en-US")}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section id="calculator" className="scroll-mt-16 overflow-x-clip py-14 sm:py-20">
      <div className="container-page">
        <div className="mx-auto max-w-xl text-center">
          <p className="eyebrow">الحاسبة</p>
          <h2 className="section-heading mt-3">احسبها في ثانية</h2>
          <p className="mt-3 text-muted">اكتب المبلغ اللي حترسله أو اللي عاوزه يوصل — السعر اللي تشوفه هو اللي تتعامل بيه.</p>
        </div>

        <div className="relative mx-auto mt-8 max-w-xl">
          <div aria-hidden className="absolute -inset-8 -z-10 rounded-[3rem] bg-primary/10 blur-3xl" />

          {/* Popular routes */}
          <div className="no-scrollbar -mx-5 mb-3 overflow-x-auto px-5" dir="ltr">
            <div className="flex w-max gap-2">
              {POPULAR.filter(([f, t]) => validToCurrencies(f).some((c) => c.code === t)).map(([f, t]) => {
                const on = fromCode === f && toCurrency?.code === t;
                return (
                  <button
                    key={f + t}
                    onClick={() => pickRoute(f, t)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
                      on ? "bg-ink text-bg shadow-soft" : "bg-surface text-muted ring-1 ring-border/70 hover:text-ink"
                    }`}
                  >
                    <span className="text-base leading-none">{CURRENCIES[f].flag}</span>
                    <span className="font-mono">{f}</span>
                    <span className="opacity-50">→</span>
                    <span className="text-base leading-none">{CURRENCIES[t].flag}</span>
                    <span className="font-mono">{t}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative rounded-[30px] bg-gradient-to-b from-primary/40 via-border/40 to-border/30 p-px shadow-lift">
            <div className="rounded-[29px] bg-surface p-3 sm:p-4">
              {amountBox("send")}

              {/* Swap */}
              <div className="relative z-10 -my-4 flex justify-center">
                <motion.button
                  onClick={swapCurrencies}
                  animate={{ rotate: swapCount * 180 }}
                  whileTap={{ scale: 0.85 }}
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  aria-label="بدّل العملتين"
                  title="بدّل العملتين"
                  className="flex size-11 items-center justify-center rounded-full border-[5px] border-surface bg-primary text-white shadow-[0_8px_18px_-6px_rgba(254,82,0,0.8)]"
                >
                  <ArrowUpDown size={17} />
                </motion.button>
              </div>

              {amountBox("receive")}

              {/* Live rate bar */}
              {rate && toCurrency && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[22px] bg-surface2/70 px-4 py-3 ring-1 ring-border/60">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-subtle">
                      <span className="relative flex size-1.5">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                      </span>
                      سعر مباشر{rate.updatedAt ? ` · ${formatRelativeTime(rate.updatedAt)}` : ""}
                    </div>
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={rateLine}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                        className="mt-0.5 whitespace-nowrap font-mono text-[14px] font-bold text-ink sm:text-[15px]"
                        dir="ltr"
                        style={{ textAlign: "right" }}
                      >
                        {rateLine}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <Sparkline points={history} />
                    {change30 !== null && (
                      <span className={`font-mono text-[10px] font-semibold ${trendTone}`} dir="ltr">
                        {change30 >= 0 ? "▲" : "▼"} {Math.abs(change30).toFixed(1)}% · 30d
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Breakdown */}
              {rate && toCurrency && amountNum > 0 && (
                <dl className="mt-3 space-y-2 px-2 text-[13px]">
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1.5 text-muted">
                      <ShieldCheck size={14} className="text-emerald-500" /> رسوم التحويل
                    </dt>
                    <dd className="font-semibold text-emerald-500">مجاناً</dd>
                  </div>
                  {discountApplies && (
                    <div className="flex items-center justify-between">
                      <dt className="flex items-center gap-1.5 text-muted">
                        <Gift size={14} className="text-emerald-500" /> خصم {DISCOUNT_AMOUNT_USDT} USDT
                      </dt>
                      <dd className="font-mono font-semibold text-emerald-500" dir="ltr">
                        +{fmt(discountBonus)} {toCurrency.code}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1.5 text-muted">
                      <Clock size={14} className="text-primary" /> وقت الوصول
                    </dt>
                    <dd className="font-semibold text-ink">أقل من 30 دقيقة</dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 pt-2">
                    <dt className="font-semibold text-ink">المستلم يستلم</dt>
                    <dd className="font-mono text-[15px] font-bold text-primary" dir="ltr">
                      {fmt(finalAmountReceived)} {toCurrency.code}
                    </dd>
                  </div>
                </dl>
              )}

              {/* Discount nudge */}
              {nearDiscount && toDiscountLocal !== null && !flowPaused && (
                <button
                  onClick={() => {
                    setMode("send");
                    setAmount(fmt(Math.ceil(amountSent + toDiscountLocal)));
                  }}
                  className="mt-3 block w-full rounded-2xl bg-emerald-500/10 px-3.5 py-2.5 text-right ring-1 ring-emerald-500/25"
                >
                  <span className="flex items-center gap-2 text-[12px] text-ink">
                    <Gift size={15} className="shrink-0 text-emerald-500" />
                    زوّد <b className="font-mono" dir="ltr">{fmt(Math.ceil(toDiscountLocal))} {fromCode}</b> وخد خصم{" "}
                    <b className="text-emerald-500">{DISCOUNT_AMOUNT_USDT} USDT</b>
                    <span className="mr-auto text-[11px] font-semibold text-emerald-500">اضغط</span>
                  </span>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-emerald-500/15">
                    <span
                      className="block h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, ((usdtEquivalent ?? 0) / DISCOUNT_THRESHOLD_USDT) * 100)}%` }}
                    />
                  </span>
                </button>
              )}

              {/* Notes */}
              {flowPaused && toCurrency ? (
                <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-amber-500/10 p-3 text-xs text-ink ring-1 ring-amber-500/30" role="status">
                  <PauseCircle size={16} className="mt-px shrink-0 text-amber-500" />
                  <p>
                    التحويل من <b dir="ltr">{fromCurrency.code}</b> إلى <b dir="ltr">{toCurrency.code}</b> متوقف مؤقتاً. السعر للعلم
                    بس — راسلنا ونشوف ليك أقرب وقت متاح.
                  </p>
                </div>
              ) : (
                involvesSudan && (
                  <p className="mt-3 flex items-start gap-2 px-2 text-[11px] leading-relaxed text-subtle">
                    <AlertTriangle size={13} className="mt-px shrink-0 text-amber-500" />
                    سعر الجنيه السوداني بيتقلب — بنأكد ليك السعر النهائي في واتساب قبل التحويل.
                  </p>
                )
              )}

              {/* Actions */}
              <div className="mt-4 flex gap-2">
                <motion.button
                  onClick={orderNow}
                  disabled={!rate || amountNum <= 0}
                  whileTap={{ scale: 0.98 }}
                  className="btn-whatsapp h-14 flex-1 rounded-2xl text-[15px]"
                >
                  <WhatsAppIcon size={20} />
                  {flowPaused ? "اسأل عن التوفر" : "اطلب الآن عبر واتساب"}
                </motion.button>
                <button
                  onClick={shareResult}
                  disabled={!rate || sharing}
                  aria-label="مشاركة النتيجة كصورة"
                  title="مشاركة النتيجة كصورة"
                  className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface2 text-muted ring-1 ring-border/70 transition-colors hover:text-primary disabled:opacity-40"
                >
                  {sharing ? (
                    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}>
                      <Share2 size={19} />
                    </motion.span>
                  ) : shared ? (
                    <Check size={19} className="text-primary" />
                  ) : (
                    <Share2 size={19} />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Trust row */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-emerald-500" /> بدون رسوم مخفية
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-emerald-500" /> أقل من 30 دقيقة
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={14} className="text-emerald-500" /> خصم {DISCOUNT_AMOUNT_USDT} USDT فوق {DISCOUNT_THRESHOLD_USDT} USDT
            </span>
          </div>
        </div>
      </div>

      <CurrencyPicker
        open={picker === "from"}
        title="بترسل من"
        options={FROM_CURRENCIES.map((c) => ({ code: c.code, name: c.name, flag: CURRENCIES[c.code].flag }))}
        value={fromCode}
        onPick={handleFromChange}
        onClose={() => setPicker(null)}
      />
      <CurrencyPicker
        open={picker === "to"}
        title="المستلم يستلم بـ"
        options={currentToOptions.map((c) => ({ code: c.code, name: c.name, flag: CURRENCIES[c.code].flag }))}
        value={toCurrency?.code ?? toCode}
        onPick={setToCode}
        onClose={() => setPicker(null)}
        rateFor={(c) => lineFor(fromCode, c)}
        isPaused={(c) => paused.has(flowKey(fromCode, c))}
      />
    </section>
  );
}
