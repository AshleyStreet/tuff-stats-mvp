import { useEffect, useRef, useState } from "react";
import type { TradingCardData } from "./cards";
import { cardsPdfName, downloadCardsPdf } from "./cardExport";
import { trackEvent, type AnalyticsProps } from "./analytics";

type PdfJob = {
  cards: TradingCardData[];
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

  function requestPdf(cards: TradingCardData[], context: AnalyticsProps = {}, label?: string) {
    if (!cards.length || job) return;
    setError(null);
    // Each card is drawn twice: its front, then its back.
    setProgress({ done: 0, total: cards.length * 2 });
    setJob({ cards, label, context });
  }

  useEffect(() => {
    if (!job) return;
    let cancelled = false;

    async function run(current: PdfJob) {
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
      const stage = stageRef.current;
      const nodes = [...(stage?.querySelectorAll<HTMLElement>(".trading-card:not(.tc-back)") ?? [])];
      const backs = [...(stage?.querySelectorAll<HTMLElement>(".trading-card.tc-back") ?? [])];
      try {
        if (!nodes.length) throw new Error("Couldn't find those cards to export.");
        await downloadCardsPdf(
          nodes,
          cardsPdfName(current.cards, current.label),
          (done, total) => {
            if (!cancelled) setProgress({ done, total });
          },
          backs
        );
        trackEvent("cards_pdf", { count: current.cards.length, ...current.context });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error && err.message ? err.message : "Couldn't save those cards as a PDF.");
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

  return { pdfCards: job?.cards ?? null, pdfProgress: progress, pdfError: error, requestPdf, stageRef };
}
