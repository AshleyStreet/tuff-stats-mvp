import type { Ref } from "react";
import type { TradingCardData } from "../lib/cards";
import type { PdfSide } from "../lib/useCardPdf";
import { CardBack } from "./CardBack";
import { TradingCard } from "./TradingCard";

/** Offscreen copies of the cards being exported (fronts, or the one back), laid out at print size. */
export function CardExportStage({
  cards,
  side,
  stageRef
}: {
  cards: TradingCardData[] | null;
  side: PdfSide | null;
  stageRef: Ref<HTMLDivElement>;
}) {
  if (!cards?.length) return null;
  return (
    <div className="card-export-stage" aria-hidden="true" ref={stageRef}>
      {side === "back" ? (
        <CardBack card={cards[0]} />
      ) : (
        cards.map((card) => <TradingCard card={card} key={`${card.id}-${card.season}`} />)
      )}
    </div>
  );
}
