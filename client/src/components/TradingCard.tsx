import { initials, splitPlayerName, type TradingCardData } from "../lib/cards";
import { TeamLogo } from "./TeamLogo";

interface Props {
  card: TradingCardData;
  selected?: boolean;
  onSelect?: () => void;
}

const statLine = (card: TradingCardData) =>
  [
    ["PTS", card.derived.totalPoints],
    ["TD", card.derived.totalTouchdowns],
    ["REC", card.stats.rec],
    ["INT", card.stats.int],
    ["SACK", card.stats.sack]
  ] as const;

export function TradingCard({ card, selected, onSelect }: Props) {
  const { first, last } = splitPlayerName(card.name);
  const jersey = card.number != null && String(card.number).trim() ? String(card.number).trim() : "";
  const className = `trading-card${selected ? " selected" : ""}${onSelect ? " interactive" : ""}`;
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
        <span className="tc-team">{card.team || "Free agent"}</span>
      </div>

      <div className="tc-stats">
        {statLine(card).map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
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
