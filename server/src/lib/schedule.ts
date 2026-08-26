import type { SpEvent } from "../adapters/sportspress/types.js";
import type {
  BoxScorePlayer,
  BoxScoreSide,
  GameDetail,
  GameLogEntry,
  PlayerGameLog,
  ScheduleGame,
  ScheduleSide
} from "../domain/types.js";
import { statsFromRow, toNumber } from "./stats.js";

export type {
  BoxScorePlayer,
  BoxScoreSide,
  GameDetail,
  GameLogEntry,
  PlayerGameLog,
  ScheduleGame,
  ScheduleSide
};

export function applyTeamLogos(games: ScheduleGame[], logos: Map<number, string>): ScheduleGame[] {
  if (!games.length || !logos.size) return games;
  let anyChanged = false;
  const next = games.map((game) => {
    let changed = false;
    const teams = game.teams.map((side) => {
      const logoUrl = logos.get(side.id);
      if (!logoUrl || side.logoUrl === logoUrl) return side;
      changed = true;
      return { ...side, logoUrl };
    });
    if (!changed) return game;
    anyChanged = true;
    return { ...game, teams };
  });
  return anyChanged ? next : games;
}

export function extractPlayerGameLog(
  boxed: Array<{ game: ScheduleGame; sides: BoxScoreSide[] }>,
  sourceIds: Iterable<string>
): GameLogEntry[] {
  const ids = new Set([...sourceIds].map(String));
  const rows: GameLogEntry[] = [];
  for (const { game, sides } of boxed) {
    for (const side of sides) {
      const player = side.players.find((row) => ids.has(row.sourceId));
      if (!player) continue;
      const opponent = sides.find((other) => other.id !== side.id);
      rows.push({
        game,
        team: side.name,
        opponent: opponent?.name ?? "Opponent",
        outcome: side.outcome,
        score: side.score,
        oppScore: opponent?.score,
        stats: player.stats,
        derived: player.derived,
        number: player.number
      });
      break;
    }
  }
  return rows.sort((a, b) => b.game.date.localeCompare(a.game.date) || a.game.id - b.game.id);
}

function jerseySortValue(value?: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 9999;
}

/** SportsPress `performance` is keyed by team id, then player id (skip `"0"` header rows). */
export function parseBoxScore(
  performance: Record<string, Record<string, Record<string, unknown>>> | null | undefined,
  sides: ScheduleSide[],
  playerNames: Map<number, string> = new Map()
): BoxScoreSide[] {
  return sides.map((side) => {
    const block = performance?.[String(side.id)] ?? {};
    const players: BoxScorePlayer[] = [];

    for (const [key, row] of Object.entries(block)) {
      if (key === "0" || !row || typeof row !== "object" || Array.isArray(row)) continue;
      const sourceId = Number(key);
      if (!Number.isFinite(sourceId) || sourceId <= 0) continue;

      const stats = statsFromRow(row);
      const rawNumber = String(row.number ?? "").trim();
      const rawName = typeof row.name === "string" ? row.name.trim() : "";
      const name = playerNames.get(sourceId) || rawName || `Player ${sourceId}`;
      players.push({
        sourceId: String(sourceId),
        name,
        number: rawNumber || undefined,
        stats,
        derived: { totalTouchdowns: stats.paTD + stats.ruTD + stats.recTD + stats.retTD }
      });
    }

    players.sort(
      (a, b) =>
        jerseySortValue(a.number) - jerseySortValue(b.number) || a.name.localeCompare(b.name)
    );

    return { ...side, players };
  });
}

function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&#8211;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function outcomeOf(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0] ? String(value[0]) : undefined;
  if (typeof value === "string" && value) return value;
  return undefined;
}

/** SportsPress event titles are usually "Home vs Away". */
export function namesFromEventTitle(title: string): [string, string] | null {
  const cleaned = stripHtml(title);
  const parts = cleaned.split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) return null;
  const home = parts[0]?.trim();
  const away = parts[1]?.trim();
  if (!home || !away) return null;
  return [home, away];
}

function isPlaceholderTeamName(name: string, id: number) {
  return !name || name === `Team ${id}`;
}

/** Fix placeholder "Team 114" names from cache using a fresh team map and/or event title. */
/**
 * SportsPress stores event lineups as `[0, ...team0, 0, ...team1]`.
 * Map each player id onto the matching team name.
 */
export function mapEventLineup(
  teamIds: number[],
  playerIds: number[],
  teamNames: Map<number, string>
): Array<{ playerId: number; team: string }> {
  const groups: number[][] = [];
  let current: number[] = [];
  for (const id of playerIds) {
    if (id === 0) {
      if (current.length) groups.push(current);
      current = [];
      continue;
    }
    if (id > 0) current.push(id);
  }
  if (current.length) groups.push(current);

  const rows: Array<{ playerId: number; team: string }> = [];
  const count = Math.min(groups.length, teamIds.length);
  for (let index = 0; index < count; index += 1) {
    const team = teamNames.get(teamIds[index]!)?.trim();
    if (!team) continue;
    for (const playerId of groups[index]!) {
      rows.push({ playerId, team });
    }
  }
  return rows;
}

export function hydrateScheduleGames(games: ScheduleGame[], teamNames: Map<number, string>): ScheduleGame[] {
  let anyChanged = false;
  const next = games.map((game) => {
    const fromTitle = namesFromEventTitle(game.title);
    let changed = false;
    const teams = game.teams.map((side, index) => {
      if (!isPlaceholderTeamName(side.name, side.id)) return side;
      const name = teamNames.get(side.id)?.trim() || fromTitle?.[index];
      if (!name || name === side.name) return side;
      changed = true;
      return { ...side, name };
    });
    if (!changed) return game;
    anyChanged = true;
    return { ...game, teams };
  });
  return anyChanged ? next : games;
}

export function parseScheduleEvent(
  event: SpEvent,
  teamNames: Map<number, string>,
  venueNames: Map<number, string>,
  now = Date.now()
): ScheduleGame | null {
  const teamIds = (event.teams ?? [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (teamIds.length < 2) return null;

  const title = stripHtml(event.title?.rendered ?? "");
  const titleNames = namesFromEventTitle(title);

  const main = Array.isArray(event.main_results) ? event.main_results.map((value) => toNumber(value)) : [];
  const sides: ScheduleSide[] = teamIds.map((id, index) => {
    const row = event.results?.[String(id)];
    const rawPoints =
      row && typeof row === "object" && !Array.isArray(row)
        ? (row as Record<string, unknown>).points
        : undefined;
    const scored =
      rawPoints !== undefined && rawPoints !== null && String(rawPoints).trim() !== ""
        ? toNumber(rawPoints)
        : main.length > index
          ? main[index]
          : undefined;
    const outcome =
      row && typeof row === "object" && !Array.isArray(row)
        ? outcomeOf((row as Record<string, unknown>).outcome)
        : undefined;
    const mapped = teamNames.get(id);
    const name =
      (mapped && mapped.trim()) ||
      titleNames?.[index] ||
      `Team ${id}`;
    return {
      id,
      name,
      score: scored,
      outcome
    };
  });

  if (main.length >= 2) {
    sides[0]!.score = main[0];
    sides[1]!.score = main[1];
  }

  const hasScores = sides.length >= 2 && sides.every((side) => typeof side.score === "number");
  const dateMs = event.date ? new Date(event.date).getTime() : NaN;
  let status: ScheduleGame["status"] = "unknown";
  if (hasScores) status = "final";
  else if (Number.isFinite(dateMs) && dateMs > now) status = "upcoming";
  else if (event.status === "future") status = "upcoming";
  else if (Number.isFinite(dateMs) && dateMs <= now) status = "unknown";

  return {
    id: event.id,
    date: event.date ?? "",
    status,
    title,
    link: event.link,
    venue: event.venues?.[0] ? venueNames.get(event.venues[0]) : undefined,
    teams: sides
  };
}

export function partitionSchedule(games: ScheduleGame[]) {
  const finals = games.filter((game) => game.status === "final").sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = games
    .filter((game) => game.status === "upcoming")
    .sort((a, b) => a.date.localeCompare(b.date));
  const other = games
    .filter((game) => game.status === "unknown")
    .sort((a, b) => b.date.localeCompare(a.date));
  return { finals, upcoming, other };
}
