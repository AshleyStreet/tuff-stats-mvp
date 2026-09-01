import { toPng } from "html-to-image";
import type { TradingCardData } from "./cards";

const EXPORT_WIDTH = 750;
const EXPORT_HEIGHT = Math.round((EXPORT_WIDTH * 3.5) / 2.5);

function waitForImages(node: HTMLElement) {
  const images = [...node.querySelectorAll("img")];
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
          window.setTimeout(() => resolve(), 2000);
        })
    )
  );
}

function isInlineImageSrc(src: string) {
  return src.startsWith("data:") || src.startsWith("blob:");
}

/** External logos (e.g. SportsPress) often block canvas export; swap them for the initials fallback. */
function replaceExternalImages(root: HTMLElement) {
  const name = root.querySelector(".tc-name")?.textContent?.trim() || "?";
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  for (const img of [...root.querySelectorAll("img")]) {
    const src = img.currentSrc || img.getAttribute("src") || "";
    if (!src || isInlineImageSrc(src)) continue;
    const fallback = document.createElement("div");
    fallback.className = img.className;
    fallback.setAttribute("aria-hidden", "true");
    fallback.textContent = initials;
    img.replaceWith(fallback);
  }
}

export function cardDownloadName(card: TradingCardData) {
  const base =
    card.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "card";
  return `${base}-${card.season}.png`;
}

export async function downloadCardPng(node: HTMLElement, filename: string) {
  await waitForImages(node);
  await new Promise((resolve) => window.setTimeout(resolve, 40));

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;";
  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.width = `${EXPORT_WIDTH}px`;
  clone.style.height = `${EXPORT_HEIGHT}px`;
  clone.style.maxWidth = "none";
  clone.style.margin = "0";
  clone.style.transform = "none";
  replaceExternalImages(clone);
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await waitForImages(clone);
    const dataUrl = await toPng(clone, {
      cacheBust: true,
      pixelRatio: 1,
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      canvasWidth: EXPORT_WIDTH,
      canvasHeight: EXPORT_HEIGHT,
      backgroundColor: "#0a0a0a"
    });

    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Couldn't download that card as a PNG.";
    throw new Error(message || "Couldn't download that card as a PNG.");
  } finally {
    host.remove();
  }
}
