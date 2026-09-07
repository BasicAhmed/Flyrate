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

const WIDTH = 1000;

const COLORS = {
  bg: "#0A0A0B",
  surface: "#141416",
  surface2: "#1C1C1F",
  ink: "#F5F4F1",
  muted: "#9A9A9E",
  subtle: "#6E6E73",
  border: "rgba(255,255,255,0.09)",
  primary: "#FE5200",
  emerald: "#10B981",
  red: "#EF4444",
};

async function loadFonts() {
  const specs = [
    "700 44px 'IBM Plex Sans Arabic'",
    "600 42px 'IBM Plex Sans Arabic'",
    "600 34px 'IBM Plex Sans Arabic'",
    "500 30px 'IBM Plex Sans Arabic'",
    "500 26px 'IBM Plex Sans Arabic'",
    "700 90px 'IBM Plex Mono'",
    "600 40px 'IBM Plex Mono'",
    "600 34px 'IBM Plex Mono'",
  ];
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s)));
    await document.fonts.ready;
  } catch {
    // fonts API not fully supported — canvas will fall back to system fonts
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrinks the font size (keeping weight/family) until `text` fits within
 *  maxWidth — protects large SDG amounts (hundreds of thousands) from
 *  overflowing the card. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  startSize: number,
  minSize: number,
  maxWidth: number
): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px '${family}', monospace`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

function trendColorHex(trend: ShareCardParams["trendColor"]) {
  if (trend === "good") return COLORS.emerald;
  if (trend === "bad") return COLORS.red;
  return COLORS.primary;
}

/** Small pill: flag in a circular badge + currency code, e.g. used for both
 *  sides of the corridor header. Returns the pill's total width so callers
 *  can lay out a pair of these side by side. */
function drawCurrencyChip(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y: number,
  flag: string,
  code: string
): number {
  ctx.font = "600 34px 'IBM Plex Mono', monospace";
  const codeWidth = ctx.measureText(code).width;
  const chipHeight = 68;
  const circleR = 26;
  const gap = 14;
  const paddingX = 24;
  const chipWidth = circleR * 2 + gap + codeWidth + paddingX * 2;
  const x = centerX - chipWidth / 2;

  ctx.fillStyle = COLORS.surface2;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, chipWidth, chipHeight, chipHeight / 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = COLORS.bg;
  ctx.arc(x + paddingX + circleR, y + chipHeight / 2, circleR, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "30px sans-serif";
  ctx.fillText(flag, x + paddingX + circleR, y + chipHeight / 2 + 2);

  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.font = "600 34px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(code, x + paddingX + circleR * 2 + gap, y + chipHeight / 2 + 2);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  return chipWidth;
}

/** Subtle repeating dot texture so the background isn't perfectly flat. */
function drawTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  const spacing = 34;
  for (let y = spacing; y < height; y += spacing) {
    for (let x = spacing; x < width; x += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Compact line chart of recent market-price history, same data source as
 *  the in-app RateHistoryChart. */
function drawSparkline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  points: ShareCardHistoryPoint[],
  color: string
) {
  const values = points.map((p) => p.marketPrice);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = points.map((p, i) => ({
    x: x + (i / (points.length - 1)) * w,
    y: y + (1 - (p.marketPrice - min) / range) * h,
  }));

  ctx.beginPath();
  coords.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.stroke();

  const last = coords[coords.length - 1];
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

async function createQrCanvas(text: string, size: number): Promise<HTMLCanvasElement | null> {
  try {
    const mod = await import("qrcode-generator");
    const qrcode = mod.default;
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const cellSize = Math.max(1, Math.floor(size / count));
    const canvas = document.createElement("canvas");
    canvas.width = cellSize * count;
    canvas.height = cellSize * count;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0A0A0B";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }
    return canvas;
  } catch {
    return null; // QR is a nice-to-have — never block the card on it
  }
}

export async function createShareCardBlob(params: ShareCardParams): Promise<Blob | null> {
  await loadFonts();
  const [logo, qrCanvas] = await Promise.all([
    loadImage("/logo-icon.png"),
    createQrCanvas("https://flyrate.exchange", 480),
  ]);

  const hasHistory = (params.history?.length ?? 0) >= 2;

  // Layout is computed top-down so every section's position depends on the
  // one before it — no fixed "HEIGHT minus a guess" offsets that can leave
  // dead space or clip content.
  const panelY = 330;
  const panelX = 90;
  const panelW = WIDTH - 180;
  const sparklineTop = panelY + 300;
  const sparklineH = 70;
  const pillHeight = 62;
  const pillY = panelY + 300 + sparklineH + 24;
  const panelH = pillY + pillHeight + 34 - panelY;
  const panelBottom = panelY + panelH;
  const captionY = panelBottom + 56;
  const qrY = captionY + 40;
  const qrSize = 150;
  const qrLabelY = qrY + qrSize + 34;
  const dividerY = qrLabelY + 36;
  const ctaTop = dividerY + 40;
  const ctaHeight = 100;
  const HEIGHT = ctaTop + ctaHeight + 100;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const pillColor = trendColorHex(params.trendColor);

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Soft orange glow, top of card
  const glow = ctx.createRadialGradient(WIDTH / 2, 220, 40, WIDTH / 2, 220, 560);
  glow.addColorStop(0, "rgba(254,82,0,0.24)");
  glow.addColorStop(1, "rgba(254,82,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawTexture(ctx, WIDTH, HEIGHT);

  // Outer frame
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 22, 22, WIDTH - 44, HEIGHT - 44, 44);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Logo + wordmark lockup
  const logoH = 46;
  const logoW = logo ? (logo.width / logo.height) * logoH : 0;
  ctx.direction = "ltr";
  ctx.font = "700 44px 'IBM Plex Sans Arabic', sans-serif";
  const flyWidth = ctx.measureText("Fly").width;
  const rateWidth = ctx.measureText("Rate").width;
  const lockupWidth = logoW + (logo ? 14 : 0) + flyWidth + rateWidth;
  let cursorX = WIDTH / 2 - lockupWidth / 2;
  const wordmarkY = 128;

  if (logo) {
    ctx.drawImage(logo, cursorX, wordmarkY - logoH + 8, logoW, logoH);
    cursorX += logoW + 14;
  }
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.ink;
  ctx.fillText("Fly", cursorX, wordmarkY);
  ctx.fillStyle = COLORS.primary;
  ctx.fillText("Rate", cursorX + flyWidth, wordmarkY);
  ctx.textAlign = "center";

  // Thin accent divider under the logo
  ctx.strokeStyle = COLORS.primary;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 44, 162);
  ctx.lineTo(WIDTH / 2 + 44, 162);
  ctx.stroke();

  // Currency chips with an arrow between them
  const chipY = 210;
  const chipCenterGap = 210;
  drawCurrencyChip(ctx, WIDTH / 2 - chipCenterGap, chipY, params.fromFlag, params.fromCode);
  drawCurrencyChip(ctx, WIDTH / 2 + chipCenterGap, chipY, params.toFlag, params.toCode);
  ctx.textAlign = "center";

  ctx.fillStyle = COLORS.muted;
  ctx.font = "600 30px 'IBM Plex Sans Arabic', sans-serif";
  ctx.fillText("⇄", WIDTH / 2, chipY + 44);

  // Result panel
  ctx.fillStyle = "rgba(254,82,0,0.06)";
  ctx.strokeStyle = "rgba(254,82,0,0.22)";
  ctx.lineWidth = 2;
  roundRect(ctx, panelX, panelY, panelW, panelH, 32);
  ctx.fill();
  ctx.stroke();

  ctx.font = "500 30px 'IBM Plex Sans Arabic', sans-serif";
  ctx.fillStyle = COLORS.subtle;
  ctx.fillText("المستلم يستلم", WIDTH / 2, panelY + 78);

  // Big result number — dynamically sized so it never overflows the panel
  const amountText = `${params.amountReceived} ${params.toCode}`;
  const maxAmountWidth = panelW - 80;
  const amountSize = fitFontSize(ctx, amountText, "IBM Plex Mono", 700, 90, 46, maxAmountWidth);
  ctx.direction = "ltr";
  ctx.font = `700 ${amountSize}px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = COLORS.primary;
  ctx.fillText(amountText, WIDTH / 2, panelY + 210);

  // "مقابل X FROM"
  ctx.direction = "ltr";
  ctx.font = "500 32px 'IBM Plex Sans Arabic', sans-serif";
  ctx.fillStyle = COLORS.muted;
  const subtitleText = `مقابل ${params.amountSent} ${params.fromCode}`;
  const subtitleSize = fitFontSize(ctx, subtitleText, "IBM Plex Sans Arabic", 500, 32, 22, maxAmountWidth);
  ctx.font = `500 ${subtitleSize}px 'IBM Plex Sans Arabic', sans-serif`;
  ctx.fillText(subtitleText, WIDTH / 2, panelY + 268);

  // Sparkline — recent price trend, same data as the in-app chart
  if (hasHistory && params.history) {
    const sparkX = panelX + 60;
    const sparkW = panelW - 120;
    drawSparkline(ctx, sparkX, sparklineTop, sparkW, sparklineH, params.history, pillColor);
    ctx.font = "500 22px 'IBM Plex Sans Arabic', sans-serif";
    ctx.fillStyle = COLORS.subtle;
    ctx.direction = "ltr";
    ctx.textAlign = "left";
    ctx.fillText(params.history[0].date, sparkX, sparklineTop + sparklineH + 24);
    ctx.textAlign = "right";
    ctx.fillText(params.history[params.history.length - 1].date, sparkX + sparkW, sparklineTop + sparklineH + 24);
    ctx.textAlign = "center";
  }

  // Rate pill
  ctx.font = "600 36px 'IBM Plex Mono', monospace";
  const rateTextWidth = ctx.measureText(params.rateLine).width;
  ctx.font = "500 26px 'IBM Plex Sans Arabic', sans-serif";
  const trendTextWidth = params.trendLabel ? ctx.measureText(params.trendLabel).width : 0;

  const pillContentWidth = rateTextWidth + (trendTextWidth ? trendTextWidth + 24 : 0);
  const pillWidth = Math.min(pillContentWidth + 84, panelW - 40);
  const pillX = WIDTH / 2 - pillWidth / 2;

  ctx.fillStyle = `${pillColor}1F`;
  ctx.strokeStyle = `${pillColor}66`;
  ctx.lineWidth = 2;
  roundRect(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = pillColor;
  ctx.arc(pillX + 34, pillY + pillHeight / 2, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.font = "600 36px 'IBM Plex Mono', monospace";
  ctx.fillStyle = pillColor;
  ctx.fillText(params.rateLine, pillX + 56, pillY + pillHeight / 2 + 12);

  if (params.trendLabel) {
    ctx.direction = "rtl";
    ctx.font = "500 26px 'IBM Plex Sans Arabic', sans-serif";
    ctx.fillText(params.trendLabel, pillX + 56 + rateTextWidth + 24, pillY + pillHeight / 2 + 9);
  }
  ctx.textAlign = "center";

  // Updated caption, below the panel
  if (params.updatedCaption) {
    ctx.direction = "rtl";
    ctx.font = "500 26px 'IBM Plex Sans Arabic', sans-serif";
    ctx.fillStyle = COLORS.subtle;
    ctx.fillText(params.updatedCaption, WIDTH / 2, captionY);
  }

  // QR code — links straight to the live site
  if (qrCanvas) {
    const qrX = WIDTH / 2 - qrSize / 2;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, qrX, qrY, qrSize, qrSize, 16);
    ctx.fill();
    const pad = qrSize * 0.09;
    ctx.drawImage(qrCanvas, qrX + pad, qrY + pad, qrSize - pad * 2, qrSize - pad * 2);

    ctx.direction = "ltr";
    ctx.font = "500 24px 'IBM Plex Mono', monospace";
    ctx.fillStyle = COLORS.subtle;
    ctx.fillText("flyrate.exchange", WIDTH / 2, qrLabelY);
  }

  // Divider
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(90, dividerY);
  ctx.lineTo(WIDTH - 90, dividerY);
  ctx.stroke();

  // Footer CTA bar
  ctx.fillStyle = COLORS.primary;
  roundRect(ctx, 90, ctaTop, WIDTH - 180, ctaHeight, 50);
  ctx.fill();
  ctx.direction = "rtl";
  ctx.font = "600 36px 'IBM Plex Sans Arabic', sans-serif";
  ctx.fillStyle = COLORS.bg;
  ctx.fillText("حوّل فلوسك على FlyRate", WIDTH / 2, ctaTop + ctaHeight / 2 + 13);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.95));
}
