// Zero-cost story card generator — renders 1080x1920 PNG on-device via Canvas.
// No deps, no server. Used to create shareable Instagram/WhatsApp story images.

export type StoryTemplate = "alert" | "savings" | "arrived" | "badge";

export type StoryData = {
  template: StoryTemplate;
  title: string;        // Big headline (1-3 words)
  subtitle?: string;    // Secondary line
  emoji?: string;       // Hero emoji
  meta?: string[];      // Small meta lines (location, time, confirmations…)
  cta?: string;         // Bottom CTA (default: wsel.app)
};

const W = 1080;
const H = 1920;

// Palettes per template (background gradient + accent)
const PALETTES: Record<StoryTemplate, { from: string; to: string; accent: string }> = {
  alert:   { from: "#7f1d1d", to: "#dc2626", accent: "#fde047" },
  savings: { from: "#064e3b", to: "#0ea5e9", accent: "#fde047" },
  arrived: { from: "#1e3a8a", to: "#06b6d4", accent: "#bef264" },
  badge:   { from: "#1f2937", to: "#a16207", accent: "#fbbf24" },
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderStoryCard(data: StoryData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const pal = PALETTES[data.template];

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, pal.from);
  grad.addColorStop(1, pal.to);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Soft glow circles
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(150, 250, 220, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(950, 1700, 280, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // RTL text setup
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";

  // Top brand bar
  ctx.font = "600 38px system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif";
  ctx.globalAlpha = 0.85;
  ctx.fillText("🚌 مواصلات", W / 2, 110);
  ctx.globalAlpha = 1;

  // Hero emoji
  if (data.emoji) {
    ctx.font = "320px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji', sans-serif";
    ctx.fillText(data.emoji, W / 2, 540);
  }

  // Title (huge)
  ctx.font = "900 130px system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillStyle = "#ffffff";
  const titleLines = wrapText(ctx, data.title, W - 160);
  let y = 760;
  for (const ln of titleLines) {
    ctx.fillText(ln, W / 2, y);
    y += 150;
  }

  // Subtitle
  if (data.subtitle) {
    ctx.font = "500 58px system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    const subLines = wrapText(ctx, data.subtitle, W - 200);
    y += 20;
    for (const ln of subLines) {
      ctx.fillText(ln, W / 2, y);
      y += 78;
    }
  }

  // Meta chips
  if (data.meta?.length) {
    y += 40;
    ctx.font = "600 44px system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif";
    for (const m of data.meta) {
      const w = ctx.measureText(m).width + 80;
      const x = (W - w) / 2;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      roundRect(ctx, x, y - 50, w, 80, 40);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(m, W / 2, y + 8);
      y += 110;
    }
  }

  // Bottom CTA pill
  const cta = data.cta ?? "wsel.app — مواصلات مصر";
  ctx.fillStyle = pal.accent;
  const ctaW = 720;
  roundRect(ctx, (W - ctaW) / 2, H - 240, ctaW, 130, 65);
  ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 52px system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif";
  ctx.fillText(cta, W / 2, H - 158);

  // Tiny footer
  ctx.font = "500 32px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(new Date().toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }), W / 2, H - 70);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png", 0.95),
  );
}

export async function shareStoryCard(data: StoryData, fallbackText?: string): Promise<"shared" | "downloaded"> {
  const blob = await renderStoryCard(data);
  const file = new File([blob], `mwaslat-${data.template}-${Date.now()}.png`, { type: "image/png" });

  // Try native share with file (mobile)
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], text: fallbackText });
      return "shared";
    } catch {
      // user cancelled — fall through to download
    }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
