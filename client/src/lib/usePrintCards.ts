import { useEffect, useState } from "react";
import type { TradingCardData } from "./cards";

export function usePrintCards() {
  const [printCards, setPrintCards] = useState<TradingCardData[] | null>(null);

  function requestPrint(cards: TradingCardData[]) {
    if (!cards.length) return;
    setPrintCards(cards);
  }

  useEffect(() => {
    if (!printCards?.length) return;
    let cancelled = false;

    async function printWhenReady() {
      const images = [...document.querySelectorAll<HTMLImageElement>(".print-sheet img")];
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
            window.setTimeout(() => resolve(), 2000);
          });
        })
      );
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      if (!cancelled) window.print();
    }

    void printWhenReady();
    const done = () => setPrintCards(null);
    window.addEventListener("afterprint", done);
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", done);
    };
  }, [printCards]);

  return { printCards, requestPrint };
}
