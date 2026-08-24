import { initials, splitPlayerName, type CardStatLine, type TradingCardData } from "../lib/cards";
import { TeamLogo } from "./TeamLogo";

interface Props {
  card: TradingCardData;
  selected?: boolean;
  onSelect?: () => void;
}

const defaultLine = (card: TradingCardData): CardStatLine[] =>
  [
    { label: "PTS", value: String(card.derived.totalPoints) },
    { label: "TD", value: String(card.derived.totalTouchdowns) },
    { label: "REC", value: String(card.stats.rec) },
    { label: "INT", value: String(card.stats.int) },
    { label: "SACK", value: String(card.stats.sack) }
  ];

export function TradingCard({ card, selected, onSelect }: Props) {
  const { first, last } = splitPlayerName(card.name);
  const jersey = card.number != null && String(card.number).trim() ? String(card.number).trim() : "";
  const className = `trading-card${selected ? " selected" : ""}${onSelect ? " interactive" : ""}`;
  const stats = card.lineItems?.length ? card.lineItems : defaultLine(card);
  const face = (
    <div className="trading-card-face">
      <div className="tc-banner">
        <span>TUFF</span>
        <span>{card.season}</span>
      </div>

      <div className="tc-art">
        <TeamLogo
          name={card.team || card.name}
          src={card.logoUrl}
          className="tc-logo"
          fallback={initials(card.name)}
        />
        {jersey ? <span className="tc-jersey">#{jersey}</span> : null}
      </div>

      <div className="tc-identity">
        {first ? <span className="tc-first">{first}</span> : null}
        <strong className="tc-last">{last}</strong>
        {card.note != null ? (
          <span className={`tc-note${card.note.trim() ? " has-text" : ""}`}>
            {card.note.trim() || "\u00a0"}
          </span>
        ) : null}
        <span className="tc-team">{card.team || "Free agent"}</span>
      </div>

      <div className="tc-stats">
        {stats.map((item, index) => (
          <div key={`${item.label}-${index}`}>
            <span>{item.label || "\u00a0"}</span>
            <strong>{item.value || "\u00a0"}</strong>
          </div>
        ))}
      </div>

      <div className="tc-footer">
        <span>Toronto United Flag Football</span>
        <span>{card.stats.gms} GP</span>
      </div>
    </div>
  );

  if (onSelect) {
    return (
      <button type="button" className={className} onClick={onSelect}>
        {face}
      </button>
    );
  }

  return <article className={className}>{face}</article>;
}
