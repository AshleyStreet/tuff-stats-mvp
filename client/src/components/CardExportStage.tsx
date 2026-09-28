import type { Ref } from "react";
import type { TradingCardData } from "../lib/cards";
import { CardBack } from "./CardBack";
import { TradingCard } from "./TradingCard";

/** Offscreen copies of the cards being exported, fronts then backs, laid out at print size. */
export function CardExportStage({ cards, stageRef }: { cards: TradingCardData[] | null; stageRef: Ref<HTMLDivElement> }) {
  if (!cards?.length) return null;
  return (
    <div className="card-export-stage" aria-hidden="true" ref={stageRef}>
      {cards.map((card) => (
        <TradingCard card={card} key={`${card.id}-${card.season}`} />
      ))}
      {cards.map((card) => (
        <CardBack card={card} key={`${card.id}-${card.season}-back`} />
      ))}
    </div>
  );
}
