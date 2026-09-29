import { useEffect, useRef, useState } from "react";
import type { TradingCardData } from "./cards";
import { trackEvent, type AnalyticsProps } from "./analytics";

/** Fronts are one card per page; the back is its own one-page PDF for the shop to print behind them. */
export type PdfSide = "fronts" | "back";

type PdfJob = {
  cards: TradingCardData[];
  side: PdfSide;
  label?: string;
  context: AnalyticsProps;
};

/**
 * Mount `pdfCards` in an offscreen stage (see CardExportStage), then capture each card into a
 * print-shop PDF once React has painted them.
 */
export function useCardPdf() {
  const [job, setJob] = useState<PdfJob | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  function requestPdf(cards: TradingCardData[], context: AnalyticsProps = {}, label?: string, side: PdfSide = "fronts") {
    if (!cards.length || job) return;
    setError(null);
    setProgress({ done: 0, total: side === "back" ? 1 : cards.length });
    setJob({ cards: side === "back" ? cards.slice(0, 1) : cards, side, label, context });
  }

  useEffect(() => {
    if (!job) return;
    let cancelled = false;

    async function run(current: PdfJob) {
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
      const nodes = [...(stageRef.current?.querySelectorAll<HTMLElement>(".trading-card") ?? [])];
      try {
        if (!nodes.length) throw new Error("Couldn't find those cards to export.");
        // html-to-image and jsPDF load on first export, keeping them out of the main bundle.
        const { cardBackPdfName, cardsPdfName, downloadCardsPdf } = await import("./cardExport");
        const filename =
          current.side === "back"
            ? cardBackPdfName(current.cards[0], current.label)
            : cardsPdfName(current.cards, current.label);
        await downloadCardsPdf(nodes, filename, (done, total) => {
          if (!cancelled) setProgress({ done, total });
        });
        trackEvent(current.side === "back" ? "card_back_pdf" : "cards_pdf", {
          count: current.cards.length,
          ...current.context
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error && err.message ? err.message : "Couldn't save that PDF.");
        }
      } finally {
        if (!cancelled) {
          setJob(null);
          setProgress(null);
        }
      }
    }

    void run(job);
    return () => {
      cancelled = true;
    };
  }, [job]);

  return {
    pdfCards: job?.cards ?? null,
    pdfSide: job?.side ?? null,
    pdfProgress: progress,
    pdfError: error,
    requestPdf,
    stageRef
  };
}
