"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CURRENCIES, type CurrencyCode } from "@/lib/corridors";
import { formatRate } from "@/lib/format";
import type { RateRow } from "@/lib/rates";

function formatUpdated(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RatesTable({ rates }: { rates: RateRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CurrencyCode | "ALL">("ALL");

  const currencies = useMemo(() => {
    const set = new Set<CurrencyCode>();
    rates.forEach((r) => {
      set.add(r.from);
      set.add(r.to);
    });
    return Array.from(set);
  }, [rates]);

  const filtered = rates.filter((r) => {
    const matchesFilter = filter === "ALL" || r.from === filter || r.to === filter;
    const q = query.trim().toUpperCase();
    const matchesQuery =
      !q ||
      r.from.includes(q) ||
      r.to.includes(q) ||
      CURRENCIES[r.from].name.toUpperCase().includes(q) ||
      CURRENCIES[r.to].name.toUpperCase().includes(q);
    return matchesFilter && matchesQuery;
  });

  return (
    <section id="rates" className="border-t border-border py-20 sm:py-28">
      <div className="container-page">
        <p className="eyebrow">الأسعار المباشرة</p>
        <h2 className="section-heading mt-3">كل دول التحويل في جدول واحد واضح.</h2>
        <p className="mt-3 max-w-lg text-muted">
          الأسعار تتحدث خلال اليوم. ابحث عن دولة أو صفّي حسب العملة عشان تلقى
          الممر اللي يهمك.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن دولة أو عملة…"
              className="w-full rounded-lg border border-border bg-surface py-2.5 pr-9 pl-3 text-sm text-ink placeholder:text-subtle focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter("ALL")}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                filter === "ALL"
                  ? "border-primary bg-primary text-bg"
                  : "border-border text-muted hover:text-ink"
              }`}
            >
              الكل
            </button>
            {currencies.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  filter === c
                    ? "border-primary bg-primary text-bg"
                    : "border-border text-muted hover:text-ink"
                }`}
                dir="ltr"
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[520px] border-collapse text-right font-mono text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-xs text-subtle">
                <th className="px-5 py-3.5 font-medium">من</th>
                <th className="px-5 py-3.5 font-medium">إلى</th>
                <th className="px-5 py-3.5 font-medium">السعر</th>
                <th className="px-5 py-3.5 font-medium">آخر تحديث</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const from = CURRENCIES[r.from];
                const to = CURRENCIES[r.to];
                return (
                  <tr
                    key={`${r.from}-${r.to}`}
                    className={i % 2 === 0 ? "bg-bg" : "bg-surface/40"}
                  >
                    <td className="px-5 py-3.5 text-ink" dir="ltr">
                      {from.flag} {r.from}
                    </td>
                    <td className="px-5 py-3.5 text-ink" dir="ltr">
                      {to.flag} {r.to}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-primary" dir="ltr">{formatRate(r.rate)}</td>
                    <td className="px-5 py-3.5 text-subtle" dir="ltr">{formatUpdated(r.updatedAt)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-muted">
                    لا توجد نتائج مطابقة لـ «{query}».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
