import { teamLogoUrl } from "./teams";
import type { CardTemplateId } from "./cardTemplates";
import type { Player, Stats } from "../types";

export const CARD_FACE_SLOTS = 5;

export type CardStatLine = {
  label: string;
  value: string;
};

export type PhotoPosition = {
  x: number;
  y: number;
};

export type CardTheme = {
  background?: string;
  border?: string;
};

export const DEFAULT_PHOTO_POSITION: PhotoPosition = { x: 50, y: 15 };

/** Keep accent labels readable on the dark stat bar when team colors are dim. */
export function readableCardAccent(color: string): string {
  const hex = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) return color;

  const raw = match[1];
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => part + part)
          .join("")
      : raw;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance >= 0.42) return `#${full.toLowerCase()}`;

  const lift = Math.min(0.82, 0.38 + (0.42 - luminance) * 1.15);
  const lighten = (channel: number) => Math.round(channel + (255 - channel) * lift);
  const toHex = (channel: number) => lighten(channel).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function isFilledStatLine(item: CardStatLine) {
  return Boolean(item.label.trim() || item.value.trim());
}

/** Drop unused write-in slots so the face matches the sidebar; keep blanks when every slot is empty. */
export function visibleCardStats(items: CardStatLine[], maxStats = CARD_FACE_SLOTS): CardStatLine[] {
  const limit = Math.max(0, Math.min(maxStats, CARD_FACE_SLOTS));
  const capped = items.slice(0, CARD_FACE_SLOTS);
  const filled = capped.filter(isFilledStatLine);
  return (filled.length ? filled : capped).slice(0, limit);
}

export type TradingCardData = {
  id: string;
  name: string;
  team?: string;
  number?: number | string;
  season: string;
  stats: Stats;
  derived: Player["derived"];
  logoUrl?: string;
  photoUrl?: string;
  photoPosition?: PhotoPosition;
  lineItems?: CardStatLine[];
  note?: string;
  titleLine?: string;
  template?: CardTemplateId;
  theme?: CardTheme;
};

export function cardTitleLine(team?: string | null, season?: string | null): string {
  const teamName = (team ?? "").trim();
  const year = (season ?? "").trim();
  if (teamName && year) return `${teamName} · ${year}`;
  return teamName || year;
}

export function normalizeJersey(value: string): string {
  return value.replace(/\D/g, "").slice(0, 3);
}

export const CARDS_PER_PAGE = 9;

export function splitPlayerName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: "", last: parts[0] ?? name };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export function chunkCards<T>(items: T[], size = CARDS_PER_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

export function toTradingCard(
  player: Player,
  season: string,
  teamLogos?: Record<string, string>,
  extras: Partial<
    Pick<
      TradingCardData,
      | "number"
      | "name"
      | "team"
      | "stats"
      | "derived"
      | "lineItems"
      | "note"
      | "titleLine"
      | "photoUrl"
      | "photoPosition"
      | "template"
      | "theme"
    >
  > = {}
): TradingCardData {
  const team = extras.team ?? player.team;
  const stats = extras.stats ?? player.stats;
  return {
    id: player.id,
    name: extras.name ?? player.name,
    team,
    number: extras.number,
    season,
    stats,
    derived: extras.derived ?? player.derived,
    logoUrl: teamLogoUrl(team, teamLogos),
    photoUrl: extras.photoUrl,
    photoPosition: extras.photoPosition,
    lineItems: extras.lineItems,
    note: extras.note,
    titleLine: extras.titleLine,
    template: extras.template,
    theme: extras.theme
  };
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
