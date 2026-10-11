export interface ShareCardHistoryPoint {
  date: string;
  marketPrice: number;
}

export interface ShareCardParams {
  fromFlag: string;
  fromCode: string;
  toFlag: string;
  toCode: string;
  amountSent: string; // pre-formatted, e.g. "5,000.00"
  amountReceived: string;
  rateLine: string; // e.g. "1 MYR = 4.05 ZAR"
  trendLabel?: string; // e.g. "▲ زيادة" or "▼ انخفاض"
  trendColor: "good" | "bad" | "neutral"; // "good" renders emerald, "bad" renders red
  updatedCaption?: string; // e.g. "آخر تحديث للسعر: منذ 3 ساعة"
  history?: ShareCardHistoryPoint[]; // last ~30 days of the pair's price, drawn as a chart
}
type P = ShareCardParams;
type C = CanvasRenderingContext2D;

/* FlyRate "boarding pass" share card — 1080×1350 (4:5), fits WhatsApp
 * Status and the Instagram feed. Currencies read like airport codes
 * (SDG ✈ MYR), with a tear-off stub holding the QR code. */

const W = 1080, H = 1350;
const AR = "'IBM Plex Sans Arabic', sans-serif";
const MONO = "'IBM Plex Mono', monospace";
const EMOJI = "'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
const OR = "#FE5200";
const OR_HOT = "#FF7A3D";
const SITE = "flyrate.exchange";
const GOOD = "#10B981", BAD = "#EF4444";

/* ---------------- drawing helpers ---------------- */
function rr(c: C, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function img(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
async function qr(text: string, dark = "#111", light = "#fff") {
  const q = (await import("qrcode-generator")).default(0, "M"); q.addData(text); q.make();
  const n = q.getModuleCount(), s = 10, cv = document.createElement("canvas"); cv.width = cv.height = n * s;
  const c = cv.getContext("2d")!; c.fillStyle = light; c.fillRect(0, 0, n * s, n * s); c.fillStyle = dark;
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(k * s, r * s, s, s);
  return cv;
}
/** Largest font size (stepping down from `start`) at which `t` fits in `max` px. */
function fit(c: C, t: string, f: (s: number) => string, start: number, min: number, max: number) {
  let s = start; while (s > min) { c.font = f(s); if (c.measureText(t).width <= max) break; s -= 2; } return s;
}
function T(c: C, t: string, x: number, y: number, font: string, color: string | CanvasGradient, align: CanvasTextAlign = "center", dir: CanvasDirection = "rtl") {
  c.font = font; c.fillStyle = color; c.textAlign = align; c.direction = dir; c.fillText(t, x, y);
}
function width(c: C, t: string, font: string) { c.font = font; return c.measureText(t).width; }
function flag(c: C, f: string, x: number, y: number, size: number) {
  c.save(); c.font = `${size}px ${EMOJI}`; c.textAlign = "center"; c.textBaseline = "middle"; c.direction = "ltr"; c.fillText(f, x, y); c.restore();
}
function glow(c: C, x: number, y: number, r: number, color: string, alpha: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace("ALPHA", String(alpha))); g.addColorStop(1, color.replace("ALPHA", "0"));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
const trendCol = (t: P["trendColor"]) => (t === "good" ? GOOD : t === "bad" ? BAD : OR);
async function fonts() {
  try { await Promise.all([`700 90px ${MONO}`, `600 40px ${MONO}`, `700 40px ${AR}`, `500 28px ${AR}`].map((s) => document.fonts.load(s))); } catch {}
}
const blob = (cv: HTMLCanvasElement) => new Promise<Blob>((r) => cv.toBlob((b) => r(b!), "image/png"));
function todayLabel() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
/** Clean history: numbers only, last 30 points. */
function series(p: P) {
  return (p.history ?? []).filter((h) => typeof h.marketPrice === "number" && h.marketPrice > 0).slice(-30);
}
function changePct(pts: ShareCardHistoryPoint[]) {
  if (pts.length < 2) return null;
  const a = pts[0].marketPrice, b = pts[pts.length - 1].marketPrice;
  return ((b - a) / a) * 100;
}

/** Smooth area chart. Returns false if there isn't enough history. */
function chart(
  c: C, pts: ShareCardHistoryPoint[], x: number, y: number, w: number, h: number,
  o: { line: string; fillTop: string; grid?: string; dot?: string; dotRing?: string; lw?: number }
) {
  if (pts.length < 2) return false;
  const v = pts.map((p) => p.marketPrice), min = Math.min(...v), max = Math.max(...v), range = max - min || max * 0.01 || 1;
  const pad = 10;
  const xy = v.map((val, i) => [x + (i / (v.length - 1)) * w, y + pad + (1 - (val - min) / range) * (h - pad * 2)] as const);
  if (o.grid) {
    c.save(); c.strokeStyle = o.grid; c.lineWidth = 1.5; c.setLineDash([4, 10]);
    for (let i = 0; i < 3; i++) { const gy = y + pad + (i / 2) * (h - pad * 2); c.beginPath(); c.moveTo(x, gy); c.lineTo(x + w, gy); c.stroke(); }
    c.restore();
  }
  const path = () => {
    c.moveTo(xy[0][0], xy[0][1]);
    for (let i = 1; i < xy.length; i++) {
      const [x0, y0] = xy[i - 1], [x1, y1] = xy[i], mx = (x0 + x1) / 2;
      c.bezierCurveTo(mx, y0, mx, y1, x1, y1);
    }
  };
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, o.fillTop); g.addColorStop(1, "rgba(0,0,0,0)");
  c.beginPath(); path(); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fillStyle = g; c.fill();
  c.save(); c.shadowColor = o.line; c.shadowBlur = 16; c.beginPath(); path();
  c.strokeStyle = o.line; c.lineWidth = o.lw ?? 5; c.lineJoin = "round"; c.lineCap = "round"; c.stroke(); c.restore();
  const [lx, ly] = xy[xy.length - 1];
  c.beginPath(); c.arc(lx, ly, 16, 0, 7); c.fillStyle = o.dotRing ?? "rgba(254,82,0,.25)"; c.fill();
  c.beginPath(); c.arc(lx, ly, 8, 0, 7); c.fillStyle = o.dot ?? "#fff"; c.fill();
  return true;
}

/** Simple white plane silhouette pointing right, centred on (x, y). */
function plane(c: C, x: number, y: number, size: number, color: string) {
  const k = size / 100;
  c.save(); c.translate(x, y); c.scale(k, k); c.fillStyle = color; c.beginPath();
  c.moveTo(50, 0); c.quadraticCurveTo(46, -7, 36, -7);           // nose → top of body
  c.lineTo(10, -7); c.lineTo(-14, -44); c.lineTo(-26, -44);       // top wing
  c.lineTo(-10, -7); c.lineTo(-34, -7); c.lineTo(-44, -22);       // body → tail fin
  c.lineTo(-52, -22); c.lineTo(-44, 0); c.lineTo(-52, 22);        // tail
  c.lineTo(-44, 22); c.lineTo(-34, 7); c.lineTo(-10, 7);          // tail fin → body
  c.lineTo(-26, 44); c.lineTo(-14, 44); c.lineTo(10, 7);          // bottom wing
  c.lineTo(36, 7); c.quadraticCurveTo(46, 7, 50, 0); c.closePath(); c.fill();
  c.restore();
}

async function drawCard(p: P) {
  await fonts(); const logo = await img("/logo-icon.png");
  const INK = "#1C1917", MUTE = "#8A7F76", PAPER = "#FFF8F1", LINE = "#EFE3D7";
  const code = await qr(`https://${SITE}`, INK, PAPER);
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d")!;
  const pts = series(p);
  // Unique-looking transaction id per card, e.g. FR-7K3Q9X (no 0/O/1/I to avoid mix-ups).
  const ALPH = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const trxnId = "FR-" + Array.from({ length: 6 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join("");

  /* ---- orange sky ---- */
  const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#FF8A3D"); bg.addColorStop(0.5, OR); bg.addColorStop(1, "#B23A00");
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  glow(c, W * 0.82, 90, 520, "rgba(255,226,190,ALPHA)", 0.4);
  glow(c, 80, H - 80, 520, "rgba(120,30,0,ALPHA)", 0.35);
  c.save(); c.strokeStyle = "rgba(255,255,255,.13)"; c.lineWidth = 3; c.setLineDash([2, 14]); c.lineCap = "round";
  for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(W / 2, H + 200, 700 + i * 120, 1100 + i * 90, 0, Math.PI, 2 * Math.PI); c.stroke(); }
  c.restore();
  // little plane flying across the sky
  plane(c, W - 330, 64, 34, "rgba(255,255,255,.55)");
  c.save(); c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 3; c.setLineDash([2, 10]); c.lineCap = "round";
  c.beginPath(); c.moveTo(W - 560, 84); c.quadraticCurveTo(W - 440, 60, W - 352, 64); c.stroke(); c.restore();

  /* ---- header ---- */
  c.save(); c.shadowColor = "rgba(0,0,0,.2)"; c.shadowBlur = 20;
  c.beginPath(); c.arc(116, 104, 44, 0, 7); c.fillStyle = "#fff"; c.fill(); c.restore();
  if (logo) { const h = 50, w = (logo.width / logo.height) * h; c.drawImage(logo, 116 - w / 2, 104 - h / 2, w, h); }
  T(c, "FlyRate", 178, 120, `700 46px ${AR}`, "#fff", "left", "ltr");
  T(c, "BOARDING PASS", W - 70, 108, `700 26px ${MONO}`, "#fff", "right", "ltr");
  T(c, "بطاقة تحويل", W - 70, 144, `500 24px ${AR}`, "rgba(255,255,255,.85)", "right");

  /* ---- ticket body ---- */
  const x = 56, y = 178, w = W - 112, h = 1134, cut = 930; // perforation at y+cut
  c.save(); c.shadowColor = "rgba(60,20,0,.38)"; c.shadowBlur = 60; c.shadowOffsetY = 24;
  rr(c, x, y, w, h, 40); c.fillStyle = PAPER; c.fill(); c.restore();
  // orange top edge, like a printed airline stripe
  c.save(); rr(c, x, y, w, h, 40); c.clip();
  const stripe = c.createLinearGradient(x, 0, x + w, 0); stripe.addColorStop(0, OR); stripe.addColorStop(1, OR_HOT);
  c.fillStyle = stripe; c.fillRect(x, y, w, 12); c.restore();
  // notches + perforation
  c.save(); c.globalCompositeOperation = "destination-out";
  c.beginPath(); c.arc(x, y + cut, 34, 0, 7); c.arc(x + w, y + cut, 34, 0, 7); c.fill(); c.restore();
  c.save(); c.globalCompositeOperation = "destination-over"; c.fillStyle = bg; c.fillRect(0, 0, W, H); c.restore();
  c.save(); c.setLineDash([14, 12]); c.strokeStyle = "#E3D3C4"; c.lineWidth = 3;
  c.beginPath(); c.moveTo(x + 50, y + cut); c.lineTo(x + w - 50, y + cut); c.stroke(); c.restore();
  const L = x + 56, R = x + w - 56;

  /* ---- info row: TRXN ID · DATE ---- */
  const info = (label: string, value: string, ix: number, align: CanvasTextAlign) => {
    T(c, label, ix, y + 62, `600 20px ${MONO}`, MUTE, align, "ltr");
    T(c, value, ix, y + 100, `700 30px ${MONO}`, INK, align, "ltr");
  };
  info("TRXN ID", trxnId, L, "left");
  info("DATE", todayLabel(), R, "right");
  c.fillStyle = LINE; c.fillRect(L, y + 126, R - L, 2);

  /* ---- FROM ✈ TO ---- */
  T(c, "FROM · من", L, y + 172, `600 22px ${MONO}`, MUTE, "left", "ltr");
  T(c, "TO · إلى", R, y + 172, `600 22px ${MONO}`, MUTE, "right", "ltr");
  T(c, p.fromCode, L - 4, y + 266, `700 112px ${MONO}`, INK, "left", "ltr");
  T(c, p.toCode, R + 4, y + 266, `700 112px ${MONO}`, INK, "right", "ltr");
  const flagChip = (fx: number, f: string, align: "left" | "right") => {
    const cx = align === "left" ? fx + 30 : fx - 30;
    c.beginPath(); c.arc(cx, y + 306, 26, 0, 7); c.fillStyle = "#fff"; c.fill();
    c.beginPath(); c.arc(cx, y + 306, 26, 0, 7); c.strokeStyle = LINE; c.lineWidth = 2; c.stroke();
    flag(c, f, cx, y + 308, 30);
  };
  flagChip(L, p.fromFlag, "left"); flagChip(R, p.toFlag, "right");
  const codeW = (t: string) => width(c, t, `700 112px ${MONO}`);
  const ax0 = L + codeW(p.fromCode) + 26, ax1 = R - codeW(p.toCode) - 26, am = (ax0 + ax1) / 2;
  c.save(); c.setLineDash([3, 12]); c.lineCap = "round"; c.strokeStyle = OR; c.lineWidth = 4;
  c.beginPath(); c.moveTo(ax0, y + 240); c.quadraticCurveTo(am, y + 130, ax1, y + 240); c.stroke(); c.restore();
  c.beginPath(); c.arc(ax0, y + 240, 7, 0, 7); c.fillStyle = OR; c.fill();
  c.beginPath(); c.arc(ax1, y + 240, 7, 0, 7); c.fillStyle = OR; c.fill();
  c.save(); c.shadowColor = "rgba(254,82,0,.45)"; c.shadowBlur = 18;
  c.beginPath(); c.arc(am, y + 186, 36, 0, 7); c.fillStyle = OR; c.fill(); c.restore();
  plane(c, am, y + 186, 44, "#fff");

  c.save(); c.setLineDash([2, 10]); c.strokeStyle = "#E3D3C4"; c.lineWidth = 2; c.lineCap = "round";
  c.beginPath(); c.moveTo(L, y + 356); c.lineTo(R, y + 356); c.stroke(); c.restore();

  /* ---- حترسل ---- */
  T(c, "حترسل", R, y + 400, `600 28px ${AR}`, MUTE, "right");
  let s = fit(c, p.amountSent, (z) => `700 ${z}px ${MONO}`, 60, 30, R - L - 130);
  T(c, p.amountSent, R, y + 464, `700 ${s}px ${MONO}`, INK, "right", "ltr");
  T(c, p.fromCode, R - width(c, p.amountSent, `700 ${s}px ${MONO}`) - 18, y + 464, `700 34px ${MONO}`, MUTE, "right", "ltr");

  /* ---- حتستلم — highlighted ---- */
  const by = y + 490, bh = 184;
  const hb = c.createLinearGradient(L, by, R, by + bh); hb.addColorStop(0, "rgba(254,82,0,.10)"); hb.addColorStop(1, "rgba(255,122,61,.18)");
  rr(c, L - 20, by, R - L + 40, bh, 28); c.fillStyle = hb; c.fill();
  rr(c, L - 20, by, R - L + 40, bh, 28); c.strokeStyle = "rgba(254,82,0,.28)"; c.lineWidth = 2; c.stroke();
  T(c, "حتستلم", R, by + 48, `700 30px ${AR}`, OR, "right");
  s = fit(c, p.amountReceived, (z) => `700 ${z}px ${MONO}`, 108, 48, R - L - 150);
  const rg = c.createLinearGradient(L, 0, R, 0); rg.addColorStop(0, "#C43F00"); rg.addColorStop(1, OR);
  T(c, p.amountReceived, R, by + 154, `700 ${s}px ${MONO}`, rg, "right", "ltr");
  T(c, p.toCode, R - width(c, p.amountReceived, `700 ${s}px ${MONO}`) - 20, by + 154, `700 44px ${MONO}`, OR_HOT, "right", "ltr");

  /* ---- rate + status ---- */
  const ry = by + bh + 52;
  T(c, "سعر الصرف", R, ry, `500 24px ${AR}`, MUTE, "right");
  s = fit(c, p.rateLine, (z) => `700 ${z}px ${MONO}`, 38, 22, (R - L) * 0.64);
  T(c, p.rateLine, R, ry + 48, `700 ${s}px ${MONO}`, INK, "right", "ltr");
  if (p.trendLabel) {
    const col = trendCol(p.trendColor), tw = width(c, p.trendLabel, `700 24px ${AR}`) + 40;
    T(c, "STATUS", L, ry, `600 20px ${MONO}`, MUTE, "left", "ltr");
    rr(c, L, ry + 14, tw, 46, 23); c.fillStyle = col + "22"; c.fill();
    T(c, p.trendLabel, L + tw / 2, ry + 46, `700 24px ${AR}`, col);
  }

  /* ---- 30-day chart ---- */
  const ky = ry + 92;
  if (pts.length >= 2) {
    const ch = changePct(pts)!;
    T(c, "حركة السعر — آخر 30 يوم", R, ky, `500 22px ${AR}`, MUTE, "right");
    T(c, `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}%`, L, ky, `700 22px ${MONO}`, OR, "left", "ltr");
    chart(c, pts, L, ky + 8, R - L, y + cut - ky - 26, { line: OR, fillTop: "rgba(254,82,0,.22)", dot: OR, dotRing: "rgba(254,82,0,.2)", lw: 4 });
  } else if (p.updatedCaption) {
    T(c, p.updatedCaption, W / 2, ky + 30, `500 24px ${AR}`, MUTE);
  }

  /* ---- tear-off stub ---- */
  const sy = y + cut;
  rr(c, L - 6, sy + 30, 162, 162, 18); c.fillStyle = "#fff"; c.fill();
  c.drawImage(code, L + 5, sy + 41, 140, 140);
  T(c, "حوّل فلوسك على FlyRate", R, sy + 82, `700 38px ${AR}`, INK, "right");
  T(c, "امسح الكود واحسب تحويلك · خلال دقائق", R, sy + 124, `500 23px ${AR}`, MUTE, "right");
  T(c, SITE, R, sy + 168, `700 28px ${MONO}`, OR, "right", "ltr");
  const titleW = Math.max(
    width(c, "حوّل فلوسك على FlyRate", `700 38px ${AR}`),
    width(c, "امسح الكود واحسب تحويلك · خلال دقائق", `500 23px ${AR}`),
  );
  let bx = L + 186; const bEnd = R - titleW - 30; c.fillStyle = "#D9CBBE";
  for (let i = 0; bx + 8 < bEnd; i++) { const lw = [3, 6, 2, 8, 4, 2][i % 6]; c.fillRect(bx, sy + 50, lw, 124); bx += lw + 5; }
  return blob(cv);
}

export async function createShareCardBlob(params: ShareCardParams): Promise<Blob | null> {
  try {
    return await drawCard(params);
  } catch {
    return null;
  }
}
