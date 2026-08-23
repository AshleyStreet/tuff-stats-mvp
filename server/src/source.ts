import * as cheerio from "cheerio";
import {
  buildPlayer,
  chunk,
  decodeEntities,
  emptyStats,
  headerMap,
  isStatsList,
  statsFromRow,
  teamNameFromRosterTitle,
  toNumber,
  yearFromStatsList
} from "./lib/stats.js";
import type { Player, PlayersResponse, SeasonInfo } from "./types.js";

const SITE_ORIGIN = new URL(process.env.TUFF_STATS_URL ?? "https://www.playtuff.ca/list/2026-tuff-stats/").origin;
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 300_000);
const DEFAULT_SEASON = "2026";

type SpList = {
  id: number;
  slug: string;
  title?: { rendered?: string };
  seasons?: number[];
  data?: Record<string, Record<string, unknown>>;
  link?: string;
};

const cache = new Map<string, { expiresAt: number; data: PlayersResponse }>();
let seasonsCache: { expiresAt: number; seasons: SeasonInfo[] } | null = null;
let listsCache: { expiresAt: number; lists: SpList[] } | null = null;
let listsInflight: Promise<SpList[]> | null = null;

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

async function fetchAllLists(): Promise<SpList[]> {
  if (listsCache && Date.now() < listsCache.expiresAt) return listsCache.lists;
  if (listsInflight) return listsInflight;

  listsInflight = (async () => {
    const lists: SpList[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const batch = await fetchJson<SpList[]>(
        `${SITE_ORIGIN}/wp-json/sportspress/v2/lists?per_page=100&page=${page}`,
        15000
      );
      if (!batch?.length) break;
      lists.push(...batch);
      if (batch.length < 100) break;
    }
    listsCache = { expiresAt: Date.now() + CACHE_TTL_MS, lists };
    return lists;
  })().finally(() => {
    listsInflight = null;
  });

  return listsInflight;
}

export async function getSeasons(force = false): Promise<SeasonInfo[]> {
  if (!force && seasonsCache && Date.now() < seasonsCache.expiresAt) {
    return seasonsCache.seasons;
  }

  const lists = await fetchAllLists();
  const byYear = new Map<string, SeasonInfo>();

  for (const list of lists) {
    if (!isStatsList(list)) continue;
    const year = yearFromStatsList(list);
    if (!year) continue;
    byYear.set(year, {
      year,
      label: `${year} Season`,
      slug: list.slug,
      seasonId: list.seasons?.[0],
      url: list.link ?? `${SITE_ORIGIN}/list/${list.slug}/`
    });
  }

  const seasons = [...byYear.values()].sort((a, b) => Number(b.year) - Number(a.year));
  seasonsCache = { expiresAt: Date.now() + CACHE_TTL_MS, seasons };
  return seasons;
}

async function resolveSeason(year?: string): Promise<SeasonInfo> {
  const seasons = await getSeasons();
  const requested = year?.trim() || DEFAULT_SEASON;
  return seasons.find((season) => season.year === requested) ?? seasons[0] ?? {
    year: DEFAULT_SEASON,
    label: `${DEFAULT_SEASON} Season`,
    slug: `${DEFAULT_SEASON}-tuff-stats`,
    url: `${SITE_ORIGIN}/list/${DEFAULT_SEASON}-tuff-stats/`
  };
}

const MODERN_TEAM_SLUGS = [
  "brawlers",
  "bulldogs",
  "cobras",
  "knights",
  "lumberjacks",
  "menace",
  "rhinos",
  "sirens",
  "stallions",
  "wildcats",
  "wolfhounds",
  "yetis"
];

async function loadSeasonRosterTeams(season: SeasonInfo): Promise<Map<number, string>> {
  const lists = await fetchAllLists();
  const rosterLists = lists.filter((list) => {
    if (isStatsList(list)) return false;
    return list.slug.toLowerCase().startsWith(`${season.year}-`);
  });

  const slugs = new Set(rosterLists.map((list) => list.slug.toLowerCase()));
  // Modern seasons publish predictable roster slugs; fill gaps if the index call was truncated/rate-limited.
  if (Number(season.year) >= 2022) {
    for (const team of MODERN_TEAM_SLUGS) {
      slugs.add(`${season.year}-${team}`);
    }
  }

  const map = new Map<number, string>();
  const slugList = [...slugs];

  for (const group of chunk(slugList, 3)) {
    await Promise.all(
      group.map(async (slug) => {
        const fromIndex = rosterLists.find((list) => list.slug.toLowerCase() === slug);
        const data =
          fromIndex?.data ??
          (
            await fetchJson<SpList[]>(
              `${SITE_ORIGIN}/wp-json/sportspress/v2/lists?slug=${encodeURIComponent(slug)}&per_page=1`,
              15000
            )
          )?.[0]?.data;
        if (!data) return;

        const title = fromIndex?.title?.rendered ?? slug;
        const teamName = teamNameFromRosterTitle(title, season.year);
        if (!teamName) return;

        for (const sourceId of Object.keys(data)) {
          if (sourceId === "0") continue;
          const id = Number(sourceId);
          if (Number.isFinite(id)) map.set(id, teamName);
        }
      })
    );
  }

  return map;
}

async function loadCurrentTeamsFallback(playerIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!playerIds.length) return map;

  const teams = await fetchJson<Array<{ id: number; title?: { rendered?: string } }>>(
    `${SITE_ORIGIN}/wp-json/sportspress/v2/teams?per_page=100`
  );
  const teamNames = new Map<number, string>();
  for (const team of teams ?? []) {
    const name = decodeEntities(team.title?.rendered ?? "").trim();
    if (name) teamNames.set(team.id, name);
  }

  for (const group of chunk(playerIds, 40)) {
    const players = await fetchJson<Array<{ id: number; current_teams?: number[]; teams?: number[] }>>(
      `${SITE_ORIGIN}/wp-json/sportspress/v2/players?include=${group.join(",")}&per_page=${group.length}`
    );
    for (const player of players ?? []) {
      const teamId = player.current_teams?.[0] ?? player.teams?.filter((id) => id > 0).at(-1);
      const team = teamId ? teamNames.get(teamId) : undefined;
      if (team) map.set(player.id, team);
    }
  }

  return map;
}

async function enrichPlayersWithTeams(players: Player[], season: SeasonInfo): Promise<Player[]> {
  const sourceIds = players
    .map((player) => Number(player.sourceId))
    .filter((id) => Number.isFinite(id) && id > 0);

  const rosterTeams = await loadSeasonRosterTeams(season);

  // Only fall back to "current team" for the live season — historical rosters are the source of truth.
  if (season.year === DEFAULT_SEASON) {
    const missing = sourceIds.filter((id) => !rosterTeams.has(id));
    if (missing.length) {
      const fallback = await loadCurrentTeamsFallback(missing);
      for (const [id, team] of fallback) rosterTeams.set(id, team);
    }
  }

  return players.map((player) => {
    const sourceId = Number(player.sourceId);
    const team = Number.isFinite(sourceId) ? rosterTeams.get(sourceId) : undefined;
    return team ? { ...player, team } : player;
  });
}

async function fromSportsPress(season: SeasonInfo): Promise<Player[] | null> {
  const endpoint = `${SITE_ORIGIN}/wp-json/sportspress/v2/lists?slug=${encodeURIComponent(season.slug)}&per_page=1`;
  const payload = await fetchJson<SpList[]>(endpoint, 10000);
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

async function fromHtml(season: SeasonInfo): Promise<Player[]> {
  const statsUrl = season.url ?? `${SITE_ORIGIN}/list/${season.slug}/`;
  const response = await fetch(statsUrl, {
    headers: { "User-Agent": "TUFF-Stats-MVP/0.1" },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`TUFF stats page returned ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  const table = $("table").filter((_, element) => {
    const headings = $(element).find("thead th, tr:first-child th").map((_, th) => $(th).text().trim().toLowerCase()).get();
    return headings.includes("player") && (headings.includes("rectd") || headings.includes("rec"));
  }).first();

  if (!table.length) throw new Error(`Could not find the ${season.year} TUFF stats table`);

  const headers = table.find("thead th, tr:first-child th").map((_, th) => $(th).text().trim()).get();
  const playerColumn = headers.findIndex((header) => header.toLowerCase() === "player");

  const listPayload = await fetchJson<SpList[]>(
    `${SITE_ORIGIN}/wp-json/sportspress/v2/lists?slug=${encodeURIComponent(season.slug)}&per_page=1`,
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

export async function getPlayers(force = false, seasonYear?: string): Promise<PlayersResponse> {
  const season = await resolveSeason(seasonYear);
  const cached = cache.get(season.year);
  if (!force && cached && Date.now() < cached.expiresAt) return cached.data;

  let players: Player[] | null = null;
  let source: PlayersResponse["meta"]["source"] = "html";

  try {
    players = await fromSportsPress(season);
    if (players?.length) source = "sportspress";
  } catch {
    players = null;
  }

  if (!players?.length) {
    players = await fromHtml(season);
    source = "html";
  }

  players = await enrichPlayersWithTeams(players, season);
  const teams = [...new Set(players.map((player) => player.team).filter((team): team is string => Boolean(team)))].sort((a, b) =>
    a.localeCompare(b)
  );

  const data: PlayersResponse = {
    players,
    meta: {
      source,
      fetchedAt: new Date().toISOString(),
      total: players.length,
      teams,
      season: season.year,
      seasonLabel: season.label
    }
  };

  cache.set(season.year, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  return data;
}
