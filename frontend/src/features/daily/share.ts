import { webApp } from "@/lib/telegram";

import { THEME_LABELS } from "./labels";
import type { DailyPage } from "./schedule";

const TINT: Record<DailyPage["season"], string> = { spring: "#d9f0e4", summer: "#fbf1c4", autumn: "#ffe6d8", winter: "#efe9fd" };
const FONT = '"Nunito Variable", -apple-system, "Segoe UI", Roboto, sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** A 1080×1350 picture of the page: illustration, date, phrase. Null when the browser cannot draw it. */
export async function renderCard(page: DailyPage, svg: string | undefined, dateLabel: string): Promise<Blob | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await document.fonts?.ready;
    ctx.fillStyle = "#fff7ed";
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(70, 70, 940, 1210, 64);
    ctx.fill();
    ctx.fillStyle = TINT[page.season];
    ctx.beginPath();
    ctx.roundRect(110, 110, 860, 640, 48);
    ctx.fill();
    // perforation of a tear-off calendar
    ctx.fillStyle = "#fff7ed";
    for (let x = 140; x < 960; x += 44) {
      ctx.beginPath();
      ctx.arc(x, 70, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    if (svg) {
      const img = await loadImage(svg);
      ctx.drawImage(img, 180, 130, 720, 600);
    }
    ctx.fillStyle = "#a8402f";
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(`${dateLabel.toUpperCase()} · ${THEME_LABELS[page.theme].toUpperCase()}`, 130, 840);
    ctx.fillStyle = "#24443a";
    ctx.font = `800 62px ${FONT}`;
    wrap(ctx, page.text, 820)
      .slice(0, 5)
      .forEach((line, i) => ctx.fillText(line, 130, 930 + i * 78));
    ctx.fillStyle = "#7a6f66";
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText("Family OS · Листочек дня", 130, 1225);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  } catch {
    return null;
  }
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/** Share the page: as a picture through the system menu when possible, otherwise as text
 *  (system menu, Telegram's share dialog, or the clipboard). */
export async function shareDaily(page: DailyPage, svg: string | undefined, dateLabel: string, botUsername: string | null): Promise<ShareResult> {
  const text = `«${page.text}»\n\nЛисточек дня, ${dateLabel} — Family OS`;
  try {
    if (navigator.share) {
      const blob = await renderCard(page, svg, dateLabel);
      const file = blob ? new File([blob], `listochek-${page.date}.png`, { type: "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else await navigator.share({ text });
      return "shared";
    }
    const tg = webApp();
    if (tg?.initData && botUsername) {
      tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(`https://t.me/${botUsername}`)}&text=${encodeURIComponent(text)}`);
      return "shared";
    }
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "failed";
  }
}
