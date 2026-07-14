import { CURRENCIES } from "@/lib/corridors";
import { formatRate } from "@/lib/format";
import type { RateRow } from "@/lib/rates";

export default function RateTicker({ rates }: { rates: RateRow[] }) {
  const loop = [...rates, ...rates]; // duplicated for seamless scroll

  return (
    <div className="relative overflow-hidden border-y border-border bg-surface py-3">
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-surface to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-surface to-transparent" />
      <div className="flex w-max animate-ticker gap-10 whitespace-nowrap" dir="ltr">
        {loop.map((r, i) => {
          const from = CURRENCIES[r.from];
          const to = CURRENCIES[r.to];
          return (
            <div key={i} className="flex items-center gap-2 font-mono text-sm">
              <span className="text-muted">
                {from.flag} {r.from} → {to.flag} {r.to}
              </span>
              <span className="font-semibold text-primary">{formatRate(r.rate)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
