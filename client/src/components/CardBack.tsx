import { initials, readableCardAccent, type TradingCardData } from "../lib/cards";
import { useLeague } from "../league/LeagueProvider";
import { TeamLogo } from "./TeamLogo";

/** Reverse side of a printed trading card, themed to match its front. */
export function CardBack({ card }: { card: TradingCardData }) {
  const league = useLeague();
  const logo = league.branding.logo || undefined;
  const mark = initials(league.shortName || league.name);
  const accent = card.theme?.border ? readableCardAccent(card.theme.border) : undefined;
  const faceStyle = {
    ...(card.theme?.background ? { ["--tc-bg" as string]: card.theme.background } : {}),
    ...(card.theme?.border ? { ["--tc-border" as string]: card.theme.border } : {}),
    ...(accent ? { ["--tc-accent" as string]: accent } : {})
  };

  return (
    <article className="trading-card tc-back" data-export-initials={mark}>
      <div className="trading-card-face" style={faceStyle}>
        <div className="tc-frame tc-back-frame">
          <div className="tc-back-mark">
            <TeamLogo
              name={league.name}
              src={logo}
              className="tc-back-logo"
              fallback={mark}
              exportSrc={logo && /^https?:/i.test(logo) ? "/api/league-logo" : logo}
            />
          </div>
          <div className="tc-back-footer">
            <span className="tc-back-season">{card.season}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
