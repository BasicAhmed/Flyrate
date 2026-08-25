"use client";

import type { RateHistoryPoint } from "@/lib/rateHistory";

interface Props {
  points: RateHistoryPoint[];
  label: string; // e.g. "SAR → MYR"
}

/** Small dependency-free SVG sparkline. Not meant to be a full charting
 *  library — just enough for a customer to see "is the rate trending up or
 *  down lately" at a glance. */
export default function RateHistoryChart({ points, label }: Props) {
  if (points.length < 2) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-surface2 p-4 text-center text-xs text-subtle">
        مفيش بيانات كافية لعرض السعر التاريخي لـ {label} لسه
      </div>
    );
  }

  const width = 320;
  const height = 88;
  const padX = 4;
  const padY = 10;

  const values = points.map((p) => p.marketPrice);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * (width - padX * 2);
    const y = padY + (1 - (p.marketPrice - min) / range) * (height - padY * 2);
    return { x, y };
  });

  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const trendUp = values[values.length - 1] >= values[0];
  const first = points[0];
  const last = points[points.length - 1];
  const changePct = ((last.marketPrice - first.marketPrice) / first.marketPrice) * 100;

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface2 p-4" dir="ltr">
      <div className="mb-2 flex items-center justify-between text-xs text-subtle">
        <span>{label} — آخر {points.length} يوم</span>
        <span className={trendUp ? "text-primary" : "text-ink"}>
          {changePct >= 0 ? "▲" : "▼"} {Math.abs(changePct).toFixed(1)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth={2} className="text-primary" />
        <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r={3} className="fill-primary" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-subtle">
        <span>{first.date}</span>
        <span>{last.date}</span>
      </div>
    </div>
  );
}
