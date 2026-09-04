import { chunkCards } from "../lib/cards";
import type { TradingCardData } from "../lib/cards";
import { TradingCard } from "./TradingCard";

export function PrintSheet({ cards }: { cards: TradingCardData[] }) {
  if (!cards.length) return null;
  const pages = chunkCards(cards);

  return (
    <div className="print-sheet is-ready" aria-hidden="true">
      {pages.map((page, index) => (
        <section className={`print-page${cards.length === 1 ? " single" : ""}`} key={`print-page-${index}`}>
          {page.map((card) => (
            <TradingCard card={card} key={`${card.id}-${card.season}`} />
          ))}
        </section>
      ))}
    </div>
  );
}
