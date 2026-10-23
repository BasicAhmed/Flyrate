"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Flame,
  Lightbulb,
  MoonStar,
  Rocket,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { db, firebaseEnabled } from "@/lib/firebase";
import { CURRENCIES, type CurrencyCode } from "@/lib/corridors";
import type { RateRow } from "@/lib/rates";
import type { SaleEntry } from "@/lib/sales";
import type { RateHistoryPoint } from "@/lib/rateHistory";
import { buildInsights, type Idea } from "@/lib/insights";
import { cacheGet, cacheSet } from "@/lib/localCache";

const usd = (n: number, d = 0) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const flag = (c?: string) => (c ? CURRENCIES[c as CurrencyCode]?.flag ?? "$" : "");

const STYLE: Record<Idea["kind"], { icon: typeof Flame; chip: string; label: string }> = {
  opportunity: { icon: Flame, chip: "bg-emerald-500/15 text-emerald-500", label: "فرصة" },
  push: { icon: Rocket, chip: "bg-primary/15 text-primary", label: "للهدف" },
  leak: { icon: AlertTriangle, chip: "bg-amber-500/15 text-amber-600", label: "انتبه" },
  upsell: { icon: TrendingUp, chip: "bg-sky-500/15 text-sky-500", label: "ربح أكثر" },
  quiet: { icon: MoonStar, chip: "bg-surface2 text-muted", label: "مسار واقف" },
  habit: { icon: Clock, chip: "bg-surface2 text-muted", label: "عادة" },
};

/** النصائح — reads the stored price history once, then advises from the
 *  admin's own sales + live rates (see lib/insights.ts for every rule). */
export default function InsightsPanel({
  sales,
  rates,
  target,
  today,
  disabledFlows,
}: {
  sales: SaleEntry[];
  rates: RateRow[];
  target: number;
  today: string;
  disabledFlows: string[];
}) {
  const [history, setHistory] = useState<Map<string, RateHistoryPoint[]>>(
    () => new Map(Object.entries(cacheGet<Record<string, RateHistoryPoint[]>>("rateHistoryAll") ?? {}))
  );
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseEnabled || !db) return;
    getDocs(collection(db, "rateHistory"))
      .then((snap) => {
        const m = new Map<string, RateHistoryPoint[]>();
        snap.forEach((d) => m.set(d.id, d.data().entries ?? []));
        setHistory(m);
        cacheSet("rateHistoryAll", Object.fromEntries(m));
      })
      .catch(() => {});
  }, []);

  const ins = useMemo(
    () => buildInsights({ sales, rates, history, disabledFlows, target, today }),
    [sales, rates, history, disabledFlows, target, today]
  );
  const p = ins.plan;

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      window.prompt("انسخ الرسالة:", text);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {/* Target plan */}
      <div className="relative overflow-hidden rounded-[26px] bg-ink p-5 text-bg">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 size-56 rounded-full bg-primary/30 blur-2xl" />
        <div className="relative">
          <p className="flex items-center gap-1.5 text-[13px] font-medium opacity-70">
            <Target size={14} /> خطة اليوم
          </p>
          {p.remaining > 0 ? (
            <>
              <p className="mt-1 text-[15px] font-semibold">
                باقي لك{" "}
                <span className="font-mono text-[30px] font-bold text-primary" dir="ltr">
                  {usd(p.remaining)}
                </span>
              </p>
              <p className="mt-1 text-[13px] opacity-75">
                ≈ <b>{p.dealsNeeded}</b> عمليات بمتوسط <span dir="ltr">{usd(p.avgTicket)}</span> — وحتكسب حوالي{" "}
                <span className="font-mono" dir="ltr">
                  {usd(p.remaining * (p.avgMargin / 100), 2)}
                </span>{" "}
                زيادة
              </p>
            </>
          ) : (
            <p className="mt-1 text-[22px] font-bold">
              🎉 حققت هدف اليوم <span className="text-primary">({usd(p.todayUsd)})</span>
            </p>
          )}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg/20">
            <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] opacity-70" dir="ltr">
            <span>
              {usd(p.todayUsd)} / {usd(p.target)}
            </span>
            <span>{p.progress.toFixed(0)}%</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ["ربح اليوم", usd(p.todayProfit, 2)],
              ["هامشك (30 يوم)", `${p.avgMargin.toFixed(2)}%`],
              ["عادة في اليوم ده", p.weekdayAvg !== null ? usd(p.weekdayAvg) : "—"],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-bg/10 px-2 py-2">
                <p className="text-[10px] opacity-65">{l}</p>
                <p className="mt-0.5 font-mono text-[13px] font-bold" dir="ltr">
                  {v}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ideas */}
      <div>
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            <Sparkles size={14} className="text-primary" /> اقتراحات اليوم
          </p>
          <p className="text-[12px] text-subtle">{ins.ideas.length}</p>
        </div>
        {ins.ideas.length === 0 ? (
          <div className="card p-6 text-center text-xs leading-relaxed text-subtle">
            لسه ما في اقتراحات — كل ما تسجّل عمليات أكثر (من → إلى) والأسعار تتجمّع، النصائح بتبقى أدق.
          </div>
        ) : (
          <div className="space-y-2.5">
            {ins.ideas.map((idea) => {
              const st = STYLE[idea.kind];
              const Icon = st.icon;
              return (
                <div key={idea.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${st.chip}`}>
                      <Icon size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.chip}`}>{st.label}</span>
                        {idea.flow && (
                          <span className="text-sm">
                            {flag(idea.flow.from)} → {flag(idea.flow.to)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[14px] font-bold text-ink">{idea.title}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted">{idea.body}</p>
                      {idea.priceLine && (
                        <p className="mt-2 inline-block rounded-xl bg-surface2 px-3 py-1.5 font-mono text-[13px] font-bold text-ink" dir="ltr">
                          {idea.priceLine}
                        </p>
                      )}
                      {idea.message && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button onClick={() => copy(idea.id, idea.message!)} className="btn-ghost h-10 text-[12px]">
                            {copied === idea.id ? <Check size={14} /> : <Copy size={14} />}
                            {copied === idea.id ? "اتنسخ" : "انسخ الرسالة"}
                          </button>
                          <a
                            href={`https://wa.me/?text=${encodeURIComponent(idea.message)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[14px] bg-[#25D366] text-[12px] font-semibold text-white"
                          >
                            واتساب
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top routes */}
      {ins.topFlows.length > 0 && (
        <div>
          <p className="px-1 pb-2 text-[13px] font-semibold text-muted">أكثر المسارات ربحاً — آخر 30 يوم</p>
          <div className="card group-list overflow-hidden p-0">
            {ins.topFlows.map((f, i) => (
              <div key={`${f.from}${f.to}`} className="flex items-center gap-3 px-4 py-3">
                <span className="w-4 font-mono text-[12px] font-bold text-subtle">{i + 1}</span>
                <span className="text-lg">
                  {flag(f.from)}
                  {f.to ? ` ${flag(f.to)}` : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[14px] font-bold text-ink" dir="ltr" style={{ textAlign: "right" }}>
                    {f.from}
                    {f.to ? ` → ${f.to}` : ""}
                  </p>
                  <p className="text-[11px] text-subtle">
                    {f.count} عملية · هامش {f.margin.toFixed(2)}% · متوسط <span dir="ltr">{usd(f.avgTicket)}</span>
                  </p>
                </div>
                <span className="font-mono text-[14px] font-bold text-emerald-500" dir="ltr">
                  +{usd(f.profit, 2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Habits */}
      <div className="grid grid-cols-3 gap-2">
        {[
          ["أقوى وقت", ins.habits.bestHour ?? "—"],
          ["أقوى يوم", ins.habits.bestWeekday ?? "—"],
          ["ربح يومي متوسط", usd(ins.habits.avgDailyProfit, 2)],
        ].map(([l, v]) => (
          <div key={l} className="card-sm px-3 py-3">
            <p className="text-[10px] text-subtle">{l}</p>
            <p className="mt-0.5 truncate text-[13px] font-bold text-ink">{v}</p>
          </div>
        ))}
      </div>

      <p className="flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-subtle">
        <Lightbulb size={13} className="mt-0.5 shrink-0" />
        النصائح محسوبة من عملياتك والأسعار المخزّنة لآخر 30 يوم — مساعدة للقرار، مش ضمان للسوق.
      </p>
    </div>
  );
}
