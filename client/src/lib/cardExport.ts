import { toCanvas, toPng } from "html-to-image";
import type { TradingCardData } from "./cards";

const EXPORT_WIDTH = 750;
const EXPORT_HEIGHT = Math.round((EXPORT_WIDTH * 3.5) / 2.5);
const EXPORT_BACKGROUND = "#0a0a0a";

/** Standard trading card size in inches, the same as Magic: The Gathering or Pokémon cards. */
export const PRINT_TRIM_WIDTH_IN = 2.5;
export const PRINT_TRIM_HEIGHT_IN = 3.5;
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
  const initials = root.dataset.exportInitials || name
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
  if (cards.length === 1) return `${cardFileBase(cards[0])}-${cards[0].season}-card.pdf`;
  const base =
    (label ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "cards";
  return `${base}-${cards[0]?.season ?? ""}-${cards.length}-cards.pdf`.replace(/--+/g, "-");
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

/** US Letter, portrait, holding a 3 × 3 grid of cards that touch edge to edge. */
const SHEET_WIDTH_IN = 8.5;
const SHEET_HEIGHT_IN = 11;
export const CARDS_PER_ROW = 3;
export const CARDS_PER_COLUMN = 3;
export const CARDS_PER_SHEET = CARDS_PER_ROW * CARDS_PER_COLUMN;
const GRID_LEFT_IN = (SHEET_WIDTH_IN - CARDS_PER_ROW * PRINT_TRIM_WIDTH_IN) / 2;
const GRID_TOP_IN = (SHEET_HEIGHT_IN - CARDS_PER_COLUMN * PRINT_TRIM_HEIGHT_IN) / 2;
/** Cut marks stop short of the cards so a cut along them never leaves a stray line on the card. */
const CUT_MARK_GAP_IN = 0.06;
const CUT_MARK_WIDTH_IN = 0.006;

/** Short guide lines in the margins, lined up with every edge of the card grid. */
function drawCutMarks(doc: import("jspdf").jsPDF) {
  const gridRight = GRID_LEFT_IN + CARDS_PER_ROW * PRINT_TRIM_WIDTH_IN;
  const gridBottom = GRID_TOP_IN + CARDS_PER_COLUMN * PRINT_TRIM_HEIGHT_IN;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(CUT_MARK_WIDTH_IN);

  for (let col = 0; col <= CARDS_PER_ROW; col += 1) {
    const x = GRID_LEFT_IN + col * PRINT_TRIM_WIDTH_IN;
    doc.line(x, 0, x, GRID_TOP_IN - CUT_MARK_GAP_IN);
    doc.line(x, gridBottom + CUT_MARK_GAP_IN, x, SHEET_HEIGHT_IN);
  }
  for (let row = 0; row <= CARDS_PER_COLUMN; row += 1) {
    const y = GRID_TOP_IN + row * PRINT_TRIM_HEIGHT_IN;
    doc.line(0, y, GRID_LEFT_IN - CUT_MARK_GAP_IN, y);
    doc.line(gridRight + CUT_MARK_GAP_IN, y, SHEET_WIDTH_IN, y);
  }
}

/**
 * Cards at their real size (2.5" × 3.5", the same as Magic or Pokémon cards), nine to a
 * letter page with cut marks, rendered at 300 DPI. Print at 100% / "actual size".
 *
 * With `backs` (one per front, same order), each page of fronts is followed by a page of backs
 * mirrored left-to-right, so they line up when printed double-sided and flipped on the long edge.
 */
export async function downloadCardsPdf(
  nodes: HTMLElement[],
  filename: string,
  onProgress?: (done: number, total: number) => void,
  backs: HTMLElement[] = []
) {
  if (!nodes.length) return;
  try {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "in", format: "letter", orientation: "portrait", compress: true });
    doc.setProperties({ title: filename.replace(/\.pdf$/i, ""), creator: "AfterWhistle" });
    const total = nodes.length + backs.length;
    let done = 0;

    for (let start = 0; start < nodes.length; start += CARDS_PER_SHEET) {
      if (start > 0) doc.addPage("letter", "portrait");
      drawCutMarks(doc);
      for (const [slot, node] of nodes.slice(start, start + CARDS_PER_SHEET).entries()) {
        await drawCard(doc, node, slot % CARDS_PER_ROW, Math.floor(slot / CARDS_PER_ROW));
        onProgress?.(++done, total);
      }

      const sheetBacks = backs.slice(start, start + CARDS_PER_SHEET);
      if (!sheetBacks.length) continue;
      doc.addPage("letter", "portrait");
      drawCutMarks(doc);
      for (const [slot, node] of sheetBacks.entries()) {
        await drawCard(doc, node, CARDS_PER_ROW - 1 - (slot % CARDS_PER_ROW), Math.floor(slot / CARDS_PER_ROW));
        onProgress?.(++done, total);
      }
    }

    doc.save(filename);
  } catch (err) {
    throw new Error(errorMessage(err, "Couldn't save those cards as a PDF."));
  }
}

async function drawCard(doc: import("jspdf").jsPDF, node: HTMLElement, col: number, row: number) {
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
  doc.addImage(
    canvas.toDataURL("image/jpeg", 0.95),
    "JPEG",
    GRID_LEFT_IN + col * PRINT_TRIM_WIDTH_IN,
    GRID_TOP_IN + row * PRINT_TRIM_HEIGHT_IN,
    PRINT_TRIM_WIDTH_IN,
    PRINT_TRIM_HEIGHT_IN,
    undefined,
    "NONE"
  );
}
