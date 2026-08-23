import { toNumber } from "./stats.js";

export type ScheduleSide = {
  id: number;
  name: string;
  score?: number;
  outcome?: string;
};

export type ScheduleGame = {
  id: number;
  date: string;
  status: "final" | "upcoming" | "unknown";
  title: string;
  link?: string;
  venue?: string;
  teams: ScheduleSide[];
};

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
  event: {
    id: number;
    date?: string;
    status?: string;
    link?: string;
    title?: { rendered?: string };
    teams?: Array<number | string>;
    venues?: number[];
    main_results?: unknown;
    results?: Record<string, unknown>;
  },
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
