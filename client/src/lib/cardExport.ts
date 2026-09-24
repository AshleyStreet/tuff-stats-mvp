import { toCanvas, toPng } from "html-to-image";
import type { TradingCardData } from "./cards";

const EXPORT_WIDTH = 750;
const EXPORT_HEIGHT = Math.round((EXPORT_WIDTH * 3.5) / 2.5);
const EXPORT_BACKGROUND = "#0a0a0a";

/** Standard trading card trim (inches), plus the 1/8" bleed print shops ask for on every side. */
export const PRINT_TRIM_WIDTH_IN = 2.5;
export const PRINT_TRIM_HEIGHT_IN = 3.5;
export const PRINT_BLEED_IN = 0.125;
const PRINT_DPI = 300;
/** Lay the card out at on-screen size, then scale up so text and borders match what the captain saw. */
const PRINT_LAYOUT_WIDTH = 250;
const PRINT_LAYOUT_HEIGHT = 350;
const PRINT_PIXEL_RATIO = (PRINT_TRIM_WIDTH_IN * PRINT_DPI) / PRINT_LAYOUT_WIDTH;

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

const inlinedImages = new Map<string, Promise<string | null>>();

/** Fetch a same-origin image once per session and hand back a data URL the export canvas can draw. */
function inlineImage(url: string): Promise<string | null> {
  let pending = inlinedImages.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => (response.ok ? response.blob() : null))
      .then(
        (blob) =>
          blob && blob.type.startsWith("image/")
            ? new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              })
            : null
      )
      .catch(() => null);
    // Don't pin a failure for the whole session; a later export can retry.
    void pending.then((result) => {
      if (!result) inlinedImages.delete(url);
    });
    inlinedImages.set(url, pending);
  }
  return pending;
}

/**
 * External logos (e.g. SportsPress) block canvas export. Swap in the server's same-origin copy
 * when the card names one; otherwise fall back to the initials.
 */
async function inlineExternalImages(root: HTMLElement) {
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
    const exportSrc = img.dataset.exportSrc;
    const inlined = exportSrc ? await inlineImage(exportSrc) : null;
    if (inlined) {
      img.removeAttribute("srcset");
      img.src = inlined;
      continue;
    }
    const fallback = document.createElement("div");
    fallback.className = img.className;
    fallback.setAttribute("aria-hidden", "true");
    fallback.textContent = initials;
    img.replaceWith(fallback);
  }
}

function cardFileBase(card: TradingCardData) {
  return (
    card.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "card"
  );
}

export function cardDownloadName(card: TradingCardData) {
  return `${cardFileBase(card)}-${card.season}.png`;
}

export function cardsPdfName(cards: TradingCardData[], label?: string) {
  if (cards.length === 1) return `${cardFileBase(cards[0])}-${cards[0].season}-print.pdf`;
  const base =
    (label ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "cards";
  return `${base}-${cards[0]?.season ?? ""}-${cards.length}-cards-print.pdf`.replace(/--+/g, "-");
}

function errorMessage(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return message || fallback;
}

/** Render a detached copy of the card at a fixed size so layout doesn't depend on the panel it sits in. */
async function withExportClone<T>(
  node: HTMLElement,
  width: number,
  height: number,
  run: (clone: HTMLElement) => Promise<T>,
  extraClass?: string
): Promise<T> {
  await waitForImages(node);
  await new Promise((resolve) => window.setTimeout(resolve, 40));

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;pointer-events:none;";
  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = "none";
  clone.style.margin = "0";
  clone.style.transform = "none";
  if (extraClass) clone.classList.add(extraClass);
  await inlineExternalImages(clone);
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await waitForImages(clone);
    return await run(clone);
  } finally {
    host.remove();
  }
}

export async function downloadCardPng(node: HTMLElement, filename: string) {
  try {
    const dataUrl = await withExportClone(node, EXPORT_WIDTH, EXPORT_HEIGHT, (clone) =>
      toPng(clone, {
        cacheBust: true,
        pixelRatio: 1,
        width: EXPORT_WIDTH,
        height: EXPORT_HEIGHT,
        canvasWidth: EXPORT_WIDTH,
        canvasHeight: EXPORT_HEIGHT,
        backgroundColor: EXPORT_BACKGROUND
      })
    );
    triggerDownload(dataUrl, filename);
  } catch (err) {
    throw new Error(errorMessage(err, "Couldn't download that card as a PNG."));
  }
}

function triggerDownload(href: string, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = href;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Grow the canvas by `bleed` px per side by stretching the outermost row/column of pixels outward,
 * so a slightly-off cut still lands on card art instead of a white sliver.
 */
function addBleed(source: HTMLCanvasElement, bleed: number): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const out = document.createElement("canvas");
  out.width = w + bleed * 2;
  out.height = h + bleed * 2;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare the print file in this browser.");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = EXPORT_BACKGROUND;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, bleed, bleed);
  // edges
  ctx.drawImage(source, 0, 0, w, 1, bleed, 0, w, bleed);
  ctx.drawImage(source, 0, h - 1, w, 1, bleed, h + bleed, w, bleed);
  ctx.drawImage(source, 0, 0, 1, h, 0, bleed, bleed, h);
  ctx.drawImage(source, w - 1, 0, 1, h, w + bleed, bleed, bleed, h);
  // corners
  ctx.drawImage(source, 0, 0, 1, 1, 0, 0, bleed, bleed);
  ctx.drawImage(source, w - 1, 0, 1, 1, w + bleed, 0, bleed, bleed);
  ctx.drawImage(source, 0, h - 1, 1, 1, 0, h + bleed, bleed, bleed);
  ctx.drawImage(source, w - 1, h - 1, 1, 1, w + bleed, h + bleed, bleed, bleed);
  return out;
}

/**
 * One card per page at 2.75" × 3.75" (2.5" × 3.5" trim + 1/8" bleed), 300 DPI — the format
 * most print shops take for trading cards without further setup.
 */
export async function downloadCardsPdf(
  nodes: HTMLElement[],
  filename: string,
  onProgress?: (done: number, total: number) => void
) {
  if (!nodes.length) return;
  try {
    const { jsPDF } = await import("jspdf");
    const pageWidth = PRINT_TRIM_WIDTH_IN + PRINT_BLEED_IN * 2;
    const pageHeight = PRINT_TRIM_HEIGHT_IN + PRINT_BLEED_IN * 2;
    const bleedPx = Math.round(PRINT_BLEED_IN * PRINT_DPI);
    const doc = new jsPDF({ unit: "in", format: [pageWidth, pageHeight], orientation: "portrait", compress: true });
    doc.setProperties({ title: filename.replace(/\.pdf$/i, ""), creator: "AfterWhistle" });

    for (const [index, node] of nodes.entries()) {
      const canvas = await withExportClone(
        node,
        PRINT_LAYOUT_WIDTH,
        PRINT_LAYOUT_HEIGHT,
        (clone) =>
          toCanvas(clone, {
            cacheBust: true,
            pixelRatio: PRINT_PIXEL_RATIO,
            width: PRINT_LAYOUT_WIDTH,
            height: PRINT_LAYOUT_HEIGHT,
            backgroundColor: EXPORT_BACKGROUND
          }),
        "tc-print-export"
      );
      const page = addBleed(canvas, bleedPx);
      if (index > 0) doc.addPage([pageWidth, pageHeight], "portrait");
      doc.addImage(page.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, pageWidth, pageHeight, undefined, "NONE");
      onProgress?.(index + 1, nodes.length);
    }

    doc.save(filename);
  } catch (err) {
    throw new Error(errorMessage(err, "Couldn't save those cards as a PDF."));
  }
}
