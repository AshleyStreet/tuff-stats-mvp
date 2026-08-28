import { teamLogoUrl } from "./teams";
import type { Player, Stats } from "../types";

export type CardStatLine = {
  label: string;
  value: string;
};

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
  lineItems?: CardStatLine[];
  note?: string;
};

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
      "number" | "name" | "team" | "stats" | "derived" | "lineItems" | "note" | "photoUrl"
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
    lineItems: extras.lineItems,
    note: extras.note
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
