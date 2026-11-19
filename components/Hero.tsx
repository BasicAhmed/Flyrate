"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Zap, ShieldCheck, Clock } from "lucide-react";
import { whatsappLink } from "@/lib/whatsapp";
import { CURRENCIES, isMultiplyCorridor, type CurrencyCode } from "@/lib/corridors";
import { formatRate } from "@/lib/format";
import { flowKey } from "@/lib/flows";
import type { RateRow } from "@/lib/rates";
import { selectCorridor } from "./Calculator";
import WhatsAppIcon from "./WhatsAppIcon";
import FlightMap from "./FlightMap";
import { useLiveRates } from "./LiveRates";

// Busiest corridors, shown as one-tap shortcuts into the calculator
const FEATURED: [CurrencyCode, CurrencyCode][] = [
  ["SDG", "EGP"],
  ["SDG", "MYR"],
  ["SAR", "MYR"],
  ["EGP", "ZAR"],
];

export default function Hero(props: { rates: RateRow[]; disabledFlows?: string[] }) {
  const { rates, disabledFlows } = useLiveRates(props.rates, props.disabledFlows);
  const featured = FEATURED.map(([from, to]) => {
    const r = rates.find((x) => x.from === from && x.to === to);
    if (!r) return null;
    const line = isMultiplyCorridor(from, to)
      ? `1 ${from} = ${formatRate(r.rate)} ${to}`
      : `1 ${to} = ${formatRate(r.rate)} ${from}`;
    return { from, to, line, paused: disabledFlows.includes(flowKey(from, to)) };
  }).filter(Boolean) as { from: CurrencyCode; to: CurrencyCode; line: string; paused: boolean }[];

  // Headline, revealed word by word
  const line1 = ["حوّل", "قروشك", "أسرع،"];
  const line2 = ["بسعر", "يستاهل", "فعلاً."];
  const word = (w: string, i: number, accent = false) => (
    <span key={w + i} className="inline-block overflow-hidden pb-1 align-bottom">
      <span
        className={`inline-block animate-word-in ${accent ? "bg-brand-gradient bg-clip-text text-transparent" : ""}`}
        style={{ animationDelay: `${0.08 + i * 0.09}s` }}
      >
        {w}
      </span>
      &nbsp;
    </span>
  );

  return (
    <section id="top" className="relative overflow-hidden">
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid-fade" />
      <div aria-hidden className="pointer-events-none absolute -right-40 top-10 size-[28rem] animate-drift rounded-full bg-primary/15 blur-3xl" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent"
      />

      <div className="container-page relative grid items-center gap-12 pb-14 pt-10 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-20">
        {/* Copy */}
        <div className="text-center lg:text-right">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            أسعار مباشرة من السوق · تتحدث كل دقائق
          </motion.p>

          <h1 className="mt-5 font-display text-[42px] font-bold leading-[1.15] tracking-tight text-ink sm:text-6xl lg:text-[58px]">
            <span className="block">{line1.map((w, i) => word(w, i))}</span>
            <span className="block">{line2.map((w, i) => word(w, i + 3, i > 0))}</span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg lg:mx-0"
          >
            من السودان ومصر والخليج لجنوب أفريقيا وماليزيا وكينيا — والعكس. احسب، اطلب على واتساب،
            والفلوس توصل في دقائق.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.65 }}
            className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center lg:justify-start"
          >
            <a
              href="#calculator"
              className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-primary px-7 py-4 text-sm font-semibold text-white shadow-[0_14px_30px_-12px_rgba(254,82,0,0.8)] transition-transform hover:scale-[1.03]"
            >
              <span
                aria-hidden
                className="absolute inset-0 animate-shimmer bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.35)_50%,transparent_65%)] bg-[length:200%_100%]"
              />
              <span className="relative">احسب التحويل</span>
              <ArrowLeft size={16} className="relative transition-transform group-hover:-translate-x-1" />
            </a>
            <a
              href={whatsappLink("السلام عليكم 👋\nعندي استفسار عن تحويل.")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp px-7 py-4 text-sm"
            >
              <WhatsAppIcon size={18} /> تواصل عبر واتساب
            </a>
          </motion.div>

          {/* Stats */}
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mx-auto mt-9 grid max-w-md grid-cols-3 divide-x divide-x-reverse divide-border/70 lg:mx-0"
          >
            {[
              { v: "30", u: "دقيقة", l: "متوسط التحويل", icon: Clock },
              { v: "8", u: "دول", l: "ممرات مباشرة", icon: Zap },
              { v: "0", u: "رسوم", l: "بدون مخفي", icon: ShieldCheck },
            ].map(({ v, u, l, icon: Icon }) => (
              <div key={l} className="px-3 text-center lg:text-right lg:first:pr-0">
                <dt className="flex items-center justify-center gap-1 text-[11px] text-subtle lg:justify-start">
                  <Icon size={12} className="text-primary" /> {l}
                </dt>
                <dd className="mt-1">
                  <span className="font-display text-3xl font-bold text-ink">{v}</span>{" "}
                  <span className="text-xs font-semibold text-muted">{u}</span>
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* Flight map */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-xl px-2 sm:px-6 lg:px-0"
        >
          <FlightMap chips={featured.filter((f) => !f.paused).map(({ from, to, line }) => ({ from, to, line }))} />
        </motion.div>
      </div>

      {/* Live corridor shortcuts */}
      {featured.length > 0 && (
        <div className="container-page relative pb-14">
          <p className="text-center text-xs text-subtle lg:text-right">أسعار اليوم — اضغط على أي ممر عشان تحسبه</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {featured.map((f, i) => (
              <motion.button
                key={`${f.from}${f.to}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.9 + i * 0.07 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => selectCorridor(f.from, f.to)}
                className="card group relative overflow-hidden p-3.5 text-right transition-colors hover:border-primary/60"
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-primary/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
                />
                <span className="flex items-center justify-between">
                  <span className="text-xl leading-none">
                    {CURRENCIES[f.from].flag}
                    <span className="mx-0.5 text-xs text-subtle">←</span>
                    {CURRENCIES[f.to].flag}
                  </span>
                  <ArrowLeft size={14} className="text-subtle transition-all group-hover:-translate-x-0.5 group-hover:text-primary" />
                </span>
                <span className="mt-2 block font-mono text-[11px] font-semibold text-muted" dir="ltr" style={{ textAlign: "right" }}>
                  {f.from} → {f.to}
                </span>
                <span className="mt-0.5 block font-mono text-[13px] font-bold text-primary" dir="ltr" style={{ textAlign: "right" }}>
                  {f.line}
                </span>
                {f.paused && <span className="mt-1 block text-[10px] text-amber-500">متوقف مؤقتاً</span>}
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
