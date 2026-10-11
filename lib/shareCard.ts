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

/* Three card styles (all 1080×1350, 4:5 — fits WhatsApp Status and the
 * Instagram feed):
 *   midnight — dark, glowing orange, price chart (premium fintech look)
 *   ticket   — FlyRate boarding pass: FROM/TO like airport codes
 *   aurora   — soft light peach, big number, clean chart
 * SHARE_STYLE picks one; "rotate" alternates on every share. */
export type ShareStyle = "midnight" | "ticket" | "aurora";
export const SHARE_STYLE: ShareStyle | "rotate" = "rotate";

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
function arrow(c: C, x: number, y: number, dir: "down" | "left" | "right", size: number, color: string, lw = 5) {
  c.save(); c.strokeStyle = color; c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath();
  const s = size / 2, h = size * 0.32;
  if (dir === "down") { c.moveTo(x, y - s); c.lineTo(x, y + s); c.moveTo(x - h, y + s - h); c.lineTo(x, y + s); c.lineTo(x + h, y + s - h); }
  else if (dir === "left") { c.moveTo(x + s, y); c.lineTo(x - s, y); c.moveTo(x - s + h, y - h); c.lineTo(x - s, y); c.lineTo(x - s + h, y + h); }
  else { c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x + s - h, y - h); c.lineTo(x + s, y); c.lineTo(x + s - h, y + h); }
  c.stroke(); c.restore();
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

/* ============ 1 — Midnight (dark, glowing) ============ */
async function styleMidnight(p: P) {
  await fonts(); const logo = await img("/logo-icon.png"); const code = await qr(`https://${SITE}`);
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d")!;
  const pts = series(p);

  // background: near-black with warm glows + dot grid
  const bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#160A05"); bg.addColorStop(0.45, "#0C0909"); bg.addColorStop(1, "#08080B");
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  glow(c, W / 2, 80, 620, "rgba(254,82,0,ALPHA)", 0.38);
  glow(c, W + 40, H * 0.62, 520, "rgba(255,122,61,ALPHA)", 0.12);
  glow(c, -60, H * 0.85, 460, "rgba(254,82,0,ALPHA)", 0.10);
  c.fillStyle = "rgba(255,255,255,.045)";
  for (let gy = 30; gy < H; gy += 36) for (let gx = 30; gx < W; gx += 36) c.fillRect(gx, gy, 2, 2);

  // header: logo tile + wordmark
  c.save(); c.shadowColor = "rgba(254,82,0,.7)"; c.shadowBlur = 40;
  rr(c, W / 2 - 62, 52, 124, 124, 34); c.fillStyle = "#1A0E08"; c.fill(); c.restore();
  rr(c, W / 2 - 62, 52, 124, 124, 34); c.strokeStyle = "rgba(255,122,61,.75)"; c.lineWidth = 3; c.stroke();
  if (logo) { const h = 70, w = (logo.width / logo.height) * h; c.drawImage(logo, W / 2 - w / 2, 114 - h / 2, w, h); }
  const fw = width(c, "Fly", `700 58px ${AR}`), rw = width(c, "Rate", `700 58px ${AR}`), sx = W / 2 - (fw + rw) / 2;
  T(c, "Fly", sx, 250, `700 58px ${AR}`, "#fff", "left", "ltr");
  T(c, "Rate", sx + fw, 250, `700 58px ${AR}`, OR_HOT, "left", "ltr");
  const sub = `عرض سعر تحويل  •  `; const dl = todayLabel();
  const sw = width(c, sub, `500 26px ${AR}`), dw = width(c, dl, `500 26px ${MONO}`), s0 = W / 2 + (sw + dw) / 2;
  T(c, sub, s0, 296, `500 26px ${AR}`, "rgba(255,255,255,.62)", "right");
  T(c, dl, s0 - sw, 296, `500 26px ${MONO}`, "rgba(255,255,255,.62)", "right", "ltr");

  // main glass card
  const x = 60, y = 336, w = W - 120, h = 610;
  c.save(); c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 60; c.shadowOffsetY = 20;
  rr(c, x, y, w, h, 44); c.fillStyle = "rgba(255,255,255,.045)"; c.fill(); c.restore();
  const border = c.createLinearGradient(x, y, x + w, y + h);
  border.addColorStop(0, "rgba(255,122,61,.75)"); border.addColorStop(0.5, "rgba(255,255,255,.08)"); border.addColorStop(1, "rgba(254,82,0,.45)");
  rr(c, x, y, w, h, 44); c.strokeStyle = border; c.lineWidth = 2.5; c.stroke();
  const L = x + 50, R = x + w - 50;

  // corridor row: from on the right (RTL), arrow pointing left to the receiver
  const cy = y + 86;
  const circle = (cx: number, f: string) => {
    c.save(); c.shadowColor = "rgba(254,82,0,.55)"; c.shadowBlur = 22;
    c.beginPath(); c.arc(cx, cy, 46, 0, 7); c.fillStyle = "#140B07"; c.fill(); c.restore();
    c.beginPath(); c.arc(cx, cy, 46, 0, 7); c.strokeStyle = OR; c.lineWidth = 3; c.stroke();
    flag(c, f, cx, cy + 2, 46);
  };
  circle(R - 46, p.fromFlag); circle(L + 46, p.toFlag);
  T(c, p.fromCode, R - 112, cy + 16, `700 44px ${MONO}`, "#fff", "right", "ltr");
  T(c, p.toCode, L + 112, cy + 16, `700 44px ${MONO}`, "#fff", "left", "ltr");
  const a0 = L + 112 + width(c, p.toCode, `700 44px ${MONO}`) + 30, a1 = R - 112 - width(c, p.fromCode, `700 44px ${MONO}`) - 30;
  c.save(); c.setLineDash([3, 12]); c.lineCap = "round"; c.strokeStyle = "rgba(255,122,61,.8)"; c.lineWidth = 4;
  c.beginPath(); c.moveTo(a0, cy); c.lineTo(a1, cy); c.stroke(); c.restore();
  const mid = (a0 + a1) / 2;
  c.save(); c.shadowColor = "rgba(254,82,0,.9)"; c.shadowBlur = 30;
  const ag = c.createLinearGradient(mid - 34, cy - 34, mid + 34, cy + 34); ag.addColorStop(0, OR_HOT); ag.addColorStop(1, OR);
  c.beginPath(); c.arc(mid, cy, 34, 0, 7); c.fillStyle = ag; c.fill(); c.restore();
  arrow(c, mid, cy, "left", 30, "#fff", 5);

  c.fillStyle = "rgba(255,255,255,.08)"; c.fillRect(L, y + 168, R - L, 2);

  // amounts
  T(c, "المبلغ المُرسَل", R, y + 226, `500 30px ${AR}`, "rgba(255,255,255,.6)", "right");
  let s = fit(c, p.amountSent, (z) => `700 ${z}px ${MONO}`, 76, 36, R - L - 140);
  T(c, p.amountSent, R, y + 304, `700 ${s}px ${MONO}`, "#fff", "right", "ltr");
  T(c, p.fromCode, R - width(c, p.amountSent, `700 ${s}px ${MONO}`) - 20, y + 304, `600 34px ${MONO}`, "rgba(255,255,255,.45)", "right", "ltr");

  c.fillStyle = "rgba(255,255,255,.08)"; c.fillRect(L, y + 344, R - L - 80, 2);
  c.save(); c.shadowColor = "rgba(254,82,0,.8)"; c.shadowBlur = 24;
  c.beginPath(); c.arc(R - 30, y + 345, 28, 0, 7); c.fillStyle = OR; c.fill(); c.restore();
  arrow(c, R - 30, y + 345, "down", 26, "#fff", 4.5);

  T(c, "المستلم يستلم", R, y + 400, `600 30px ${AR}`, OR_HOT, "right");
  s = fit(c, p.amountReceived, (z) => `700 ${z}px ${MONO}`, 112, 50, R - L - 150);
  c.save(); c.shadowColor = "rgba(255,122,61,.55)"; c.shadowBlur = 36;
  T(c, p.amountReceived, R, y + 516, `700 ${s}px ${MONO}`, "#fff", "right", "ltr"); c.restore();
  T(c, p.toCode, R - width(c, p.amountReceived, `700 ${s}px ${MONO}`) - 22, y + 516, `700 46px ${MONO}`, OR_HOT, "right", "ltr");

  // rate strip
  const ry = y + 538;
  rr(c, L - 14, ry, R - L + 28, 54, 20); c.fillStyle = "rgba(0,0,0,.35)"; c.fill();
  rr(c, L - 14, ry, R - L + 28, 54, 20); c.strokeStyle = "rgba(255,255,255,.07)"; c.lineWidth = 2; c.stroke();
  T(c, "سعر الصرف", R - 10, ry + 37, `500 24px ${AR}`, "rgba(255,255,255,.6)", "right");
  c.beginPath(); c.arc(L + 12, ry + 27, 8, 0, 7); c.fillStyle = GOOD; c.fill();
  T(c, p.rateLine, L + 32, ry + 37, `600 28px ${MONO}`, "#fff", "left", "ltr");
  if (p.trendLabel) {
    const col = trendCol(p.trendColor), tx = L + 32 + width(c, p.rateLine, `600 28px ${MONO}`) + 18, tw = width(c, p.trendLabel, `600 22px ${AR}`) + 30;
    rr(c, tx, ry + 10, tw, 34, 17); c.fillStyle = col + "26"; c.fill();
    T(c, p.trendLabel, tx + tw / 2, ry + 35, `600 22px ${AR}`, col);
  }

  // chart card
  const ky = 970, kh = 190;
  rr(c, x, ky, w, kh, 34); c.fillStyle = "rgba(255,255,255,.035)"; c.fill();
  rr(c, x, ky, w, kh, 34); c.strokeStyle = "rgba(255,255,255,.08)"; c.lineWidth = 2; c.stroke();
  if (pts.length >= 2) {
    T(c, "حركة السعر — آخر 30 يوم", R, ky + 46, `600 26px ${AR}`, "rgba(255,255,255,.8)", "right");
    const ch = changePct(pts)!; const up = ch >= 0;
    const lab = `${up ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}%`, lw2 = width(c, lab, `700 24px ${MONO}`) + 32;
    rr(c, L - 10, ky + 18, lw2, 40, 20); c.fillStyle = "rgba(255,122,61,.16)"; c.fill();
    T(c, lab, L - 10 + lw2 / 2, ky + 46, `700 24px ${MONO}`, OR_HOT, "center", "ltr");
    chart(c, pts, L, ky + 70, R - L, 82, { line: OR_HOT, fillTop: "rgba(254,82,0,.32)", grid: "rgba(255,255,255,.07)" });
    T(c, pts[0].date, L, ky + 176, `500 18px ${MONO}`, "rgba(255,255,255,.4)", "left", "ltr");
    T(c, pts[pts.length - 1].date, R, ky + 176, `500 18px ${MONO}`, "rgba(255,255,255,.4)", "right", "ltr");
  } else {
    T(c, "أسعار مباشرة من السوق  •  تحديث يومي", W / 2, ky + 82, `600 30px ${AR}`, "rgba(255,255,255,.85)");
    T(c, "تحويل سريع وآمن خلال دقائق", W / 2, ky + 128, `500 26px ${AR}`, "rgba(255,255,255,.5)");
  }
  if (p.updatedCaption) T(c, p.updatedCaption, W / 2, 1194, `500 22px ${AR}`, "rgba(255,255,255,.45)");

  // CTA bar
  const by = 1212, bh = 112;
  c.save(); c.shadowColor = "rgba(254,82,0,.6)"; c.shadowBlur = 40;
  const cg = c.createLinearGradient(x, 0, x + w, 0); cg.addColorStop(0, "#C43F00"); cg.addColorStop(0.55, OR); cg.addColorStop(1, OR_HOT);
  rr(c, x, by, w, bh, 36); c.fillStyle = cg; c.fill(); c.restore();
  rr(c, x + 16, by + 12, 88, 88, 18); c.fillStyle = "#fff"; c.fill();
  c.drawImage(code, x + 22, by + 18, 76, 76);
  T(c, "حوّل فلوسك الآن مع FlyRate", R + 10, by + 52, `700 36px ${AR}`, "#fff", "right");
  T(c, SITE, R + 10, by + 92, `600 26px ${MONO}`, "rgba(255,255,255,.88)", "right", "ltr");
  return blob(cv);
}

/* ============ 2 — Boarding pass ============ */
async function styleTicket(p: P) {
  await fonts(); const logo = await img("/logo-icon.png"); const code = await qr(`https://${SITE}`, "#1C1917", "#FFF8F1");
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d")!;
  const pts = series(p);
  const INK = "#1C1917", MUTE = "#8A7F76", PAPER = "#FFF8F1";

  // orange sky
  const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#FF8A3D"); bg.addColorStop(0.5, OR); bg.addColorStop(1, "#B23A00");
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  glow(c, W * 0.8, 120, 500, "rgba(255,220,180,ALPHA)", 0.35);
  // flight-path arcs
  c.save(); c.strokeStyle = "rgba(255,255,255,.14)"; c.lineWidth = 3; c.setLineDash([2, 14]); c.lineCap = "round";
  for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(W / 2, H + 200, 700 + i * 120, 1100 + i * 90, 0, Math.PI, 2 * Math.PI); c.stroke(); }
  c.restore();

  // header
  c.save(); c.shadowColor = "rgba(0,0,0,.2)"; c.shadowBlur = 20;
  c.beginPath(); c.arc(124, 112, 46, 0, 7); c.fillStyle = "#fff"; c.fill(); c.restore();
  if (logo) { const h = 52, w = (logo.width / logo.height) * h; c.drawImage(logo, 124 - w / 2, 112 - h / 2, w, h); }
  T(c, "FlyRate", 188, 128, `700 48px ${AR}`, "#fff", "left", "ltr");
  T(c, "BOARDING PASS", W - 80, 104, `700 26px ${MONO}`, "rgba(255,255,255,.95)", "right", "ltr");
  T(c, "بطاقة تحويل", W - 80, 142, `500 26px ${AR}`, "rgba(255,255,255,.8)", "right");

  // ticket
  const x = 60, y = 200, w = W - 120, h = 1090, cut = 900; // perforation line at y+cut
  c.save(); c.shadowColor = "rgba(60,20,0,.35)"; c.shadowBlur = 60; c.shadowOffsetY = 24;
  rr(c, x, y, w, h, 40); c.fillStyle = PAPER; c.fill(); c.restore();
  // notches
  c.save(); c.globalCompositeOperation = "destination-out";
  c.beginPath(); c.arc(x, y + cut, 34, 0, 7); c.arc(x + w, y + cut, 34, 0, 7); c.fill(); c.restore();
  c.save(); c.globalCompositeOperation = "destination-over"; c.fillStyle = bg; c.fillRect(0, 0, W, H); c.restore();
  c.save(); c.setLineDash([14, 12]); c.strokeStyle = "#E7D9CC"; c.lineWidth = 3;
  c.beginPath(); c.moveTo(x + 50, y + cut); c.lineTo(x + w - 50, y + cut); c.stroke(); c.restore();
  const L = x + 60, R = x + w - 60;

  // FROM / TO like airport codes (LTR, sender on the left)
  T(c, "FROM · من", L, y + 80, `600 24px ${MONO}`, MUTE, "left", "ltr");
  T(c, "TO · إلى", R, y + 80, `600 24px ${MONO}`, MUTE, "right", "ltr");
  T(c, p.fromCode, L, y + 196, `700 112px ${MONO}`, INK, "left", "ltr");
  T(c, p.toCode, R, y + 196, `700 112px ${MONO}`, INK, "right", "ltr");
  flag(c, p.fromFlag, L + 30, y + 248, 46);
  flag(c, p.toFlag, R - 30, y + 248, 46);
  // dotted arc + plane
  const ax0 = L + width(c, p.fromCode, `700 112px ${MONO}`) + 30, ax1 = R - width(c, p.toCode, `700 112px ${MONO}`) - 30, am = (ax0 + ax1) / 2;
  c.save(); c.setLineDash([3, 12]); c.lineCap = "round"; c.strokeStyle = OR; c.lineWidth = 4;
  c.beginPath(); c.moveTo(ax0, y + 170); c.quadraticCurveTo(am, y + 60, ax1, y + 170); c.stroke(); c.restore();
  c.beginPath(); c.arc(am, y + 116, 34, 0, 7); c.fillStyle = OR; c.fill();
  c.save(); c.translate(am, y + 116); c.rotate(Math.PI / 4); flag(c, "✈️", 0, 0, 34); c.restore();

  c.fillStyle = "#EFE3D7"; c.fillRect(L, y + 300, R - L, 2);

  // fields
  const field = (label: string, value: string, fx: number, fy: number, align: CanvasTextAlign, vfont: string, col = INK) => {
    T(c, label, fx, fy, `500 24px ${AR}`, MUTE, align, align === "right" ? "rtl" : "ltr");
    T(c, value, fx, fy + 52, vfont, col, align, "ltr");
  };
  // received — the hero
  T(c, "المستلم يستلم", R, y + 358, `600 28px ${AR}`, OR, "right");
  let s = fit(c, `${p.amountReceived} ${p.toCode}`, (z) => `700 ${z}px ${MONO}`, 112, 50, R - L);
  T(c, p.amountReceived, R, y + 470, `700 ${s}px ${MONO}`, OR, "right", "ltr");
  T(c, p.toCode, R - width(c, p.amountReceived, `700 ${s}px ${MONO}`) - 20, y + 470, `700 44px ${MONO}`, OR_HOT, "right", "ltr");

  s = fit(c, `${p.amountSent} ${p.fromCode}`, (z) => `700 ${z}px ${MONO}`, 44, 26, (R - L) / 2 - 20);
  field("المبلغ المُرسَل", `${p.amountSent} ${p.fromCode}`, R, y + 548, "right", `700 ${s}px ${MONO}`);
  field("DATE · التاريخ", todayLabel(), L, y + 548, "left", `700 40px ${MONO}`);
  c.fillStyle = "#EFE3D7"; c.fillRect(L, y + 636, R - L, 2);
  s = fit(c, p.rateLine, (z) => `700 ${z}px ${MONO}`, 40, 24, (R - L) * 0.62);
  field("سعر الصرف", p.rateLine, R, y + 690, "right", `700 ${s}px ${MONO}`);
  if (p.trendLabel) {
    const col = trendCol(p.trendColor), tw = width(c, p.trendLabel, `700 26px ${AR}`) + 40;
    T(c, "STATUS · الحالة", L, y + 690, `500 24px ${MONO}`, MUTE, "left", "ltr");
    rr(c, L, y + 708, tw, 48, 24); c.fillStyle = col + "22"; c.fill();
    T(c, p.trendLabel, L + tw / 2, y + 742, `700 26px ${AR}`, col);
  }
  // mini chart strip
  if (pts.length >= 2) {
    const ch = changePct(pts)!;
    T(c, "آخر 30 يوم", R, y + 800, `500 22px ${AR}`, MUTE, "right");
    T(c, `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}%`, L, y + 800, `700 22px ${MONO}`, OR, "left", "ltr");
    chart(c, pts, L, y + 812, R - L, 66, { line: OR, fillTop: "rgba(254,82,0,.22)", dot: OR, dotRing: "rgba(254,82,0,.2)", lw: 4 });
  } else if (p.updatedCaption) {
    T(c, p.updatedCaption, W / 2, y + 830, `500 24px ${AR}`, MUTE);
  }

  // stub
  const sy = y + cut;
  c.drawImage(code, L, sy + 34, 140, 140);
  T(c, "حوّل فلوسك على FlyRate", R, sy + 80, `700 38px ${AR}`, INK, "right");
  T(c, "امسح الكود واحسب تحويلك", R, sy + 122, `500 24px ${AR}`, MUTE, "right");
  T(c, SITE, R, sy + 164, `700 28px ${MONO}`, OR, "right", "ltr");
  // barcode decoration
  const titleW = Math.max(width(c, "حوّل فلوسك على FlyRate", `700 38px ${AR}`), width(c, SITE, `700 28px ${MONO}`));
  let bx = L + 170; const bEnd = R - titleW - 30; c.fillStyle = "#D9CBBE";
  for (let i = 0; bx + 8 < bEnd; i++) { const lw = [3, 6, 2, 8, 4][i % 5]; c.fillRect(bx, sy + 60, lw, 110); bx += lw + 5; }
  return blob(cv);
}

/* ============ 3 — Aurora (soft light) ============ */
async function styleAurora(p: P) {
  await fonts(); const logo = await img("/logo-icon.png"); const code = await qr(`https://${SITE}`, "#fff", "#1C1917");
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d")!;
  const pts = series(p);
  const INK = "#1C1917", MUTE = "#857C74";

  c.fillStyle = "#FFF6EE"; c.fillRect(0, 0, W, H);
  glow(c, 120, 140, 620, "rgba(255,138,61,ALPHA)", 0.45);
  glow(c, W - 60, 520, 560, "rgba(255,186,120,ALPHA)", 0.45);
  glow(c, W / 2, H - 120, 620, "rgba(254,82,0,ALPHA)", 0.18);

  // header row
  c.save(); c.shadowColor = "rgba(120,50,0,.15)"; c.shadowBlur = 24; c.shadowOffsetY = 8;
  rr(c, 70, 70, 96, 96, 28); c.fillStyle = "#fff"; c.fill(); c.restore();
  if (logo) { const h = 56, w = (logo.width / logo.height) * h; c.drawImage(logo, 118 - w / 2, 118 - h / 2, w, h); }
  T(c, "FlyRate", 188, 112, `700 44px ${AR}`, INK, "left", "ltr");
  T(c, todayLabel(), 188, 150, `500 24px ${MONO}`, MUTE, "left", "ltr");
  const pill = "عرض سعر تحويل", pw = width(c, pill, `600 26px ${AR}`) + 48;
  rr(c, W - 70 - pw, 92, pw, 52, 26); c.fillStyle = "rgba(254,82,0,.12)"; c.fill();
  T(c, pill, W - 70 - pw / 2, 127, `600 26px ${AR}`, OR);

  // corridor chips
  const chip = (cx: number, f: string, code: string) => {
    const cw = 230;
    c.save(); c.shadowColor = "rgba(120,50,0,.12)"; c.shadowBlur = 20; c.shadowOffsetY = 6;
    rr(c, cx - cw / 2, 222, cw, 84, 42); c.fillStyle = "#fff"; c.fill(); c.restore();
    flag(c, f, cx - 56, 265, 44);
    T(c, code, cx + 26, 280, `700 38px ${MONO}`, INK, "center", "ltr");
  };
  chip(W - 70 - 115, p.fromFlag, p.fromCode); chip(70 + 115, p.toFlag, p.toCode);
  c.save(); c.setLineDash([3, 12]); c.lineCap = "round"; c.strokeStyle = "rgba(254,82,0,.6)"; c.lineWidth = 4;
  c.beginPath(); c.moveTo(310, 264); c.lineTo(W - 310, 264); c.stroke(); c.restore();
  c.beginPath(); c.arc(W / 2, 264, 32, 0, 7); c.fillStyle = OR; c.fill();
  arrow(c, W / 2, 264, "left", 28, "#fff", 4.5);

  // hero card
  const x = 60, y = 350, w = W - 120, h = 560;
  c.save(); c.shadowColor = "rgba(120,50,0,.16)"; c.shadowBlur = 70; c.shadowOffsetY = 26;
  rr(c, x, y, w, h, 48); c.fillStyle = "rgba(255,255,255,.88)"; c.fill(); c.restore();
  rr(c, x, y, w, h, 48); c.strokeStyle = "#fff"; c.lineWidth = 3; c.stroke();
  const L = x + 60, R = x + w - 60;

  T(c, "المستلم يستلم", W / 2, y + 86, `600 32px ${AR}`, MUTE);
  let s = fit(c, p.amountReceived, (z) => `800 ${z}px ${MONO}`, 150, 56, w - 120);
  const hg = c.createLinearGradient(L, 0, R, 0); hg.addColorStop(0, "#C43F00"); hg.addColorStop(0.5, OR); hg.addColorStop(1, OR_HOT);
  T(c, p.amountReceived, W / 2, y + 86 + 30 + s * 0.78, `700 ${s}px ${MONO}`, hg, "center", "ltr");
  T(c, p.toCode, W / 2, y + 86 + 30 + s * 0.78 + 58, `700 40px ${MONO}`, INK, "center", "ltr");

  c.fillStyle = "#F1E7DE"; c.fillRect(L, y + 360, R - L, 2);
  T(c, "مقابل", R, y + 420, `500 26px ${AR}`, MUTE, "right");
  s = fit(c, `${p.amountSent} ${p.fromCode}`, (z) => `700 ${z}px ${MONO}`, 44, 24, (R - L) / 2 - 30);
  T(c, `${p.amountSent} ${p.fromCode}`, R, y + 476, `700 ${s}px ${MONO}`, INK, "right", "ltr");
  T(c, "سعر الصرف", L, y + 420, `500 26px ${AR}`, MUTE, "left", "rtl");
  s = fit(c, p.rateLine, (z) => `700 ${z}px ${MONO}`, 34, 20, (R - L) / 2 - 30);
  T(c, p.rateLine, L, y + 476, `700 ${s}px ${MONO}`, INK, "left", "ltr");
  if (p.trendLabel) {
    const col = trendCol(p.trendColor);
    T(c, p.trendLabel, L, y + 520, `700 24px ${AR}`, col, "left", "rtl");
  }

  // chart
  const ky = 950;
  if (pts.length >= 2) {
    const ch = changePct(pts)!;
    T(c, "حركة السعر — آخر 30 يوم", R + 10, ky, `600 28px ${AR}`, INK, "right");
    T(c, `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}%`, L - 10, ky, `700 28px ${MONO}`, OR, "left", "ltr");
    chart(c, pts, x + 10, ky + 24, w - 20, 130, { line: OR, fillTop: "rgba(254,82,0,.25)", grid: "rgba(28,25,23,.08)", dot: OR, dotRing: "rgba(254,82,0,.2)" });
  } else if (p.updatedCaption) {
    T(c, p.updatedCaption, W / 2, ky + 60, `500 26px ${AR}`, MUTE);
  }

  // CTA — dark bar
  const by = 1196, bh = 118;
  c.save(); c.shadowColor = "rgba(28,25,23,.3)"; c.shadowBlur = 30; c.shadowOffsetY = 12;
  rr(c, x, by, w, bh, 40); c.fillStyle = INK; c.fill(); c.restore();
  c.drawImage(code, x + 20, by + 14, 90, 90);
  T(c, "حوّل فلوسك الآن مع FlyRate", R + 10, by + 54, `700 36px ${AR}`, "#fff", "right");
  T(c, SITE, R + 10, by + 94, `600 26px ${MONO}`, OR_HOT, "right", "ltr");
  return blob(cv);
}

const STYLES: Record<ShareStyle, (p: P) => Promise<Blob>> = {
  midnight: styleMidnight,
  ticket: styleTicket,
  aurora: styleAurora,
};
const ORDER: ShareStyle[] = ["midnight", "ticket", "aurora"];
const STYLE_KEY = "flyrate:share-style";
let memoryIndex = Math.floor(Math.random() * ORDER.length);

/** Next style in rotation, remembered per browser when storage is available. */
function nextStyle(): ShareStyle {
  if (SHARE_STYLE !== "rotate") return SHARE_STYLE;
  try {
    const last = parseInt(localStorage.getItem(STYLE_KEY) ?? "", 10);
    const next = Number.isNaN(last) ? memoryIndex : (last + 1) % ORDER.length;
    localStorage.setItem(STYLE_KEY, String(next));
    return ORDER[next];
  } catch {
    memoryIndex = (memoryIndex + 1) % ORDER.length;
    return ORDER[memoryIndex];
  }
}

export async function createShareCardBlob(params: ShareCardParams, style?: ShareStyle): Promise<Blob | null> {
  try {
    return await STYLES[style ?? nextStyle()](params);
  } catch {
    return null;
  }
}
