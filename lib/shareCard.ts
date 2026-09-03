export interface ShareCardParams {
  fromFlag: string;
  fromCode: string;
  toFlag: string;
  toCode: string;
  amountSent: string; // pre-formatted, e.g. "5,000.00"
  amountReceived: string;
  rateLine: string; // e.g. "1 MYR = 4.05 ZAR"
  trendLabel?: string; // e.g. "▲ زيادة" or "▼ انخفاض"
  trendColor: "good" | "bad" | "neutral";
  updatedCaption?: string; // e.g. "آخر تحديث للسعر: منذ 3 ساعة"
}

const WIDTH = 1000;
const HEIGHT = 1150;

const COLORS = {
  bg: "#0A0A0B",
  ink: "#F5F4F1",
  muted: "#9A9A9E",
  subtle: "#6E6E73",
  border: "rgba(255,255,255,0.08)",
  primary: "#FE5200",
  emerald: "#10B981",
  red: "#EF4444",
};

async function loadFonts() {
  const specs = [
    "700 52px 'IBM Plex Sans Arabic'",
    "600 42px 'IBM Plex Sans Arabic'",
    "500 34px 'IBM Plex Sans Arabic'",
    "700 92px 'IBM Plex Mono'",
    "600 38px 'IBM Plex Mono'",
    "500 28px 'IBM Plex Mono'",
  ];
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s)));
    await document.fonts.ready;
  } catch {
    // fonts API not fully supported — canvas will fall back to system fonts
  }
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

function trendColorHex(trend: ShareCardParams["trendColor"]) {
  if (trend === "good") return COLORS.emerald;
  if (trend === "bad") return COLORS.red;
  return COLORS.primary;
}

export async function createShareCardBlob(params: ShareCardParams): Promise<Blob | null> {
  await loadFonts();

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Soft orange glow, top of card — echoes the site's hero/calculator glow
  const glow = ctx.createRadialGradient(WIDTH / 2, 240, 40, WIDTH / 2, 240, 520);
  glow.addColorStop(0, "rgba(254,82,0,0.28)");
  glow.addColorStop(1, "rgba(254,82,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Outer frame
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  roundRect(ctx, 24, 24, WIDTH - 48, HEIGHT - 48, 40);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Brand wordmark: "Fly" + "Rate" (orange)
  ctx.direction = "ltr";
  ctx.font = "700 52px 'IBM Plex Sans Arabic', sans-serif";
  const flyWidth = ctx.measureText("Fly").width;
  const rateWidth = ctx.measureText("Rate").width;
  const wordmarkStart = WIDTH / 2 - (flyWidth + rateWidth) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.ink;
  ctx.fillText("Fly", wordmarkStart, 128);
  ctx.fillStyle = COLORS.primary;
  ctx.fillText("Rate", wordmarkStart + flyWidth, 128);
  ctx.textAlign = "center";

  // Currency row
  ctx.direction = "rtl";
  ctx.font = "600 42px 'IBM Plex Sans Arabic', sans-serif";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`${params.fromFlag} ${params.fromCode}   ⇄   ${params.toFlag} ${params.toCode}`, WIDTH / 2, 245);

  // "المستلم يستلم"
  ctx.direction = "rtl";
  ctx.font = "500 34px 'IBM Plex Sans Arabic', sans-serif";
  ctx.fillStyle = COLORS.subtle;
  ctx.fillText("المستلم يستلم", WIDTH / 2, 355);

  // Big result number
  ctx.direction = "ltr";
  ctx.font = "700 92px 'IBM Plex Mono', monospace";
  ctx.fillStyle = COLORS.primary;
  ctx.fillText(`${params.amountReceived} ${params.toCode}`, WIDTH / 2, 465);

  // "مقابل X FROM"
  ctx.direction = "ltr";
  ctx.font = "500 34px 'IBM Plex Sans Arabic', sans-serif";
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`مقابل ${params.amountSent} ${params.fromCode}`, WIDTH / 2, 525);

  // Rate pill
  const pillY = 575;
  const pillHeight = 76;
  const pillColor = trendColorHex(params.trendColor);
  ctx.font = "600 38px 'IBM Plex Mono', monospace";
  const rateTextWidth = ctx.measureText(params.rateLine).width;
  const trendTextWidth = params.trendLabel
    ? (() => {
        ctx.font = "500 28px 'IBM Plex Sans Arabic', sans-serif";
        return ctx.measureText(params.trendLabel).width;
      })()
    : 0;
  const pillContentWidth = rateTextWidth + (trendTextWidth ? trendTextWidth + 28 : 0);
  const pillWidth = pillContentWidth + 90;
  const pillX = WIDTH / 2 - pillWidth / 2;

  ctx.fillStyle = `${pillColor}1A`; // ~10% alpha
  ctx.strokeStyle = `${pillColor}66`; // ~40% alpha
  ctx.lineWidth = 2;
  roundRect(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();
  ctx.stroke();

  // Live dot
  ctx.beginPath();
  ctx.fillStyle = pillColor;
  ctx.arc(pillX + 40, pillY + pillHeight / 2, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.font = "600 38px 'IBM Plex Mono', monospace";
  ctx.fillStyle = pillColor;
  ctx.fillText(params.rateLine, pillX + 64, pillY + pillHeight / 2 + 13);

  if (params.trendLabel) {
    ctx.direction = "rtl";
    ctx.font = "500 28px 'IBM Plex Sans Arabic', sans-serif";
    ctx.fillText(params.trendLabel, pillX + 64 + rateTextWidth + trendTextWidth + 28, pillY + pillHeight / 2 + 10);
  }
  ctx.textAlign = "center";

  // Updated caption
  if (params.updatedCaption) {
    ctx.direction = "rtl";
    ctx.font = "500 28px 'IBM Plex Sans Arabic', sans-serif";
    ctx.fillStyle = COLORS.subtle;
    ctx.fillText(params.updatedCaption, WIDTH / 2, pillY + pillHeight + 60);
  }

  // Divider
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(90, HEIGHT - 190);
  ctx.lineTo(WIDTH - 90, HEIGHT - 190);
  ctx.stroke();

  // Footer CTA bar
  ctx.fillStyle = COLORS.primary;
  roundRect(ctx, 90, HEIGHT - 150, WIDTH - 180, 100, 50);
  ctx.fill();
  ctx.direction = "rtl";
  ctx.font = "600 36px 'IBM Plex Sans Arabic', sans-serif";
  ctx.fillStyle = COLORS.bg;
  ctx.fillText("حوّل فلوسك على FlyRate", WIDTH / 2, HEIGHT - 88);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.95));
}
