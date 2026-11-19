import { CURRENCIES, isMultiplyCorridor, type CurrencyCode } from "./corridors";
import { formatRate } from "./format";
import type { RateRow } from "./rates";
import type { RateHistoryPoint } from "./rateHistory";
import { AR, BAD, GOOD, MONO, OR, OR_HOT, SITE, T, blob, chart, flag, fonts, glow, img, qr, rr, width } from "./shareCard";

/** "أسعار اليوم" picture for the WhatsApp group: two currency pairs, both
 *  directions each, today's customer price, and whether the market moved up
 *  or down since yesterday (from the stored daily price history). */

export const BOARD_PAIRS: [CurrencyCode, CurrencyCode][] = [
  ["SDG", "ZAR"],
  ["EGP", "ZAR"],
];

const NAMES: Partial<Record<CurrencyCode, string>> = {
  SDG: "الجنيه السوداني",
  EGP: "الجنيه المصري",
  ZAR: "الراند",
  MYR: "الرينجت",
  SAR: "الريال السعودي",
  AED: "الدرهم",
  QAR: "الريال القطري",
  KES: "الشلن الكيني",
  USDT: "USDT",
  USD: "الدولار",
};

export interface BoardPair {
  a: CurrencyCode; // e.g. SDG
  b: CurrencyCode; // e.g. ZAR — price is "1 b = x a"
  lines: { from: CurrencyCode; to: CurrencyCode; text: string }[];
  dayChange: number | null; // % change of "a per 1 b" vs yesterday
  weekChange: number | null;
  history: RateHistoryPoint[]; // last 7 days
}

/** Builds the rows from live (with margin) rates + market history. */
export function buildBoard(rates: RateRow[], histories: Record<string, RateHistoryPoint[]>): BoardPair[] {
  const out: BoardPair[] = [];
  for (const [a, b] of BOARD_PAIRS) {
    const lines: BoardPair["lines"] = [];
    for (const [f, t] of [
      [a, b],
      [b, a],
    ] as [CurrencyCode, CurrencyCode][]) {
      const r = rates.find((x) => x.from === f && x.to === t);
      if (!r) continue;
      const text = isMultiplyCorridor(f, t) ? `1 ${f} = ${formatRate(r.rate)} ${t}` : `1 ${t} = ${formatRate(r.rate)} ${f}`;
      lines.push({ from: f, to: t, text });
    }
    if (!lines.length) continue;
    const live = rates.find((x) => x.from === a && x.to === b)?.marketPrice;
    const h = (histories[`${a}_${b}`] ?? []).filter((p) => p.marketPrice > 0);
    const today = new Date().toISOString().slice(0, 10);
    const prev = [...h].reverse().find((p) => p.date < today);
    const cur = live ?? h[h.length - 1]?.marketPrice;
    const weekAgo = h.length ? h[Math.max(0, h.length - 8)] : undefined;
    out.push({
      a,
      b,
      lines,
      dayChange: cur && prev ? ((cur - prev.marketPrice) / prev.marketPrice) * 100 : null,
      weekChange: cur && weekAgo && weekAgo !== prev ? ((cur - weekAgo.marketPrice) / weekAgo.marketPrice) * 100 : null,
      history: [...h.slice(-7)].concat(cur && h[h.length - 1]?.date !== today ? [{ date: today, marketPrice: cur }] : []).slice(-7),
    });
  }
  return out;
}

/** Short names for the direction labels: "من السوداني إلى الراند". */
const SHORT: Partial<Record<CurrencyCode, string>> = {
  SDG: "السوداني",
  EGP: "المصري",
  ZAR: "الراند",
  MYR: "الرينجت",
  SAR: "السعودي",
  AED: "الدرهم",
  QAR: "القطري",
  KES: "الكيني",
};

const FLAT = 0.1; // below this % counts as "steady"
function dirWord(chg: number | null) {
  if (chg === null || Math.abs(chg) < FLAT) return "steady" as const;
  return chg > 0 ? ("up" as const) : ("down" as const);
}
/** e.g. "الراند طالع قدام الجنيه السوداني" */
export function pairSentence(p: BoardPair) {
  const d = dirWord(p.dayChange);
  const b = NAMES[p.b] ?? p.b, a = NAMES[p.a] ?? p.a;
  return d === "up" ? `${b} طالع قدام ${a}` : d === "down" ? `${b} نازل قدام ${a}` : `${b} ثابت قدام ${a}`;
}
/** One-line market headline for the picture. */
export function marketHeadline(pairs: BoardPair[]) {
  const dirs = pairs.map((p) => dirWord(p.dayChange));
  const b = NAMES[pairs[0]?.b] ?? "";
  if (dirs.length && dirs.every((d) => d === "up")) return { text: `السوق اليوم: ${b} في ارتفاع`, dir: "up" as const };
  if (dirs.length && dirs.every((d) => d === "down")) return { text: `السوق اليوم: ${b} في انخفاض`, dir: "down" as const };
  if (dirs.length && dirs.every((d) => d === "steady")) return { text: "السوق اليوم: الأسعار ثابتة", dir: "steady" as const };
  return { text: "السوق اليوم: حركة متفاوتة", dir: "mixed" as const };
}

const W = 1080, H = 1350;

export async function createDailyBoardBlob(pairs: BoardPair[]): Promise<Blob | null> {
  try {
    await fonts();
    const logo = await img("/logo-icon.png");
    const code = await qr(`https://${SITE}`, "#141217", "#ffffff");
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const c = cv.getContext("2d")!;

    /* background */
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1A0B04");
    bg.addColorStop(0.35, "#0E0C0E");
    bg.addColorStop(1, "#09090B");
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    glow(c, W * 0.85, 40, 620, "rgba(254,82,0,ALPHA)", 0.42);
    glow(c, 0, H * 0.7, 520, "rgba(255,122,61,ALPHA)", 0.1);
    c.fillStyle = "rgba(255,255,255,.04)";
    for (let gy = 28; gy < H; gy += 34) for (let gx = 28; gx < W; gx += 34) c.fillRect(gx, gy, 2, 2);

    /* header */
    const L = 64, R = W - 64;
    c.save();
    c.shadowColor = "rgba(254,82,0,.6)";
    c.shadowBlur = 30;
    c.beginPath();
    c.arc(L + 44, 104, 44, 0, 7);
    c.fillStyle = "#fff";
    c.fill();
    c.restore();
    if (logo) {
      const h = 48, w = (logo.width / logo.height) * h;
      c.drawImage(logo, L + 44 - w / 2, 104 - h / 2, w, h);
    }
    T(c, "Fly", L + 104, 122, `700 46px ${AR}`, "#fff", "left", "ltr");
    T(c, "Rate", L + 104 + width(c, "Fly", `700 46px ${AR}`), 122, `700 46px ${AR}`, OR_HOT, "left", "ltr");

    T(c, "أسعار اليوم", R, 116, `700 64px ${AR}`, "#fff", "right");
    const now = new Date();
    const dayAr = now.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    T(c, dayAr, R, 166, `500 28px ${AR}`, "rgba(255,255,255,.65)", "right");

    /* market headline */
    const head = marketHeadline(pairs);
    const hc = head.dir === "up" ? GOOD : head.dir === "down" ? BAD : OR;
    const hy = 214;
    rr(c, L, hy, R - L, 96, 30);
    c.fillStyle = hc + "1F";
    c.fill();
    rr(c, L, hy, R - L, 96, 30);
    c.strokeStyle = hc + "66";
    c.lineWidth = 2;
    c.stroke();
    const arrow = head.dir === "up" ? "▲" : head.dir === "down" ? "▼" : "●";
    T(c, head.text, R - 34, hy + 60, `700 36px ${AR}`, "#fff", "right");
    T(c, `${arrow}  مقارنة بأمس`, L + 34, hy + 58, `600 24px ${AR}`, hc, "left", "rtl");

    /* pair cards */
    const top = 346, gap = 30, cardH = (1120 - top - gap * (pairs.length - 1)) / Math.max(pairs.length, 1);
    pairs.forEach((p, idx) => {
      const y = top + idx * (cardH + gap);
      c.save();
      c.shadowColor = "rgba(0,0,0,.45)";
      c.shadowBlur = 40;
      c.shadowOffsetY = 14;
      rr(c, L, y, R - L, cardH, 36);
      c.fillStyle = "rgba(255,255,255,.05)";
      c.fill();
      c.restore();
      rr(c, L, y, R - L, cardH, 36);
      const bd = c.createLinearGradient(L, y, R, y + cardH);
      bd.addColorStop(0, "rgba(255,122,61,.55)");
      bd.addColorStop(0.5, "rgba(255,255,255,.06)");
      bd.addColorStop(1, "rgba(254,82,0,.35)");
      c.strokeStyle = bd;
      c.lineWidth = 2;
      c.stroke();

      const cx = R - 40;
      // flags + names
      c.beginPath(); c.arc(cx - 30, y + 62, 30, 0, 7); c.fillStyle = "#1C1A1E"; c.fill();
      c.beginPath(); c.arc(cx - 78, y + 62, 30, 0, 7); c.fillStyle = "#1C1A1E"; c.fill();
      flag(c, CURRENCIES[p.a].flag, cx - 30, y + 64, 34);
      flag(c, CURRENCIES[p.b].flag, cx - 78, y + 64, 34);
      T(c, `${NAMES[p.a] ?? p.a} ⇄ ${NAMES[p.b] ?? p.b}`, cx - 124, y + 74, `700 32px ${AR}`, "#fff", "right");

      // trend chip
      const d = dirWord(p.dayChange);
      const col = d === "up" ? GOOD : d === "down" ? BAD : "#A1A1AA";
      const chipTxt =
        p.dayChange === null ? "ثابت" : `${d === "up" ? "▲" : d === "down" ? "▼" : "●"} ${Math.abs(p.dayChange).toFixed(2)}%`;
      const cw = width(c, chipTxt, `700 26px ${MONO}`) + 36;
      rr(c, L + 36, y + 38, cw, 50, 25);
      c.fillStyle = col + "26";
      c.fill();
      T(c, chipTxt, L + 36 + cw / 2, y + 72, `700 26px ${MONO}`, col, "center", "ltr");

      // two directions
      const rowY0 = y + 116;
      const rowH = (cardH - 116 - 96) / 2;
      p.lines.forEach((ln, i) => {
        const ry = rowY0 + i * rowH;
        if (i > 0) {
          c.fillStyle = "rgba(255,255,255,.08)";
          c.fillRect(L + 36, ry, R - L - 72, 2);
        }
        const mid = ry + rowH / 2;
        // right: flags + "من X إلى Y"
        c.fillStyle = "#fff"; // emoji take the current fill's alpha
        flag(c, CURRENCIES[ln.from].flag, cx - 14, mid, 30);
        flag(c, CURRENCIES[ln.to].flag, cx - 54, mid, 30);
        T(c, `من ${SHORT[ln.from] ?? ln.from} إلى ${SHORT[ln.to] ?? ln.to}`, cx - 82, mid + 10, `600 28px ${AR}`, "rgba(255,255,255,.75)", "right");
        // left: the price
        const priceFont = `700 ${width(c, ln.text, `700 42px ${MONO}`) > 440 ? 36 : 42}px ${MONO}`;
        T(c, ln.text, L + 40, mid + 14, priceFont, i === 0 ? "#fff" : OR_HOT, "left", "ltr");
      });

      // footer: 7-day chart + sentence
      const fy = y + cardH - 86;
      T(c, pairSentence(p), cx, fy + 52, `600 24px ${AR}`, col === "#A1A1AA" ? "rgba(255,255,255,.7)" : col, "right");
      if (p.weekChange !== null) {
        T(c, "آخر أسبوع", L + 300, fy + 34, `500 20px ${AR}`, "rgba(255,255,255,.45)", "left", "rtl");
        T(c, `${p.weekChange >= 0 ? "▲" : "▼"} ${Math.abs(p.weekChange).toFixed(1)}%`, L + 300, fy + 66, `700 24px ${MONO}`, p.weekChange >= 0 ? GOOD : BAD, "left", "ltr");
      }
      chart(c, p.history, L + 36, fy + 6, 240, 66, { line: OR_HOT, fillTop: "rgba(254,82,0,.3)", dot: "#fff", dotRing: "rgba(254,82,0,.35)", lw: 4 });
    });

    /* CTA bar */
    const by = 1160, bh = 128;
    c.save();
    c.shadowColor = "rgba(254,82,0,.55)";
    c.shadowBlur = 40;
    const cg = c.createLinearGradient(L, 0, R, 0);
    cg.addColorStop(0, "#C43F00");
    cg.addColorStop(0.55, OR);
    cg.addColorStop(1, OR_HOT);
    rr(c, L, by, R - L, bh, 36);
    c.fillStyle = cg;
    c.fill();
    c.restore();
    rr(c, L + 18, by + 14, 100, 100, 20);
    c.fillStyle = "#fff";
    c.fill();
    c.drawImage(code, L + 24, by + 20, 88, 88);
    T(c, "حوّل الآن — التحويل خلال دقائق", R - 32, by + 58, `700 36px ${AR}`, "#fff", "right");
    T(c, `${SITE}  ·  الأسعار قابلة للتغيير خلال اليوم`, R - 32, by + 100, `500 22px ${AR}`, "rgba(255,255,255,.88)", "right");

    return await blob(cv);
  } catch {
    return null;
  }
}
