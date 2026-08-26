import { tuffLeague } from "../leagues/tuff.js";
import type { LeagueSourceConfig } from "../leagues/types.js";
import type { TeamStanding } from "../domain/types.js";
import { toNumber } from "./stats.js";

export type { TeamStanding };

export function standingsSlugCandidates(
  year: string,
  source: LeagueSourceConfig = tuffLeague.source
): string[] {
  const y = year.trim();
  const suffixes = Number(y) >= source.standings.modernFromYear ? source.standings.modern : source.standings.legacy;
  return suffixes.map((suffix) => `${y}-${suffix}`);
}

/** Template leagues (Bush) try `bush-league-2026` then a bare `2026` slug. */
export function standingsTableSlugs(
  year: string,
  source: LeagueSourceConfig = tuffLeague.source
): string[] {
  const y = year.trim();
  if (source.standingsSlugTemplate) {
    return [...new Set([source.standingsSlugTemplate.replaceAll("{year}", y), y])];
  }
  return standingsSlugCandidates(y, source);
}

function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function parseStandingsTable(
  data: Record<string, Record<string, unknown>> | null | undefined
): TeamStanding[] {
  if (!data) return [];

  const rows: TeamStanding[] = [];
  for (const [key, row] of Object.entries(data)) {
    if (key === "0") continue;
    const name = stripHtml(row.name ?? row.team);
    if (!name || name.toLowerCase() === "team") continue;

    rows.push({
      name,
      pos: toNumber(row.pos) || undefined,
      wins: toNumber(row.w ?? row.tw),
      losses: toNumber(row.l ?? row["l-2"]),
      ties: toNumber(row.t ?? row.tie ?? row.d ?? row["t-2"]),
      pct: toNumber(row.pct),
      pointsFor: toNumber(row.pf ?? row.rs ?? row.f),
      pointsAgainst: toNumber(row.pa ?? row.ra ?? row.a),
      netPoints: toNumber(row.netpts ?? row.diff ?? row.gd),
      standingsPoints: toNumber(row.sp ?? row.points ?? row.pts),
      streak: stripHtml(row.streak ?? row.strk) || undefined
    });
  }

  return rows.sort(
    (a, b) =>
      (a.pos ?? 999) - (b.pos ?? 999) ||
      b.wins - a.wins ||
      b.standingsPoints - a.standingsPoints ||
      a.name.localeCompare(b.name)
  );
}
