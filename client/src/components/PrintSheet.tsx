import { chunkCards } from "../lib/cards";
import type { TradingCardData } from "../lib/cards";
import { CardBack } from "./CardBack";
import { TradingCard } from "./TradingCard";

const COLUMNS = 3;

/**
 * Backs for a page of fronts, laid out so they line up when printed
 * double-sided (flip on long edge): each row is mirrored left-to-right,
 * with blanks holding the place of empty slots.
 */
function mirroredBacks(page: TradingCardData[]): (TradingCardData | null)[] {
  const slots: (TradingCardData | null)[] = [];
  for (let i = 0; i < page.length; i += COLUMNS) {
    const row: (TradingCardData | null)[] = page.slice(i, i + COLUMNS);
    while (row.length < COLUMNS) row.push(null);
    slots.push(...row.reverse());
  }
  return slots;
}

export function PrintSheet({ cards }: { cards: TradingCardData[] }) {
  if (!cards.length) return null;
  const pages = chunkCards(cards);
  const single = cards.length === 1;
  const pageClass = `print-page${single ? " single" : ""}`;

  return (
    <div className="print-sheet is-ready" aria-hidden="true">
      {pages.map((page, index) => (
        <div className="print-duplex" key={`print-page-${index}`}>
          <section className={pageClass}>
            {page.map((card) => (
              <TradingCard card={card} key={`${card.id}-${card.season}`} />
            ))}
          </section>
          <section className={`${pageClass} print-page-backs`}>
            {(single ? page : mirroredBacks(page)).map((card, slot) =>
              card ? (
                <CardBack card={card} key={`${card.id}-${card.season}-back`} />
              ) : (
                <div className="print-slot-blank" key={`blank-${slot}`} />
              )
            )}
          </section>
        </div>
      ))}
    </div>
  );
}
