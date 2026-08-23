import * as cheerio from "cheerio";
import type { Player, PlayersResponse, StatKey, Stats } from "./types.js";

const DEFAULT_STATS_URL = "https://www.playtuff.ca/list/2026-tuff-stats/";
const DEFAULT_LIST_SLUG = "2026-tuff-stats";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 300_000);

let cache: { expiresAt: number; data: PlayersResponse } | null = null;

const headerMap: Record<string, StatKey> = {
  gms: "gms",
  games: "gms",
  gp: "gms",
  tpqb: "tpqb",
  tpnqb: "tpnqb",
  patd: "paTD",
  rutd: "ruTD",
  rectd: "recTD",
  rettd: "retTD",
  comp: "comp",
  int: "int",
  sack: "sack",
  att: "att",
  pa1pt: "pa1PT",
  paonept: "pa1PT",
  ru1pt: "ru1PT",
  ruonept: "ru1PT",
  re1pt: "re1PT",
  reonept: "re1PT",
  pa2pt: "pa2PT",
  patwopt: "pa2PT",
  rec: "rec",
  ru2pt: "ru2PT",
  rutwopt: "ru2PT",
  re2pt: "re2PT",
  retwopt: "re2PT",
  ret2pt: "ret2PT",
  rettwopt: "ret2PT",
  safety: "safety",
  sty: "safety"
};

const emptyStats = (): Stats => ({
  gms: 0,
  tpqb: 0,
  tpnqb: 0,
  paTD: 0,
  ruTD: 0,
  recTD: 0,
  retTD: 0,
  comp: 0,
  int: 0,
  sack: 0,
  att: 0,
  pa1PT: 0,
  ru1PT: 0,
  re1PT: 0,
  pa2PT: 0,
  rec: 0,
  ru2PT: 0,
  re2PT: 0,
  ret2PT: 0,
  safety: 0
});

const toNumber = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const decodeEntities = (value: string) =>
  cheerio.load(`<textarea>${value}</textarea>`)("textarea").text();

const siteOrigin = () => new URL(process.env.TUFF_STATS_URL ?? DEFAULT_STATS_URL).origin;

function buildPlayer(name: string, stats: Stats, extras: { profileUrl?: string; team?: string; sourceId?: string } = {}): Player {
  const games = Math.max(stats.gms, 1);
  const totalTouchdowns = stats.paTD + stats.ruTD + stats.recTD + stats.retTD;
  // SportsPress/TUFF already exposes total points split by QB and non-QB.
  // Keep that as the canonical total rather than re-counting individual scoring fields.
  const totalPoints = stats.tpnqb + stats.tpqb;
  const id = extras.sourceId ? `${slugify(name)}-${extras.sourceId}` : slugify(name);

  return {
    id,
    name,
    profileUrl: extras.profileUrl,
    team: extras.team,
    sourceId: extras.sourceId,
    stats,
    derived: {
      totalTouchdowns,
      totalPoints,
      receptionsPerGame: Number((stats.rec / games).toFixed(2)),
      receivingTouchdownsPerGame: Number((stats.recTD / games).toFixed(2))
    }
  };
}

function statsFromRow(row: Record<string, unknown>): Stats {
  const stats = emptyStats();
  for (const [key, value] of Object.entries(row)) {
    const mapped = headerMap[key.toLowerCase()];
    if (mapped) stats[mapped] = toNumber(value);
  }
  return stats;
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

async function fetchJson<T>(url: string, timeoutMs = 10000): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "TUFF-Stats-MVP/0.1" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function loadTeamNames(): Promise<Map<number, string>> {
  const teams = await fetchJson<Array<{ id: number; title?: { rendered?: string } }>>(
    `${siteOrigin()}/wp-json/sportspress/v2/teams?per_page=100`
  );
  const map = new Map<number, string>();
  for (const team of teams ?? []) {
    const name = decodeEntities(team.title?.rendered ?? "").trim();
    if (name) map.set(team.id, name);
  }
  return map;
}

async function loadPlayerTeams(playerIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!playerIds.length) return map;

  for (const group of chunk(playerIds, 40)) {
    const players = await fetchJson<Array<{ id: number; current_teams?: number[]; teams?: number[] }>>(
      `${siteOrigin()}/wp-json/sportspress/v2/players?include=${group.join(",")}&per_page=${group.length}`
    );
    for (const player of players ?? []) {
      const teamId = player.current_teams?.[0] ?? player.teams?.[0];
      if (teamId) map.set(player.id, teamId);
    }
  }
  return map;
}

async function enrichPlayersWithTeams(players: Player[]): Promise<Player[]> {
  const sourceIds = players
    .map((player) => Number(player.sourceId))
    .filter((id) => Number.isFinite(id) && id > 0);

  const [teamNames, playerTeams] = await Promise.all([
    loadTeamNames(),
    loadPlayerTeams(sourceIds)
  ]);

  return players.map((player) => {
    const sourceId = Number(player.sourceId);
    const teamId = Number.isFinite(sourceId) ? playerTeams.get(sourceId) : undefined;
    const team = teamId ? teamNames.get(teamId) : undefined;
    return team ? { ...player, team } : player;
  });
}

async function fromSportsPress(): Promise<Player[] | null> {
  const listSlug = process.env.TUFF_LIST_SLUG ?? DEFAULT_LIST_SLUG;
  const endpoint = `${siteOrigin()}/wp-json/sportspress/v2/lists?slug=${encodeURIComponent(listSlug)}&per_page=10`;
  const payload = await fetchJson<Array<{ data?: Record<string, Record<string, unknown>> }>>(endpoint, 7000);
  const data = payload?.[0]?.data;
  if (!data) return null;

  const players = Object.entries(data)
    .filter(([key]) => key !== "0")
    .map(([sourceId, row]) => {
      const rawName = row.name ?? row.player ?? row.title;
      const name = typeof rawName === "string" ? decodeEntities(rawName).trim() : "";
      if (!name || name.toLowerCase() === "player") return null;
      return buildPlayer(name, statsFromRow(row), { sourceId });
    })
    .filter((player): player is Player => Boolean(player));

  return players.length ? players : null;
}

async function fromHtml(): Promise<Player[]> {
  const statsUrl = process.env.TUFF_STATS_URL ?? DEFAULT_STATS_URL;
  const response = await fetch(statsUrl, {
    headers: { "User-Agent": "TUFF-Stats-MVP/0.1" },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`TUFF stats page returned ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  const table = $("table").filter((_, element) => {
    const headings = $(element).find("thead th, tr:first-child th").map((_, th) => $(th).text().trim()).get();
    return headings.some((heading) => heading.toLowerCase() === "player") && headings.some((heading) => heading.toLowerCase() === "rectd");
  }).first();

  if (!table.length) throw new Error("Could not find the 2026 TUFF stats table");

  const headers = table.find("thead th, tr:first-child th").map((_, th) => $(th).text().trim()).get();
  const playerColumn = headers.findIndex((header) => header.toLowerCase() === "player");

  // Prefer SportsPress IDs from the same list so HTML fallback can still attach teams.
  const listSlug = process.env.TUFF_LIST_SLUG ?? DEFAULT_LIST_SLUG;
  const listPayload = await fetchJson<Array<{ data?: Record<string, Record<string, unknown>> }>>(
    `${siteOrigin()}/wp-json/sportspress/v2/lists?slug=${encodeURIComponent(listSlug)}&per_page=10`,
    7000
  );
  const nameToSourceId = new Map<string, string>();
  for (const [sourceId, row] of Object.entries(listPayload?.[0]?.data ?? {})) {
    if (sourceId === "0") continue;
    const rawName = row.name ?? row.player ?? row.title;
    if (typeof rawName === "string") nameToSourceId.set(decodeEntities(rawName).trim().toLowerCase(), sourceId);
  }

  const players: Player[] = [];
  table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (!cells.length) return;

    const playerCell = cells.eq(playerColumn >= 0 ? playerColumn : 0);
    const name = playerCell.text().replace(/\s+/g, " ").trim();
    if (!name || name.toLowerCase() === "player") return;

    const href = playerCell.find("a").attr("href");
    const stats = emptyStats();

    headers.forEach((header, index) => {
      const key = headerMap[header.toLowerCase()];
      if (key) stats[key] = toNumber(cells.eq(index).text());
    });

    players.push(
      buildPlayer(name, stats, {
        profileUrl: href,
        sourceId: nameToSourceId.get(name.toLowerCase())
      })
    );
  });

  if (!players.length) throw new Error("Stats table was found but no player rows could be parsed");
  return players;
}

export async function getPlayers(force = false): Promise<PlayersResponse> {
  if (!force && cache && Date.now() < cache.expiresAt) return cache.data;

  let players: Player[] | null = null;
  let source: PlayersResponse["meta"]["source"] = "html";

  try {
    players = await fromSportsPress();
    if (players?.length) source = "sportspress";
  } catch {
    players = null;
  }

  if (!players?.length) {
    players = await fromHtml();
    source = "html";
  }

  players = await enrichPlayersWithTeams(players);
  const teams = [...new Set(players.map((player) => player.team).filter((team): team is string => Boolean(team)))].sort((a, b) =>
    a.localeCompare(b)
  );

  const data: PlayersResponse = {
    players,
    meta: {
      source,
      fetchedAt: new Date().toISOString(),
      total: players.length,
      teams
    }
  };

  cache = { expiresAt: Date.now() + CACHE_TTL_MS, data };
  return data;
}
