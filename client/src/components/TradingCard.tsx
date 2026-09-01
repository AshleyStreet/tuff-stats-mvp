import { initials, visibleCardStats, type CardStatLine, type TradingCardData } from "../lib/cards";
import { usePresentation } from "../league/LeagueProvider";
import { readStat } from "../league/readStat";
import { TeamLogo } from "./TeamLogo";

interface Props {
  card: TradingCardData;
  selected?: boolean;
  onSelect?: () => void;
}

export function TradingCard({ card, selected, onSelect }: Props) {
  const presentation = usePresentation();
  const jersey = card.number != null && String(card.number).trim() ? String(card.number).trim() : "";
  const className = `trading-card${selected ? " selected" : ""}${onSelect ? " interactive" : ""}`;
  const fallbackLine: CardStatLine[] = presentation.cardDefaults.map((column) => ({
    label: column.short,
    value: String(readStat(card, column.key))
  }));
  const stats = visibleCardStats(card.lineItems?.length ? card.lineItems : fallbackLine);
  const displayName = card.name.trim().toUpperCase();

  const face = (
    <div className="trading-card-face">
      <div className="tc-frame">
        {jersey ? <span className="tc-num">{jersey}</span> : null}

        <div className="tc-hero">
          {card.photoUrl ? (
            <img className="tc-photo" src={card.photoUrl} alt="" />
          ) : (
            <div className="tc-hero-fallback" aria-hidden="true">
              <TeamLogo
                name={card.team || card.name}
                src={card.logoUrl}
                className="tc-hero-logo"
                fallback={initials(card.name)}
              />
            </div>
          )}
          <div className="tc-hero-shade" aria-hidden="true" />
        </div>

        <div className="tc-nameplate">
          <strong className="tc-name">{displayName}</strong>
          {card.note?.trim() ? <span className="tc-note">{card.note.trim()}</span> : null}
        </div>

        {stats.length > 0 ? (
          <div
            className="tc-statbar"
            data-cols={stats.length}
            style={{ ["--tc-stat-cols" as string]: stats.length }}
          >
            {stats.map((item, index) => (
              <div key={`${item.label}-${index}`} className="tc-stat">
                <span>{item.label || "\u00a0"}</span>
                <strong>{item.value || "\u00a0"}</strong>
              </div>
            ))}
          </div>
        ) : null}
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
