"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, ChevronLeft } from "lucide-react";

const MONTH_NAMES = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const WEEKDAY_NAMES = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  bookedDates: Set<string>;
  projectedDates: Set<string>;
  selected: string | null;
  onSelect: (date: string) => void;
}

export default function BookingCalendar({ bookedDates, projectedDates, selected, onSelect }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [direction, setDirection] = useState(1);

  const touchStartX = { current: 0 };

  function goToMonth(delta: number) {
    setDirection(delta);
    setViewDate((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-surface2 p-4"
      onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (delta > 50) goToMonth(-1);
        else if (delta < -50) goToMonth(1);
      }}
    >
      <div className="flex items-center justify-between">
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          onClick={() => goToMonth(-1)}
          className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-ink"
          aria-label="الشهر السابق"
        >
          <ChevronRight size={18} />
        </motion.button>
        <div className="relative h-5 w-32 overflow-hidden text-center">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.p
              key={`${month}-${year}`}
              custom={direction}
              initial={{ x: direction * 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -direction * 24, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="absolute inset-x-0 font-display text-sm font-semibold text-ink"
            >
              {MONTH_NAMES[month]} {year}
            </motion.p>
          </AnimatePresence>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          onClick={() => goToMonth(1)}
          className="rounded-full p-1.5 text-muted hover:bg-surface hover:text-ink"
          aria-label="الشهر التالي"
        >
          <ChevronLeft size={18} />
        </motion.button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-subtle">
        {WEEKDAY_NAMES.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={`${month}-${year}-grid`}
          custom={direction}
          initial={{ x: direction * 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -direction * 40, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="mt-1 grid grid-cols-7 gap-1"
        >
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const dateStr = toDateStr(d);
            const isPast = d < today;
            const isBooked = bookedDates.has(dateStr);
            const isSelected = selected === dateStr;
            const isProjected = !isSelected && projectedDates.has(dateStr);
            const disabled = isPast || isBooked;

            let cls = "bg-green-500/10 text-ink hover:bg-green-500/20 cursor-pointer";
            if (isPast) cls = "text-subtle/40 cursor-not-allowed";
            else if (isBooked) cls = "bg-red-500/15 text-red-400/70 cursor-not-allowed line-through";
            if (isSelected) cls = "bg-primary text-bg font-bold shadow-lg shadow-primary/30";
            else if (isProjected) cls = "bg-primary/25 text-ink";

            return (
              <motion.button
                key={dateStr}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(dateStr)}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15, delay: Math.min(i * 0.008, 0.25) }}
                whileTap={!disabled ? { scale: 0.88 } : undefined}
                whileHover={!disabled ? { scale: 1.06 } : undefined}
                className={`aspect-square rounded-lg text-xs transition-colors ${cls}`}
              >
                {d.getDate()}
              </motion.button>
            );
          })}
        </motion.div>
      </AnimatePresence>

      <div className="mt-3 flex items-center gap-4 text-[11px] text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/40" /> متاح
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/40" /> محجوز
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" /> اختيارك
        </span>
      </div>
    </div>
  );
}
