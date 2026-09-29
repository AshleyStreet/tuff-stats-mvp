import { getFontEmbedCSS, toCanvas, toPng } from "html-to-image";
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

function fileSlug(text: string | undefined, fallback: string) {
  return (
    (text ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || fallback
  );
}

export function cardDownloadName(card: TradingCardData) {
  return `${fileSlug(card.name, "card")}-${card.season}.png`;
}

export function cardsPdfName(cards: TradingCardData[], label?: string) {
  if (cards.length === 1) return `${fileSlug(cards[0].name, "card")}-${cards[0].season}-card.pdf`;
  return `${fileSlug(label, "cards")}-${cards[0]?.season ?? ""}-${cards.length}-cards.pdf`.replace(/--+/g, "-");
}

export function cardBackPdfName(card: TradingCardData, label?: string) {
  return `${fileSlug(label, "card")}-${card.season}-back.pdf`;
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
 * Print-shop pages: one card per page with 1/8 in of bleed on every side, so a page is
 * 2.75 × 3.75 in around the 2.5 × 3.5 in card. The trim is marked with a TrimBox for the
 * shop's cutting software.
 */
const BLEED_IN = 0.125;
const PAGE_WIDTH_IN = PRINT_TRIM_WIDTH_IN + 2 * BLEED_IN;
const PAGE_HEIGHT_IN = PRINT_TRIM_HEIGHT_IN + 2 * BLEED_IN;
const POINTS_PER_IN = 72;

/**
 * Cards at their real size (2.5" × 3.5", the same as Magic or Pokémon cards), one per page
 * with bleed, rendered at 300 DPI. Pass the card backs on their own for a separate back PDF.
 */
export async function downloadCardsPdf(
  nodes: HTMLElement[],
  filename: string,
  onProgress?: (done: number, total: number) => void
) {
  if (!nodes.length) return;
  try {
    const { jsPDF } = await import("jspdf");
    const format = [PAGE_WIDTH_IN, PAGE_HEIGHT_IN];
    const doc = new jsPDF({ unit: "in", format, orientation: "portrait", compress: true });
    doc.setProperties({ title: filename.replace(/\.pdf$/i, ""), creator: "AfterWhistle" });

    // Embedding the page's fonts is the slow part of each capture, and it's the same for every card.
    const fonts: { css?: string } = {};
    for (const [index, node] of nodes.entries()) {
      if (index > 0) doc.addPage(format, "portrait");
      markTrim(doc);
      const page = withBleed(await renderCard(node, fonts));
      doc.addImage(page.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, PAGE_WIDTH_IN, PAGE_HEIGHT_IN, undefined, "NONE");
      onProgress?.(index + 1, nodes.length);
    }

    doc.save(filename);
  } catch (err) {
    throw new Error(errorMessage(err, "Couldn't save those cards as a PDF."));
  }
}

/** Set the page's TrimBox (in points) to the card's edges, inside the bleed. */
function markTrim(doc: import("jspdf").jsPDF) {
  const { pageContext } = doc.getCurrentPageInfo() as unknown as {
    pageContext: { trimBox: { bottomLeftX: number; bottomLeftY: number; topRightX: number; topRightY: number } | null };
  };
  pageContext.trimBox = {
    bottomLeftX: BLEED_IN * POINTS_PER_IN,
    bottomLeftY: BLEED_IN * POINTS_PER_IN,
    topRightX: (BLEED_IN + PRINT_TRIM_WIDTH_IN) * POINTS_PER_IN,
    topRightY: (BLEED_IN + PRINT_TRIM_HEIGHT_IN) * POINTS_PER_IN
  };
}

function renderCard(node: HTMLElement, fonts: { css?: string }) {
  return withExportClone(
    node,
    PRINT_LAYOUT_WIDTH,
    PRINT_LAYOUT_HEIGHT,
    async (clone) => {
      fonts.css ??= await getFontEmbedCSS(clone);
      return toCanvas(clone, {
        cacheBust: true,
        fontEmbedCSS: fonts.css,
        pixelRatio: PRINT_PIXEL_RATIO,
        width: PRINT_LAYOUT_WIDTH,
        height: PRINT_LAYOUT_HEIGHT,
        backgroundColor: EXPORT_BACKGROUND
      });
    },
    "tc-print-export"
  );
}

/**
 * Center the card on a page-sized canvas and fill the bleed by mirroring the 1/8 in just
 * inside each edge outward, so colour and pattern carry on past the trim line and a cut a
 * little off still lands on the card's own artwork.
 */
function withBleed(card: HTMLCanvasElement) {
  const w = card.width;
  const h = card.height;
  const b = Math.round((w / PRINT_TRIM_WIDTH_IN) * BLEED_IN);
  const page = document.createElement("canvas");
  page.width = w + 2 * b;
  page.height = h + 2 * b;
  const ctx = page.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw that card.");

  const mirror = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, flipX: boolean, flipY: boolean) => {
    ctx.save();
    ctx.translate(dx + (flipX ? sw : 0), dy + (flipY ? sh : 0));
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(card, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.restore();
  };

  ctx.drawImage(card, b, b);
  mirror(0, 0, w, b, b, 0, false, true); // top
  mirror(0, h - b, w, b, b, b + h, false, true); // bottom
  mirror(0, 0, b, h, 0, b, true, false); // left
  mirror(w - b, 0, b, h, b + w, b, true, false); // right
  mirror(0, 0, b, b, 0, 0, true, true); // corners
  mirror(w - b, 0, b, b, b + w, 0, true, true);
  mirror(0, h - b, b, b, 0, b + h, true, true);
  mirror(w - b, h - b, b, b, b + w, b + h, true, true);
  return page;
}
