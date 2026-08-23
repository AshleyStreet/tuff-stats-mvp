import { emptyStats, buildPlayer } from "./stats.js";
import { statKeys, type Player, type Stats } from "../types.js";

export type SeasonAppearance = {
  season: string;
  team?: string;
  stats: Stats;
  derived: Player["derived"];
  sourceId?: string;
  linked?: boolean;
};

export type SeasonCandidate = {
  season: string;
  sourceId: string;
  name: string;
  team?: string;
  number?: number | string;
  stats: Stats;
  derived: Player["derived"];
};

export function normalizePlayerName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

function jerseyKey(value?: number | string) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim().replace(/^#/, "");
  return normalized || null;
}

/** Same person across SportsPress ID changes: jersey match or adjacent-season same team. */
export function canSoftLink(
  candidate: Pick<SeasonCandidate, "season" | "team" | "number">,
  known: Array<Pick<SeasonAppearance, "season" | "team"> & { number?: number | string }>,
  primaryJersey?: number | string
): boolean {
  const candidateJersey = jerseyKey(candidate.number);
  const primary = jerseyKey(primaryJersey);
  if (candidateJersey && primary && candidateJersey === primary) return true;

  for (const row of known) {
    const knownJersey = jerseyKey(row.number);
    if (candidateJersey && knownJersey && candidateJersey === knownJersey) return true;

    if (!candidate.team || !row.team) continue;
    if (candidate.team.toLowerCase() !== row.team.toLowerCase()) continue;
    if (Math.abs(Number(candidate.season) - Number(row.season)) === 1) return true;
  }

  return false;
}

/**
 * Build career rows: exact sourceId matches first, then soft-link other IDs with the
 * same display name only when jersey or adjacent-team continuity suggests one person.
 * Never merges two same-name players who lack that continuity (e.g. different Colins).
 */
export function collectCareerAppearances(
  primarySourceId: string,
  primaryName: string,
  candidates: SeasonCandidate[],
  primaryJersey?: number | string
): { appearances: SeasonAppearance[]; linkedSourceIds: string[] } {
  const nameKey = normalizePlayerName(primaryName);
  const exact = candidates
    .filter((row) => row.sourceId === primarySourceId)
    .map((row) => ({
      season: row.season,
      team: row.team,
      stats: row.stats,
      derived: row.derived,
      sourceId: row.sourceId,
      linked: false,
      number: row.number
    }))
    .sort((a, b) => Number(b.season) - Number(a.season));

  const known = exact.map((row) => ({
    season: row.season,
    team: row.team,
    number: row.number ?? primaryJersey
  }));
  const claimedSeasons = new Set(exact.map((row) => row.season));
  const linkedSourceIds = new Set<string>();

  const softPool = candidates
    .filter(
      (row) =>
        row.sourceId !== primarySourceId &&
        normalizePlayerName(row.name) === nameKey &&
        !claimedSeasons.has(row.season)
    )
    .sort((a, b) => Number(b.season) - Number(a.season));

  // Grow the linked set until no more continuity edges remain.
  let grew = true;
  const softAccepted: SeasonAppearance[] = [];
  while (grew) {
    grew = false;
    for (const candidate of softPool) {
      if (claimedSeasons.has(candidate.season)) continue;
      if (softAccepted.some((row) => row.sourceId === candidate.sourceId && row.season === candidate.season)) {
        continue;
      }
      if (!canSoftLink(candidate, known, primaryJersey)) continue;

      claimedSeasons.add(candidate.season);
      linkedSourceIds.add(candidate.sourceId);
      known.push({
        season: candidate.season,
        team: candidate.team,
        number: candidate.number ?? primaryJersey
      });
      softAccepted.push({
        season: candidate.season,
        team: candidate.team,
        stats: candidate.stats,
        derived: candidate.derived,
        sourceId: candidate.sourceId,
        linked: true
      });
      grew = true;
    }
  }

  const appearances = [...exact.map(({ number: _number, ...row }) => row), ...softAccepted].sort(
    (a, b) => Number(b.season) - Number(a.season)
  );

  return { appearances, linkedSourceIds: [...linkedSourceIds] };
}
