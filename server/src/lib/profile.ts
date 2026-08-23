import { emptyStats, buildPlayer } from "./stats.js";
import { statKeys, type Player, type Stats } from "../types.js";

export type SeasonAppearance = {
  season: string;
  team?: string;
  stats: Stats;
  derived: Player["derived"];
};

export function sumStats(left: Stats, right: Stats): Stats {
  const total = emptyStats();
  for (const key of statKeys) {
    total[key] = (left[key] ?? 0) + (right[key] ?? 0);
  }
  return total;
}

export function careerFromSeasons(name: string, seasons: SeasonAppearance[], sourceId?: string): Player {
  const stats = seasons.reduce((acc, season) => sumStats(acc, season.stats), emptyStats());
  return buildPlayer(name, stats, { sourceId, team: seasons[0]?.team });
}

export function extractSourceId(playerId: string): string | null {
  const match = playerId.match(/-(\d+)$/);
  return match?.[1] ?? (/^\d+$/.test(playerId) ? playerId : null);
}
