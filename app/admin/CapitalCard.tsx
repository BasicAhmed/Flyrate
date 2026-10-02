"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, ArrowUpFromLine, Landmark, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { getCapital, saveCapital, summarizeCapital, type CapitalMove, type CapitalSettings } from "@/lib/capital";
import type { SaleEntry } from "@/lib/sales";
import { cacheGet, cacheSet } from "@/lib/localCache";

const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const cleanNum = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;
const fmtInput = (raw: string) => {
  const clean = raw.replace(/[^0-9.]/g, "");
  if (!clean) return "";
  const [i, ...d] = clean.split(".");
  const intFmt = Number(i || "0").toLocaleString("en-US");
  return d.length ? `${intFmt}.${d.join("").slice(0, 2)}` : intFmt;
};

function Sparkline({ points }: { points: { date: string; value: number }[] }) {
  if (points.length < 2) return null;
  const w = 600;
  const h = 90;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, 6 + (1 - (p.value - min) / range) * (h - 12)]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="capFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgb(var(--color-primary))" stopOpacity="0.35" />
          <stop offset="1" stopColor="rgb(var(--color-primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#capFill)" />
      <path d={line} fill="none" stroke="rgb(var(--color-primary))" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="5" fill="rgb(var(--color-primary))" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function CapitalCard({
  sales,
  today,
  onError,
}: {
  sales: SaleEntry[];
  today: string;
  onError: (msg: string) => void;
}) {
  // `undefined` in the cache = never fetched on this device; `null` = fetched, not set up yet
  const [cached] = useState(() => cacheGet<{ cap: CapitalSettings | null }>("capital"));
  const [loaded, setLoaded] = useState(!!cached);
  const [cap, setCap] = useState<CapitalSettings | null>(cached?.cap ?? null);
  const [editing, setEditing] = useState(false);
  const [startInput, setStartInput] = useState(cached?.cap ? fmtInput(String(cached.cap.starting)) : "");
  const [dateInput, setDateInput] = useState(cached?.cap?.startDate ?? today);
  const [moveType, setMoveType] = useState<CapitalMove["type"] | null>(null);
  const [moveAmount, setMoveAmount] = useState("");
  const [moveNote, setMoveNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    getCapital()
      .then((c) => {
        setCap(c);
        if (c) {
          setStartInput(fmtInput(String(c.starting)));
          setDateInput(c.startDate);
        }
        setLoaded(true);
      })
      .catch(() => {
        // Offline: keep the cached copy. With nothing cached we must NOT fall
        // through to the setup form — saving there would overwrite the real
        // capital we just failed to read.
        if (!cached) setFailed(true);
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (loaded && !failed) cacheSet("capital", { cap });
  }, [loaded, failed, cap]);

  const s = useMemo(() => (cap ? summarizeCapital(cap, sales, today) : null), [cap, sales, today]);

  async function persist(next: CapitalSettings) {
    setBusy(true);
    const prev = cap;
    setCap(next); // optimistic
    try {
      await saveCapital(next);
    } catch (err) {
      setCap(prev);
      onError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  }

  async function saveSetup() {
    const starting = cleanNum(startInput);
    if (starting <= 0) return;
    await persist({ starting, startDate: dateInput || today, moves: cap?.moves ?? [] });
    setEditing(false);
  }

  async function addMove() {
    const amount = cleanNum(moveAmount);
    if (!cap || !moveType || amount <= 0) return;
    const move: CapitalMove = {
      id: `${Date.now()}`,
      date: today,
      type: moveType,
      amount,
      ...(moveNote.trim() ? { note: moveNote.trim() } : {}),
    };
    await persist({ ...cap, moves: [move, ...cap.moves] });
    setMoveType(null);
    setMoveAmount("");
    setMoveNote("");
  }

  async function removeMove(m: CapitalMove) {
    if (!cap) return;
    if (!window.confirm(`حذف ${m.type === "deposit" ? "إيداع" : "سحب"} ${usd(m.amount)}؟`)) return;
    await persist({ ...cap, moves: cap.moves.filter((x) => x.id !== m.id) });
  }

  if (!loaded) return <div className="card h-40 animate-pulse" />;

  if (failed) {
    return (
      <div className="card flex items-center justify-between gap-3 p-5">
        <p className="text-sm text-muted">تعذر تحميل رأس المال — تأكد من الاتصال.</p>
        <button onClick={() => setAttempt((n) => n + 1)} className="btn-ghost shrink-0 px-4 py-2 text-xs">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  /* ---------- setup / edit ---------- */
  if (!cap || editing) {
    return (
      <div className="card relative overflow-hidden p-5">
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-accent/10" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <Landmark size={16} className="text-primary" /> {cap ? "تعديل رأس المال" : "حدد رأس مالك"}
            </p>
            {cap && (
              <button onClick={() => setEditing(false)} aria-label="إلغاء" className="rounded-lg p-1.5 text-subtle hover:text-ink">
                <X size={16} />
              </button>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            اكتب رأس المال اللي بديت بيه بالدولار. كل ربح تسجله بعد التاريخ ده بيتضاف عليه تلقائياً.
          </p>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2" dir="ltr">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base font-semibold text-subtle">$</span>
              <input
                inputMode="decimal"
                value={startInput}
                onChange={(e) => setStartInput(fmtInput(e.target.value))}
                placeholder="10,000"
                aria-label="رأس المال"
                className="field py-3 pl-8 pr-3.5 font-mono text-lg font-bold"
              />
            </div>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              aria-label="تاريخ البداية"
              className="field px-3 py-3 font-mono text-xs"
            />
          </div>
          <button onClick={saveSetup} disabled={busy || cleanNum(startInput) <= 0} className="btn-primary mt-3 w-full py-3 text-sm">
            {busy ? "جارٍ الحفظ…" : "حفظ رأس المال"}
          </button>
        </div>
      </div>
    );
  }

  if (!s) return null;
  const netMoves = s.deposits - s.withdrawals;
  const projection30 = s.current + s.avgDailyProfit * 30;
  const recentMoves = cap.moves.slice(0, 5);

  /* ---------- summary ---------- */
  return (
    <div className="card relative overflow-hidden p-0">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-56 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent" />
      <div className="relative p-5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Landmark size={14} className="text-primary" /> رأس المال الحالي
          </p>
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted shadow-soft hover:text-ink"
          >
            <Pencil size={11} /> تعديل
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
          <motion.p
            key={s.current.toFixed(2)}
            initial={{ opacity: 0.4, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-mono text-4xl font-extrabold text-ink"
            dir="ltr"
          >
            {usd(s.current)}
          </motion.p>
          <span
            className={`mb-1.5 rounded-full px-2 py-0.5 font-mono text-xs font-bold ${
              s.growthPct >= 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
            }`}
            dir="ltr"
          >
            {pct(s.growthPct)}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-subtle">
          من <span dir="ltr">{cap.startDate}</span> · {s.daysTracked} يوم
        </p>

        <div className="-mx-1 mt-3">
          <Sparkline points={s.series} />
        </div>

        {/* Breakdown */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "البداية", value: usd(s.starting, 0), tone: "text-ink" },
            { label: "الأرباح", value: `+${usd(s.profit)}`, tone: "text-emerald-500" },
            {
              label: "إيداع/سحب",
              value: `${netMoves >= 0 ? "+" : "−"}${usd(Math.abs(netMoves), 0)}`,
              tone: netMoves >= 0 ? "text-ink" : "text-red-500",
            },
          ].map((b) => (
            <div key={b.label} className="rounded-xl bg-surface2 px-3 py-2.5 shadow-well">
              <p className="text-[10px] text-subtle">{b.label}</p>
              <p className={`mt-0.5 truncate font-mono text-sm font-bold ${b.tone}`} dir="ltr">
                {b.value}
              </p>
            </div>
          ))}
        </div>

        {/* Pace */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border/60 px-3 py-2.5">
            <p className="text-[10px] text-subtle">عائد هذا الشهر</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-ink" dir="ltr">
              {usd(s.monthProfit)} <span className="text-[11px] text-emerald-500">{pct(s.monthReturnPct)}</span>
            </p>
          </div>
          <div className="rounded-xl border border-border/60 px-3 py-2.5">
            <p className="text-[10px] text-subtle">متوسط الربح اليومي</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-ink" dir="ltr">
              {usd(s.avgDailyProfit)}
            </p>
          </div>
        </div>
        {s.avgDailyProfit > 0 && (
          <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-[11px] text-ink">
            <Sparkles size={13} className="shrink-0 text-primary" />
            بنفس المعدل، رأس مالك حيبقى{" "}
            <span className="font-mono font-bold text-primary" dir="ltr">
              {usd(projection30, 0)}
            </span>{" "}
            بعد 30 يوم.
          </p>
        )}

        {/* Deposit / withdraw */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setMoveType(moveType === "deposit" ? null : "deposit")}
            className={`btn-ghost py-2.5 text-xs ${moveType === "deposit" ? "border-emerald-500/60 text-emerald-500" : ""}`}
          >
            <ArrowDownToLine size={14} /> إيداع
          </button>
          <button
            onClick={() => setMoveType(moveType === "withdraw" ? null : "withdraw")}
            className={`btn-ghost py-2.5 text-xs ${moveType === "withdraw" ? "border-red-500/60 text-red-500" : ""}`}
          >
            <ArrowUpFromLine size={14} /> سحب
          </button>
        </div>

        <AnimatePresence initial={false}>
          {moveType && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-2 rounded-2xl bg-surface2 p-3 shadow-well">
                <p className="text-[11px] text-muted">
                  {moveType === "deposit" ? "فلوس إضافية دخلتها في الشغل" : "فلوس سحبتها من الشغل لنفسك"}
                </p>
                <div className="grid grid-cols-[1fr_auto] gap-2" dir="ltr">
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-subtle">$</span>
                    <input
                      inputMode="decimal"
                      value={moveAmount}
                      onChange={(e) => setMoveAmount(fmtInput(e.target.value))}
                      onKeyDown={(e) => e.key === "Enter" && addMove()}
                      placeholder="500"
                      aria-label="المبلغ"
                      className="field py-2.5 pl-7 pr-3 font-mono text-sm font-bold"
                    />
                  </div>
                  <button
                    onClick={addMove}
                    disabled={busy || cleanNum(moveAmount) <= 0}
                    className="btn-primary px-5 py-2.5 text-xs"
                  >
                    {busy ? "…" : "حفظ"}
                  </button>
                </div>
                <input
                  value={moveNote}
                  onChange={(e) => setMoveNote(e.target.value)}
                  placeholder="ملاحظة (اختياري)"
                  className="field px-3 py-2 text-xs"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {recentMoves.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {recentMoves.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 rounded-xl border border-border/60 px-3 py-2">
                <span
                  className={`rounded-lg p-1.5 ${
                    m.type === "deposit" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
                  }`}
                >
                  {m.type === "deposit" ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-ink">{m.note || (m.type === "deposit" ? "إيداع" : "سحب")}</p>
                  <p className="font-mono text-[10px] text-subtle" dir="ltr">
                    {m.date}
                  </p>
                </div>
                <span
                  className={`font-mono text-xs font-bold ${m.type === "deposit" ? "text-emerald-500" : "text-red-500"}`}
                  dir="ltr"
                >
                  {m.type === "deposit" ? "+" : "−"}
                  {usd(m.amount)}
                </span>
                <button
                  onClick={() => removeMove(m)}
                  aria-label="حذف"
                  className="rounded-lg p-1 text-subtle hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
