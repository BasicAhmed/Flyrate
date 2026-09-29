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

// Busiest corridors, shown as one-tap shortcuts into the calculator
const FEATURED: [CurrencyCode, CurrencyCode][] = [
  ["SDG", "EGP"],
  ["SDG", "MYR"],
  ["SAR", "MYR"],
  ["EGP", "ZAR"],
];

export default function Hero({ rates, disabledFlows = [] }: { rates: RateRow[]; disabledFlows?: string[] }) {
  const featured = FEATURED.map(([from, to]) => {
    const r = rates.find((x) => x.from === from && x.to === to);
    if (!r) return null;
    const line = isMultiplyCorridor(from, to)
      ? `1 ${from} = ${formatRate(r.rate)} ${to}`
      : `1 ${to} = ${formatRate(r.rate)} ${from}`;
    return { from, to, line, paused: disabledFlows.includes(flowKey(from, to)) };
  }).filter(Boolean) as { from: CurrencyCode; to: CurrencyCode; line: string; paused: boolean }[];

  return (
    <section id="top" className="relative overflow-hidden bg-grid-fade">
      <div className="container-page flex flex-col items-center pb-10 pt-14 text-center sm:pb-14 sm:pt-20">
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
          أسعار مباشرة · موثوق من الطلاب في 7 دول
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.2] tracking-tight text-ink sm:text-6xl"
        >
          حول قروشك أسرع،
          <br />
          بسعر <span className="text-primary">يستاهل فعلاً.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-5 max-w-xl text-base text-muted sm:text-lg"
        >
          بين السودان ومصر والخليج من جهة، وجنوب أفريقيا وماليزيا من جهة تانية — مصمم للطلاب اللي
          محتاجين سرعة وسعر ظابط.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row"
        >
          <a
            href="#calculator"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-bg shadow-[0_10px_24px_-10px_rgba(254,82,0,0.7)] transition-transform hover:scale-[1.03]"
          >
            احسب التحويل <ArrowLeft size={16} />
          </a>
          <a
            href={whatsappLink("السلام عليكم 👋\nعندي استفسار عن تحويل.")}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-whatsapp px-7 py-3.5 text-sm"
          >
            <WhatsAppIcon size={18} /> تواصل عبر واتساب
          </a>
        </motion.div>

        {/* Live corridor shortcuts */}
        {featured.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22 }}
            className="mt-10 w-full max-w-3xl"
          >
            <p className="text-xs text-subtle">أسعار اليوم — اضغط على أي ممر عشان تحسبه</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {featured.map((f) => (
                <button
                  key={`${f.from}${f.to}`}
                  onClick={() => selectCorridor(f.from, f.to)}
                  className="card group p-3 text-center transition-colors hover:border-primary/60"
                >
                  <div className="text-sm font-semibold text-ink" dir="ltr">
                    {CURRENCIES[f.from].flag} {f.from} <span className="text-subtle">→</span> {CURRENCIES[f.to].flag} {f.to}
                  </div>
                  <div className="mt-1 font-mono text-xs font-semibold text-primary" dir="ltr">
                    {f.line}
                  </div>
                  {f.paused && <div className="mt-1 text-[10px] text-amber-500">متوقف مؤقتاً</div>}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted"
        >
          <span className="flex items-center gap-1.5">
            <Clock size={14} className="text-primary" /> أقل من 30 دقيقة
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-primary" /> بدون رسوم مخفية
          </span>
          <span className="flex items-center gap-1.5">
            <Zap size={14} className="text-primary" /> دعم فوري في واتساب
          </span>
        </motion.div>
      </div>
    </section>
  );
}
