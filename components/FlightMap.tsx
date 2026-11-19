import { CURRENCIES, type CurrencyCode } from "@/lib/corridors";

/** Animated "flight routes" graphic for the hero. Pure SVG + CSS (no JS
 *  animation loop), so it stays smooth on phones and costs nothing to run.
 *  Positions are a stylised map, not to scale. */

type Node = { id: string; x: number; y: number; label: string; big?: boolean };

const NODES: Node[] = [
  { id: "EG", x: 128, y: 58, label: "مصر" },
  { id: "SD", x: 138, y: 122, label: "السودان", big: true },
  { id: "SA", x: 204, y: 88, label: "السعودية" },
  { id: "QA", x: 246, y: 66, label: "قطر" },
  { id: "AE", x: 276, y: 98, label: "الإمارات" },
  { id: "KE", x: 182, y: 178, label: "كينيا" },
  { id: "ZA", x: 112, y: 246, label: "جنوب أفريقيا", big: true },
  { id: "MY", x: 358, y: 172, label: "ماليزيا", big: true },
];
const at = (id: string) => NODES.find((n) => n.id === id)!;

const ROUTES: [string, string][] = [
  ["SD", "MY"],
  ["SD", "ZA"],
  ["EG", "ZA"],
  ["SA", "MY"],
  ["AE", "ZA"],
  ["KE", "ZA"],
  ["EG", "MY"],
  ["QA", "MY"],
];

/** Curved route between two cities (bulges "up" like a flight arc). */
function arc(a: Node, b: Node) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const k = 0.28 * len;
  // perpendicular, pointed upward on screen
  let px = -dy / len, py = dx / len;
  if (py > 0) { px = -px; py = -py; }
  const cx = mx + px * k, cy = my + py * k;
  return { d: `M${a.x},${a.y} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x},${b.y}`, len: Math.round(len * 1.15) };
}

const PATHS = ROUTES.map(([f, t]) => ({ key: `${f}-${t}`, ...arc(at(f), at(t)) }));
// Planes fly on the busiest routes, staggered
const PLANES = [
  { route: "SD-MY", dur: 6, begin: 0 },
  { route: "EG-ZA", dur: 7, begin: 1.5 },
  { route: "AE-ZA", dur: 6.5, begin: 3 },
  { route: "SA-MY", dur: 7.5, begin: 4.2 },
];

export interface MapChip {
  from: CurrencyCode;
  to: CurrencyCode;
  line: string;
}

export default function FlightMap({ chips = [] }: { chips?: MapChip[] }) {
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-surface/60 shadow-lift backdrop-blur">
        {/* ambient glow */}
        <div aria-hidden className="pointer-events-none absolute -left-1/4 -top-1/4 h-[90%] w-[90%] animate-drift rounded-full bg-primary/20 blur-3xl" />
        <svg viewBox="0 0 400 280" className="relative block h-auto w-full" role="img" aria-label="خريطة مسارات التحويل">
          <defs>
            <pattern id="fr-dots" width="10" height="10" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1" className="fill-ink/10" />
            </pattern>
            <radialGradient id="fr-fade" cx="50%" cy="50%" r="65%">
              <stop offset="0" stopColor="#fff" stopOpacity="1" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id="fr-mask">
              <rect width="400" height="280" fill="url(#fr-fade)" />
            </mask>
            <linearGradient id="fr-route" x1="0" x2="1">
              <stop offset="0" stopColor="#FF9A3D" />
              <stop offset="1" stopColor="#FE5200" />
            </linearGradient>
            {PATHS.map((p) => (
              <path key={p.key} id={`fr-${p.key}`} d={p.d} />
            ))}
          </defs>

          <rect width="400" height="280" fill="url(#fr-dots)" mask="url(#fr-mask)" />

          {/* routes: faint base line that draws in, then flowing dashes on top */}
          {PATHS.map((p, i) => (
            <g key={p.key}>
              <path
                d={p.d}
                fill="none"
                stroke="url(#fr-route)"
                strokeOpacity="0.35"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeDasharray={p.len}
                className="animate-draw"
                style={{ ["--len" as string]: p.len, animationDelay: `${0.3 + i * 0.12}s` }}
              />
              <path
                d={p.d}
                fill="none"
                stroke="url(#fr-route)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeDasharray="2 10"
                className="animate-dash-flow"
                style={{ animationDuration: `${1 + (i % 3) * 0.4}s` }}
              />
            </g>
          ))}

          {/* planes */}
          {PLANES.map((pl) => (
            <g key={pl.route}>
              <g>
                <path d="M7,0 L-5,-5 L-2,0 L-5,5 Z" fill="#FE5200" />
                <path d="M7,0 L-5,-5 L-2,0 L-5,5 Z" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="0.8" />
                <animateMotion dur={`${pl.dur}s`} begin={`${pl.begin}s`} repeatCount="indefinite" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.55 1">
                  <mpath href={`#fr-${pl.route}`} />
                </animateMotion>
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur={`${pl.dur}s`} begin={`${pl.begin}s`} repeatCount="indefinite" />
              </g>
            </g>
          ))}

          {/* cities */}
          {NODES.map((n, i) => (
            <g key={n.id}>
              <circle
                cx={n.x}
                cy={n.y}
                r={n.big ? 4 : 3}
                className="animate-ping2 fill-primary"
                style={{ transformOrigin: `${n.x}px ${n.y}px`, transformBox: "view-box", animationDelay: `${(i % 4) * 0.6}s` }}
              />
              <circle cx={n.x} cy={n.y} r={n.big ? 4 : 3} className="fill-primary" />
              <circle cx={n.x} cy={n.y} r={n.big ? 1.6 : 1.2} fill="#fff" />
              <text
                x={n.x}
                y={n.y + (n.id === "EG" || n.id === "QA" ? -9 : 15)}
                textAnchor="middle"
                className={`fill-ink ${n.big ? "font-semibold" : ""}`}
                style={{ fontSize: n.big ? 10 : 8.5, opacity: n.big ? 0.9 : 0.6 }}
              >
                {n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* floating live-rate chips */}
      {chips.slice(0, 2).map((c, i) => (
        <div
          key={`${c.from}${c.to}`}
          className={`absolute ${i === 0 ? "-top-4 left-3 sm:-left-4" : "-bottom-5 right-3 sm:-right-4"} animate-float`}
          style={{ animationDelay: `${i * 1.2}s` }}
        >
          <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-surface/90 px-3 py-2 shadow-lift backdrop-blur">
            <span className="text-lg leading-none">
              {CURRENCIES[c.from].flag}
              {CURRENCIES[c.to].flag}
            </span>
            <span className="leading-tight">
              <span className="block text-[10px] text-subtle" dir="ltr">
                {c.from} → {c.to}
              </span>
              <span className="block font-mono text-[12px] font-bold text-primary" dir="ltr">
                {c.line}
              </span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
