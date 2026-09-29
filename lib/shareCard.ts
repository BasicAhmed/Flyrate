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
  history?: ShareCardHistoryPoint[]; // last ~30 days, oldest first — same data as the in-app chart
}

// 4:5 portrait — sits well in WhatsApp chats, Status and the Instagram feed.
const W = 1080;
const H = 1350;
const M = 64; // outer margin
const PAD = 52; // inner padding of the glass panels
const SITE = "flyrate.exchange";

const C = {
  bg: "#09090A",
  ink: "#F7F5F2",
  muted: "#A3A3A8",
  subtle: "#6F6F75",
  glass: "rgba(255,255,255,0.045)",
  glassStrong: "rgba(255,255,255,0.065)",
  line: "rgba(255,255,255,0.08)",
  primary: "#FE5200",
  hot: "#FF8A3D",
  amber: "#FFB36B",
  deep: "#C43F00",
  emerald: "#10B981",
  red: "#EF4444",
};

const AR = "'IBM Plex Sans Arabic', 'Noto Sans Arabic', sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";

async function loadFonts() {
  const specs = [
    `500 26px ${AR}`,
    `600 30px ${AR}`,
    `700 38px ${AR}`,
    `500 26px ${MONO}`,
    `600 34px ${MONO}`,
    `700 96px ${MONO}`,
  ];
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s, "0123456789 SDG تحويل")));
    await document.fonts.ready;
  } catch {
    // fonts API not fully supported — canvas falls back to system fonts
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* ---------------- primitives ---------------- */

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function trendHex(t: ShareCardParams["trendColor"]) {
  return t === "good" ? C.emerald : t === "bad" ? C.red : C.primary;
}

function brandGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, C.amber);
  g.addColorStop(0.45, C.hot);
  g.addColorStop(1, C.primary);
  return g;
}

function setFont(ctx: CanvasRenderingContext2D, font: string, dir: CanvasDirection = "rtl") {
  ctx.font = font;
  ctx.direction = dir;
}

function textWidth(ctx: CanvasRenderingContext2D, s: string, font: string) {
  ctx.font = font;
  return ctx.measureText(s).width;
}

/** Largest size (step 2px) at which `s` fits in maxWidth. */
function fitSize(
  ctx: CanvasRenderingContext2D,
  s: string,
  fontFor: (size: number) => string,
  start: number,
  min: number,
  maxWidth: number
) {
  let size = start;
  while (size > min && textWidth(ctx, s, fontFor(size)) > maxWidth) size -= 2;
  return size;
}

/** Frosted panel: translucent fill, soft drop shadow, hairline border with a
 *  warm highlight along the top edge. */
function glassPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, strong = false) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = "rgba(18,18,20,0.92)";
  ctx.fill();
  ctx.restore();

  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = strong ? C.glassStrong : C.glass;
  ctx.fill();
  const border = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  border.addColorStop(0, hexA(C.primary, strong ? 0.55 : 0.28));
  border.addColorStop(0.35, "rgba(255,255,255,0.08)");
  border.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/* ---------------- sections ---------------- */

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Warm blooms — top right strong, bottom left faint
  const blooms: [number, number, number, number][] = [
    [W * 0.82, 120, 620, 0.32],
    [W * 0.12, H * 0.62, 520, 0.12],
    [W * 0.5, H + 80, 560, 0.18],
  ];
  for (const [x, y, r, a] of blooms) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(C.primary, a));
    g.addColorStop(1, hexA(C.primary, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Soft diagonal light sweep
  ctx.save();
  ctx.globalAlpha = 0.05;
  const sweep = ctx.createLinearGradient(0, 0, W, H);
  sweep.addColorStop(0.3, "rgba(255,255,255,0)");
  sweep.addColorStop(0.5, "rgba(255,255,255,1)");
  sweep.addColorStop(0.7, "rgba(255,255,255,0)");
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Fine grain (deterministic so every card looks identical)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let i = 0; i < 2600; i++) ctx.fillRect(rnd() * W, rnd() * H, 1.4, 1.4);
}

function drawHeader(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null) {
  const cx = W / 2;
  const cy = 106;
  const r = 46;

  // Halo
  const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.4);
  halo.addColorStop(0, hexA(C.primary, 0.35));
  halo.addColorStop(1, hexA(C.primary, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // Badge
  ctx.save();
  ctx.shadowColor = hexA(C.primary, 0.5);
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#141416";
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = brandGradient(ctx, cx - r, cy - r, cx + r, cy + r);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (logo) {
    const lh = 54;
    const lw = (logo.width / logo.height) * lh;
    ctx.drawImage(logo, cx - lw / 2, cy - lh / 2, lw, lh);
  }

  // Wordmark
  const font = `700 38px ${AR}`;
  setFont(ctx, font, "ltr");
  const fly = ctx.measureText("Fly").width;
  const rate = ctx.measureText("Rate").width;
  const x0 = cx - (fly + rate) / 2;
  const y = cy + r + 46;
  ctx.textAlign = "left";
  ctx.fillStyle = C.ink;
  ctx.fillText("Fly", x0, y);
  ctx.fillStyle = brandGradient(ctx, x0 + fly, y - 30, x0 + fly + rate, y);
  ctx.fillText("Rate", x0 + fly, y);
}

function drawFlagBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, flag: string) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "ltr";
  ctx.font = `${Math.round(r * 1.05)}px ${EMOJI}`;
  ctx.fillStyle = C.ink;
  ctx.fillText(flag, cx, cy + 2);
  ctx.restore();
}

/** Currency chip anchored at its RIGHT edge (RTL layout). Returns its width. */
function drawCurrencyChip(ctx: CanvasRenderingContext2D, right: number, cy: number, flag: string, code: string) {
  const h = 76;
  const r = 26;
  const codeFont = `600 34px ${MONO}`;
  const codeW = textWidth(ctx, code, codeFont);
  const w = 14 + r * 2 + 14 + codeW + 26;
  const x = right - w;
  rr(ctx, x, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawFlagBadge(ctx, x + 14 + r, cy, r, flag);
  setFont(ctx, codeFont, "ltr");
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.ink;
  ctx.fillText(code, x + 14 + r * 2 + 14, cy + 2);
  ctx.textBaseline = "alphabetic";
  return w;
}

function drawFlowBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const r = 36;
  ctx.save();
  ctx.shadowColor = hexA(C.primary, 0.6);
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = brandGradient(ctx, cx - r, cy - r, cx + r, cy + r);
  ctx.fill();
  ctx.restore();
  // ring that "cuts" the divider line
  ctx.beginPath();
  ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
  ctx.strokeStyle = "#131315";
  ctx.lineWidth = 8;
  ctx.stroke();
  // down arrow
  ctx.strokeStyle = "#1A0A00";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx, cy + 14);
  ctx.moveTo(cx - 12, cy + 3);
  ctx.lineTo(cx, cy + 15);
  ctx.lineTo(cx + 12, cy + 3);
  ctx.stroke();
}

function drawRatePill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rateLine: string,
  trendLabel: string | undefined,
  color: string,
  maxW: number
) {
  const h = 70;
  const rateFont = `600 32px ${MONO}`;
  const trendFont = `600 26px ${AR}`;
  const rateW = textWidth(ctx, rateLine, rateFont);
  const trendW = trendLabel ? textWidth(ctx, trendLabel, trendFont) : 0;
  const content = 18 + 16 + rateW + (trendLabel ? 22 + trendW : 0);
  const w = Math.min(content + 64, maxW);
  const x = cx - w / 2;
  const y = cy - h / 2;

  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = hexA(color, 0.12);
  ctx.fill();
  ctx.strokeStyle = hexA(color, 0.45);
  ctx.lineWidth = 2;
  ctx.stroke();

  let cursor = x + 32;
  // dot with halo
  ctx.beginPath();
  ctx.arc(cursor + 9, cy, 14, 0, Math.PI * 2);
  ctx.fillStyle = hexA(color, 0.22);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cursor + 9, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  cursor += 18 + 16;

  setFont(ctx, rateFont, "ltr");
  ctx.textAlign = "left";
  ctx.fillStyle = color;
  ctx.fillText(rateLine, cursor, cy + 11);
  cursor += rateW + 22;

  if (trendLabel) {
    setFont(ctx, trendFont, "rtl");
    ctx.textAlign = "left";
    ctx.fillText(trendLabel, cursor, cy + 9);
  }
}

/** Smooth area chart (midpoint quadratic curves) with a gradient fill. */
function drawChart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  points: ShareCardHistoryPoint[],
  color: string
) {
  const vals = points.map((p) => p.marketPrice);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pts = points.map((p, i) => ({
    x: x + (i / (points.length - 1)) * w,
    y: y + 8 + (1 - (p.marketPrice - min) / range) * (h - 16),
  }));

  // faint guide lines
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 2; i++) {
    const gy = y + (h / 2) * i;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
    ctx.stroke();
  }

  const trace = () => {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  };

  // area
  ctx.beginPath();
  trace();
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, hexA(color, 0.32));
  fill.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = fill;
  ctx.fill();

  // line
  ctx.save();
  ctx.shadowColor = hexA(color, 0.6);
  ctx.shadowBlur = 14;
  ctx.beginPath();
  trace();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();

  // end point
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 15, 0, Math.PI * 2);
  ctx.fillStyle = hexA(color, 0.22);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(last.x, last.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();
}

async function createQrCanvas(text: string, size: number): Promise<HTMLCanvasElement | null> {
  try {
    const mod = await import("qrcode-generator");
    const qrcode = mod.default;
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const cell = Math.max(1, Math.floor(size / count));
    const canvas = document.createElement("canvas");
    canvas.width = cell * count;
    canvas.height = cell * count;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111113";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) ctx.fillRect(col * cell, row * cell, cell, cell);
      }
    }
    return canvas;
  } catch {
    return null; // QR is a nice-to-have — never block the card on it
  }
}

/* ---------------- main ---------------- */

export async function createShareCardBlob(params: ShareCardParams): Promise<Blob | null> {
  await loadFonts();
  const [logo, qr] = await Promise.all([loadImage("/logo-icon.png"), createQrCanvas(`https://${SITE}`, 420)]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const accent = trendHex(params.trendColor);
  const innerL = M + PAD;
  const innerR = W - M - PAD;
  const innerW = innerR - innerL;

  drawBackground(ctx);
  drawHeader(ctx, logo);

  /* ---- Quote panel ---- */
  const qY = 236;
  const qH = 600;
  glassPanel(ctx, M, qY, W - M * 2, qH, 48, true);

  // Sent row
  setFont(ctx, `500 26px ${AR}`);
  ctx.textAlign = "right";
  ctx.fillStyle = C.muted;
  ctx.fillText("ترسل", innerR, qY + 72);

  const sentCy = qY + 148;
  const chipW1 = drawCurrencyChip(ctx, innerR, sentCy, params.fromFlag, params.fromCode);
  const sentMax = innerW - chipW1 - 30;
  const sentSize = fitSize(ctx, params.amountSent, (s) => `700 ${s}px ${MONO}`, 64, 34, sentMax);
  setFont(ctx, `700 ${sentSize}px ${MONO}`, "ltr");
  ctx.textAlign = "left";
  ctx.fillStyle = C.ink;
  ctx.fillText(params.amountSent, innerL, sentCy + sentSize * 0.36);

  // Divider + flow badge
  const divY = qY + 250;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 10]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(innerL, divY);
  ctx.lineTo(innerR, divY);
  ctx.stroke();
  ctx.setLineDash([]);
  drawFlowBadge(ctx, W / 2, divY);

  // Received row
  setFont(ctx, `500 26px ${AR}`);
  ctx.textAlign = "right";
  ctx.fillStyle = C.muted;
  ctx.fillText("المستلم يستلم", innerR, qY + 330);

  const recvCy = qY + 412;
  const chipW2 = drawCurrencyChip(ctx, innerR, recvCy, params.toFlag, params.toCode);
  const recvMax = innerW - chipW2 - 30;
  const recvSize = fitSize(ctx, params.amountReceived, (s) => `700 ${s}px ${MONO}`, 96, 40, recvMax);
  setFont(ctx, `700 ${recvSize}px ${MONO}`, "ltr");
  const recvW = ctx.measureText(params.amountReceived).width;
  ctx.textAlign = "left";
  ctx.save();
  ctx.shadowColor = hexA(C.primary, 0.45);
  ctx.shadowBlur = 36;
  ctx.fillStyle = brandGradient(ctx, innerL, recvCy - recvSize / 2, innerL + recvW, recvCy + recvSize / 2);
  ctx.fillText(params.amountReceived, innerL, recvCy + recvSize * 0.36);
  ctx.restore();

  // Rate pill, bottom of the panel
  drawRatePill(ctx, W / 2, qY + qH - 68, params.rateLine, params.trendLabel, accent, W - M * 2 - 80);

  /* ---- Trend panel (or highlights when there's no history) ---- */
  const tY = qY + qH + 24;
  const tH = 220;
  glassPanel(ctx, M, tY, W - M * 2, tH, 40);
  const hasHistory = (params.history?.length ?? 0) >= 2;

  if (hasHistory && params.history) {
    setFont(ctx, `600 26px ${AR}`);
    ctx.textAlign = "right";
    ctx.fillStyle = C.ink;
    ctx.fillText("حركة السعر · آخر 30 يوم", innerR, tY + 58);

    const first = params.history[0].date;
    const last = params.history[params.history.length - 1].date;
    setFont(ctx, `500 22px ${MONO}`, "ltr");
    ctx.textAlign = "left";
    ctx.fillStyle = C.subtle;
    ctx.fillText(`${first} → ${last}`, innerL, tY + 56);

    drawChart(ctx, innerL, tY + 86, innerW, tH - 116, params.history, accent);
  } else {
    const items = ["بدون رسوم مخفية", "التحويل في أقل من 30 دقيقة", "دعم فوري في واتساب"];
    const rowH = 56;
    items.forEach((label, i) => {
      const cy = tY + 62 + i * rowH;
      ctx.beginPath();
      ctx.arc(innerR - 16, cy - 8, 16, 0, Math.PI * 2);
      ctx.fillStyle = hexA(C.emerald, 0.16);
      ctx.fill();
      ctx.strokeStyle = C.emerald;
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(innerR - 23, cy - 8);
      ctx.lineTo(innerR - 18, cy - 2);
      ctx.lineTo(innerR - 8, cy - 14);
      ctx.stroke();
      setFont(ctx, `500 28px ${AR}`);
      ctx.textAlign = "right";
      ctx.fillStyle = C.ink;
      ctx.fillText(label, innerR - 48, cy);
    });
  }

  /* ---- Footer: CTA + QR ---- */
  const fY = tY + tH + 24;
  const fH = H - M + 20 - fY; // runs to just above the bottom margin
  glassPanel(ctx, M, fY, W - M * 2, fH, 40);

  const qrSize = fH - 56;
  const qrX = innerL - 12;
  const qrY = fY + 28;
  if (qr) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 20;
    rr(ctx, qrX, qrY, qrSize, qrSize, 20);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();
    const pad = qrSize * 0.08;
    ctx.drawImage(qr, qrX + pad, qrY + pad, qrSize - pad * 2, qrSize - pad * 2);
  }

  setFont(ctx, `700 38px ${AR}`);
  ctx.textAlign = "right";
  ctx.fillStyle = C.ink;
  ctx.fillText("حوّل فلوسك على FlyRate", innerR, fY + 64);
  setFont(ctx, `500 24px ${AR}`);
  ctx.fillStyle = C.muted;
  ctx.fillText(params.updatedCaption ?? "امسح الكود واحسب تحويلك", innerR, fY + 104);

  // site pill
  const siteFont = `600 26px ${MONO}`;
  const siteW = textWidth(ctx, SITE, siteFont) + 48;
  const pillH = 46;
  const pillY = fY + fH - 24 - pillH;
  rr(ctx, innerR - siteW, pillY, siteW, pillH, pillH / 2);
  ctx.fillStyle = brandGradient(ctx, innerR - siteW, pillY, innerR, pillY + pillH);
  ctx.fill();
  setFont(ctx, siteFont, "ltr");
  ctx.textAlign = "center";
  ctx.fillStyle = "#1A0A00";
  ctx.fillText(SITE, innerR - siteW / 2, pillY + pillH / 2 + 9);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.95));
}
