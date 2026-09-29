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
  history?: ShareCardHistoryPoint[]; // accepted for compatibility; not drawn by the current styles
}
type P = ShareCardParams;

/* Two card styles, alternated on every share so the images people post
 * don't all look the same:
 *   A — clean light: orange header band, white quote card
 *   B — bold orange: full-bleed gradient, huge received amount, white sheet
 * Both are 1080×1350 (4:5) — fits WhatsApp Status and the Instagram feed. */

const W = 1080, H = 1350;
const AR = "'IBM Plex Sans Arabic', sans-serif";
const MONO = "'IBM Plex Mono', monospace";
const EMOJI = "'Noto Color Emoji', 'Apple Color Emoji', sans-serif";
const OR = "#FE5200";

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
function fit(c: CanvasRenderingContext2D, t: string, f: (s: number) => string, start: number, min: number, max: number) {
  let s = start; while (s > min) { c.font = f(s); if (c.measureText(t).width <= max) break; s -= 2; } return s;
}
function T(c: CanvasRenderingContext2D, t: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "center", dir: CanvasDirection = "rtl") {
  c.font = font; c.fillStyle = color; c.textAlign = align; c.direction = dir; c.fillText(t, x, y);
}
function flag(c: CanvasRenderingContext2D, f: string, x: number, y: number, size: number) {
  c.save(); c.font = `${size}px ${EMOJI}`; c.textAlign = "center"; c.textBaseline = "middle"; c.direction = "ltr"; c.fillText(f, x, y); c.restore();
}
const trend = (t: P["trendColor"]) => (t === "good" ? "#10B981" : t === "bad" ? "#EF4444" : OR);
async function fonts() { try { await Promise.all([`700 90px ${MONO}`, `700 40px ${AR}`, `500 28px ${AR}`].map((s) => document.fonts.load(s))); } catch {} }
const blob = (cv: HTMLCanvasElement) => new Promise<Blob>((r) => cv.toBlob((b) => r(b!), "image/png"));

/* ============ A — Clean light ============ */
async function styleLight(p: P) {
  await fonts(); const logo = await img("/logo-icon.png"); const code = await qr("https://flyrate.exchange");
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d")!;
  c.fillStyle = "#F4F1EC"; c.fillRect(0, 0, W, H);
  // orange header band with curve
  const g = c.createLinearGradient(0, 0, W, 420); g.addColorStop(0, "#FF7A2E"); g.addColorStop(1, "#E84A00");
  c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, 380); c.quadraticCurveTo(W / 2, 470, 0, 380); c.closePath(); c.fill();
  // logo centered in white circle
  c.save(); c.shadowColor = "rgba(0,0,0,.18)"; c.shadowBlur = 30; c.shadowOffsetY = 10;
  c.beginPath(); c.arc(W / 2, 130, 62, 0, 7); c.fillStyle = "#fff"; c.fill(); c.restore();
  if (logo) { const h = 66, w = logo.width / logo.height * h; c.drawImage(logo, W / 2 - w / 2, 130 - h / 2, w, h); }
  T(c, "FlyRate", W / 2, 250, `700 44px ${AR}`, "#fff", "center", "ltr");
  T(c, "عرض سعر تحويل", W / 2, 300, `500 28px ${AR}`, "rgba(255,255,255,.85)");
  // white card
  const x = 80, y = 350, w = W - 160, h = 690;
  c.save(); c.shadowColor = "rgba(60,30,10,.18)"; c.shadowBlur = 60; c.shadowOffsetY = 24; rr(c, x, y, w, h, 44); c.fillStyle = "#fff"; c.fill(); c.restore();
  const L = x + 60, R = x + w - 60;
  T(c, "ترسل", R, y + 90, `500 28px ${AR}`, "#8A8580", "right");
  flag(c, p.fromFlag, L + 26, y + 80, 44); T(c, p.fromCode, L + 62, y + 94, `600 32px ${MONO}`, "#1C1917", "left", "ltr");
  let s = fit(c, p.amountSent, (z) => `700 ${z}px ${MONO}`, 72, 36, w - 120);
  T(c, p.amountSent, R, y + 190, `700 ${s}px ${MONO}`, "#1C1917", "right", "ltr");
  c.strokeStyle = "#EDE8E2"; c.lineWidth = 2; c.beginPath(); c.moveTo(L, y + 250); c.lineTo(R, y + 250); c.stroke();
  c.beginPath(); c.arc(W / 2, y + 250, 34, 0, 7); c.fillStyle = OR; c.fill();
  c.strokeStyle = "#fff"; c.lineWidth = 5; c.lineCap = "round"; c.beginPath(); c.moveTo(W / 2, y + 236); c.lineTo(W / 2, y + 264); c.moveTo(W / 2 - 11, y + 254); c.lineTo(W / 2, y + 265); c.lineTo(W / 2 + 11, y + 254); c.stroke();
  T(c, "المستلم يستلم", R, y + 340, `500 28px ${AR}`, "#8A8580", "right");
  flag(c, p.toFlag, L + 26, y + 330, 44); T(c, p.toCode, L + 62, y + 344, `600 32px ${MONO}`, "#1C1917", "left", "ltr");
  s = fit(c, p.amountReceived, (z) => `700 ${z}px ${MONO}`, 104, 40, w - 120);
  T(c, p.amountReceived, R, y + 460, `700 ${s}px ${MONO}`, OR, "right", "ltr");
  // rate row
  rr(c, L, y + 520, R - L, 110, 26); c.fillStyle = "#F7F4F0"; c.fill();
  T(c, "سعر الصرف", R - 30, y + 565, `500 24px ${AR}`, "#8A8580", "right");
  T(c, p.rateLine, R - 30, y + 606, `700 32px ${MONO}`, "#1C1917", "right", "ltr");
  if (p.trendLabel) { const col = trend(p.trendColor); rr(c, L + 24, y + 552, 170, 46, 23); c.fillStyle = col + "22"; c.fill(); T(c, p.trendLabel, L + 109, y + 584, `600 24px ${AR}`, col); }
  // footer
  c.drawImage(code, 80, 1090, 170, 170);
  T(c, "حوّل فلوسك على FlyRate", R + 60 - 60, 1150, `700 40px ${AR}`, "#1C1917", "right");
  T(c, p.updatedCaption ?? "امسح الكود واحسب تحويلك", R, 1200, `500 26px ${AR}`, "#8A8580", "right");
  T(c, "flyrate.exchange", R, 1250, `600 28px ${MONO}`, OR, "right", "ltr");
  return blob(cv);
}

/* ============ B — Bold orange ============ */
async function styleBold(p: P) {
  await fonts(); const logo = await img("/logo-icon.png"); const code = await qr("https://flyrate.exchange", "#1A0800");
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const c = cv.getContext("2d")!;
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#FF8A3D"); g.addColorStop(0.5, "#FE5200"); g.addColorStop(1, "#C43F00");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // big decorative rings
  c.strokeStyle = "rgba(255,255,255,.10)"; c.lineWidth = 60; c.beginPath(); c.arc(W + 60, -40, 380, 0, 7); c.stroke();
  c.lineWidth = 40; c.beginPath(); c.arc(-80, H - 160, 300, 0, 7); c.stroke();
  // logo pill centered
  c.save(); c.shadowColor = "rgba(0,0,0,.2)"; c.shadowBlur = 24; rr(c, W / 2 - 150, 70, 300, 96, 48); c.fillStyle = "#fff"; c.fill(); c.restore();
  if (logo) { const h = 58, w = logo.width / logo.height * h; c.drawImage(logo, W / 2 - 130, 118 - h / 2, w, h); }
  T(c, "FlyRate", W / 2 + 40, 134, `700 42px ${AR}`, "#1C1917", "center", "ltr");
  // headline
  T(c, "المستلم يستلم", W / 2, 300, `600 36px ${AR}`, "rgba(255,255,255,.85)");
  let s = fit(c, p.amountReceived, (z) => `700 ${z}px ${MONO}`, 150, 60, W - 140);
  c.save(); c.shadowColor = "rgba(0,0,0,.18)"; c.shadowBlur = 20; c.shadowOffsetY = 8;
  T(c, p.amountReceived, W / 2, 300 + 40 + s * 0.8, `700 ${s}px ${MONO}`, "#fff", "center", "ltr"); c.restore();
  // to chip
  const chipY = 560; rr(c, W / 2 - 110, chipY, 220, 76, 38); c.fillStyle = "rgba(255,255,255,.2)"; c.fill();
  flag(c, p.toFlag, W / 2 - 50, chipY + 38, 40); T(c, p.toCode, W / 2 + 30, chipY + 50, `700 34px ${MONO}`, "#fff", "center", "ltr");
  // white bottom sheet
  const y = 700; c.save(); c.shadowColor = "rgba(0,0,0,.25)"; c.shadowBlur = 50; rr(c, 60, y, W - 120, 590, 48); c.fillStyle = "#fff"; c.fill(); c.restore();
  const L = 120, R = W - 120;
  T(c, "مقابل", R, y + 80, `500 28px ${AR}`, "#8A8580", "right");
  s = fit(c, `${p.amountSent} ${p.fromCode}`, (z) => `700 ${z}px ${MONO}`, 60, 32, 560);
  T(c, `${p.amountSent} ${p.fromCode}`, R, y + 150, `700 ${s}px ${MONO}`, "#1C1917", "right", "ltr");
  flag(c, p.fromFlag, L + 34, y + 120, 60);
  c.strokeStyle = "#EFEAE4"; c.lineWidth = 2; c.beginPath(); c.moveTo(L, y + 200); c.lineTo(R, y + 200); c.stroke();
  T(c, "السعر", R, y + 260, `500 26px ${AR}`, "#8A8580", "right");
  T(c, p.rateLine, R, y + 312, `700 36px ${MONO}`, "#1C1917", "right", "ltr");
  if (p.trendLabel) T(c, p.trendLabel, L, y + 312, `700 28px ${AR}`, trend(p.trendColor), "left");
  c.drawImage(code, L, y + 370, 160, 160);
  T(c, "حوّل فلوسك على FlyRate", R, y + 430, `700 36px ${AR}`, "#1C1917", "right");
  T(c, p.updatedCaption ?? "امسح الكود واحسب تحويلك", R, y + 476, `500 24px ${AR}`, "#8A8580", "right");
  T(c, "flyrate.exchange", R, y + 522, `700 28px ${MONO}`, OR, "right", "ltr");
  return blob(cv);
}

const STYLES = [styleLight, styleBold];
const STYLE_KEY = "flyrate:share-style";
let memoryIndex = Math.floor(Math.random() * STYLES.length);

/** Picks the next style in rotation. Remembered per browser when storage is
 *  available, so the same person gets a different look each time. */
function nextStyleIndex(): number {
  try {
    const last = parseInt(localStorage.getItem(STYLE_KEY) ?? "", 10);
    const next = Number.isNaN(last) ? memoryIndex : (last + 1) % STYLES.length;
    localStorage.setItem(STYLE_KEY, String(next));
    return next;
  } catch {
    memoryIndex = (memoryIndex + 1) % STYLES.length;
    return memoryIndex;
  }
}

export async function createShareCardBlob(params: ShareCardParams): Promise<Blob | null> {
  try {
    return await STYLES[nextStyleIndex()](params);
  } catch {
    return null;
  }
}
