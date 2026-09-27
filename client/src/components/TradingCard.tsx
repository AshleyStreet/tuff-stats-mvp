import { useLayoutEffect, useRef } from "react";
import {
  DEFAULT_PHOTO_POSITION,
  initials,
  readableCardAccent,
  teamLogoProxyUrl,
  visibleCardStats,
  type CardStatLine,
  type TradingCardData
} from "../lib/cards";
import { cardTemplate } from "../lib/cardTemplates";
import { usePresentation } from "../league/LeagueProvider";
import { readStat } from "../league/readStat";
import { TeamLogo } from "./TeamLogo";

/** Smallest the nameplate will shrink a long name before falling back to an ellipsis. */
const MIN_NAME_SCALE = 0.6;

/**
 * Shrink the name just enough to fit its plate. Stored as a CSS scale factor rather than a px size so
 * exports that re-render the card at a larger width keep the same proportions.
 */
function useFitName(text: string) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;

    const fit = () => {
      el.style.setProperty("--tc-name-scale", "1");
      const available = el.clientWidth;
      const needed = el.scrollWidth;
      if (!available || needed <= available) {
        el.style.removeProperty("--tc-name-scale");
        return;
      }
      let scale = Math.max(MIN_NAME_SCALE, Math.floor((available / needed) * 100) / 100);
      el.style.setProperty("--tc-name-scale", String(scale));
      // Letter-spacing doesn't scale with the font, so nudge down until it really fits.
      while (scale > MIN_NAME_SCALE && el.scrollWidth > el.clientWidth) {
        scale = Math.max(MIN_NAME_SCALE, Math.round((scale - 0.02) * 100) / 100);
        el.style.setProperty("--tc-name-scale", String(scale));
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };

    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(el);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [text]);

  return ref;
}

interface Props {
  card: TradingCardData;
  selected?: boolean;
  onSelect?: () => void;
}

export function TradingCard({ card, selected, onSelect }: Props) {
  const presentation = usePresentation();
  const template = cardTemplate(card.template ?? "classic");
  const jersey = card.number != null && String(card.number).trim() ? String(card.number).trim() : "";
  const className = [
    "trading-card",
    `tc-layout-${template.id}`,
    selected ? "selected" : "",
    onSelect ? "interactive" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const fallbackLine: CardStatLine[] = presentation.cardDefaults.map((column) => ({
    label: column.short,
    value: String(readStat(card, column.key))
  }));
  const stats = visibleCardStats(card.lineItems?.length ? card.lineItems : fallbackLine);
  const displayName = card.name.trim().toUpperCase();
  const nameRef = useFitName(displayName);
  const titleLine = card.titleLine?.trim() ?? "";
  const position = card.photoPosition ?? DEFAULT_PHOTO_POSITION;
  const accent = card.theme?.border ? readableCardAccent(card.theme.border) : undefined;
  const faceStyle = {
    ...(card.theme?.background ? { ["--tc-bg" as string]: card.theme.background } : {}),
    ...(card.theme?.border ? { ["--tc-border" as string]: card.theme.border } : {}),
    ...(accent ? { ["--tc-accent" as string]: accent } : {})
  };

  const face = (
    <div className="trading-card-face" style={faceStyle}>
      <div className="tc-frame">
        {jersey ? <span className="tc-num">{jersey}</span> : null}

        <div className="tc-hero">
          {card.photoUrl ? (
            <img
              className="tc-photo"
              src={card.photoUrl}
              alt=""
              style={{
                objectPosition: `${position.x}% ${position.y}%`,
                ...(position.zoom && position.zoom > 1
                  ? { transform: `scale(${position.zoom})`, transformOrigin: `${position.x}% ${position.y}%` }
                  : {})
              }}
            />
          ) : (
            <div className="tc-hero-fallback" aria-hidden="true">
              <TeamLogo
                name={card.team || card.name}
                src={card.logoUrl}
                exportSrc={card.logoUrl && card.team ? teamLogoProxyUrl(card.team, card.season) : undefined}
                className="tc-hero-logo"
                fallback={initials(card.name)}
              />
            </div>
          )}
          <div className="tc-hero-shade" aria-hidden="true" />
        </div>

        <div className="tc-nameplate">
          <strong className="tc-name" ref={nameRef} title={displayName}>
            {displayName}
          </strong>
          {titleLine ? <span className="tc-title">{titleLine}</span> : null}
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
