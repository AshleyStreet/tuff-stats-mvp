import * as cheerio from "cheerio";
import {
  buildPlayer,
  canonicalTeamName,
  chunk,
  decodeEntities,
  emptyStats,
  FRANCHISE_TEAM_NAMES,
  headerMap,
  isStatsList,
  statsFromRow,
  teamNameFromRosterTitle,
  toNumber,
  uniqueTeamAliases,
  yearFromStatsList
} from "./lib/stats.js";
import { careerFromSeasons, collectCareerAppearances, extractSourceId } from "./lib/profile.js";
import { listFingerprint, readCacheFile, writeCacheFile } from "./lib/cache.js";
import { hydrateScheduleGames, mapEventLineup, parseBoxScore, parseScheduleEvent, type GameDetail, type ScheduleGame } from "./lib/schedule.js";
import { parseStandingsTable, standingsSlugCandidates, type TeamStanding } from "./lib/standings.js";
import type { Player, PlayersResponse, SeasonInfo } from "./types.js";

const SITE_ORIGIN = new URL(process.env.TUFF_STATS_URL ?? "https://www.playtuff.ca/list/2026-tuff-stats/").origin;
const DEFAULT_SEASON = "2026";
const LIST_META_FIELDS = "id,slug,title,seasons,link,modified,modified_gmt";
const TEAM_ENRICHMENT_VERSION = "3";

type SpList = {
  id: number;
  slug: string;
  title?: { rendered?: string };
  seasons?: number[];
  data?: Record<string, Record<string, unknown>>;
  link?: string;
  modified?: string;
  modified_gmt?: string;
};

type SeasonCacheEntry = {
  fingerprint: string;
  data: PlayersResponse;
};

type ListsCacheEntry = {
  fingerprint: string;
  lists: SpList[];
};

const seasonCache = new Map<string, SeasonCacheEntry>();
let seasonsMemory: { fingerprint: string; seasons: SeasonInfo[] } | null = null;
let listsMemory: ListsCacheEntry | null = null;
let listsInflight: Promise<SpList[]> | null = null;

export type PlayerProfile = {
  id: string;
  sourceId: string;
  name: string;
  number?: number | string;
  profileUrl?: string;
  currentTeam?: string;
  teams: string[];
  linkedSourceIds?: string[];
  seasons: Array<{
    season: string;
    team?: string;
    stats: Player["stats"];
    derived: Player["derived"];
    sourceId?: string;
    linked?: boolean;
  }>;
  career: {
    seasonsPlayed: number;
    stats: Player["stats"];
    derived: Player["derived"];
  };
  meta: { fetchedAt: string };
};

const profileMemory = new Map<string, PlayerProfile>();
let teamNamesMemory: Map<number, string> | null = null;

type WarmState = {
  status: "idle" | "running" | "done";
  warmed: string[];
  failed: string[];
  startedAt: string | null;
  finishedAt: string | null;
};

let warmState: WarmState = {
  status: "idle",
  warmed: [],
  failed: [],
  startedAt: null,
  finishedAt: null
};

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

async function fetchResponse(url: string, timeoutMs = 10000): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "TUFF-Stats-MVP/0.1" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return null;
    return response;
  } catch {
    return null;
  }
}

async function fetchStatsListMeta(slug: string): Promise<SpList | null> {
  const payload = await fetchJson<SpList[]>(
    `${SITE_ORIGIN}/wp-json/sportspress/v2/lists?slug=${encodeURIComponent(slug)}&per_page=1&_fields=${LIST_META_FIELDS}`,
    12000
  );
  return payload?.[0] ?? null;
}

async function fetchAllLists(force = false): Promise<SpList[]> {
  if (!force && listsMemory) {
    const liveFingerprint = await fetchListsFingerprint();
    if (liveFingerprint && liveFingerprint === listsMemory.fingerprint) {
      return listsMemory.lists;
    }
  } else if (!force && !listsMemory) {
    const disk = readCacheFile<SpList[]>("lists.json");
    if (disk?.payload?.length) {
      const liveFingerprint = await fetchListsFingerprint();
      if (liveFingerprint && liveFingerprint === disk.fingerprint) {
        listsMemory = { fingerprint: disk.fingerprint, lists: disk.payload };
        return disk.payload;
      }
    }
  }

  if (listsInflight) return listsInflight;

  listsInflight = (async () => {
    const lists: SpList[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const batch = await fetchJson<SpList[]>(
        `${SITE_ORIGIN}/wp-json/sportspress/v2/lists?per_page=100&page=${page}&_fields=${LIST_META_FIELDS}`,
        15000
      );
      if (!batch?.length) break;
      lists.push(...batch);
      if (batch.length < 100) break;
    }

    if (lists.length) {
      const fingerprint = listFingerprint(lists);
      listsMemory = { fingerprint, lists };
      writeCacheFile("lists.json", fingerprint, lists);
    } else if (listsMemory) {
      return listsMemory.lists;
    } else {
      const disk = readCacheFile<SpList[]>("lists.json");
      if (disk?.payload?.length) {
        listsMemory = { fingerprint: disk.fingerprint, lists: disk.payload };
        return disk.payload;
      }
    }
    return lists;
  })().finally(() => {
    listsInflight = null;
  });

  return listsInflight;
}

async function fetchListsFingerprint(): Promise<string | null> {
  const lists: SpList[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const batch = await fetchJson<SpList[]>(
      `${SITE_ORIGIN}/wp-json/sportspress/v2/lists?per_page=100&page=${page}&_fields=id,slug,modified,modified_gmt`,
      12000
    );
    if (!batch?.length) break;
    lists.push(...batch);
    if (batch.length < 100) break;
  }
  return lists.length ? listFingerprint(lists) : null;
}

function seasonsFromLists(lists: SpList[]): SeasonInfo[] {
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
  return [...byYear.values()].sort((a, b) => Number(b.year) - Number(a.year));
}

export async function getSeasons(force = false, preferCache = false): Promise<SeasonInfo[]> {
  if (!force && preferCache) {
    if (seasonsMemory?.seasons.length) return seasonsMemory.seasons;
    const disk = readCacheFile<SeasonInfo[]>("seasons.json");
    if (disk?.payload?.length) {
      seasonsMemory = { fingerprint: disk.fingerprint, seasons: disk.payload };
      return disk.payload;
    }
  }

  if (!force && seasonsMemory) {
    const liveFingerprint = await fetchListsFingerprint();
    if (liveFingerprint && liveFingerprint === seasonsMemory.fingerprint) {
      return seasonsMemory.seasons;
    }
  }

  if (!force && !seasonsMemory) {
    const disk = readCacheFile<SeasonInfo[]>("seasons.json");
    if (disk?.payload?.length) {
      const liveFingerprint = await fetchListsFingerprint();
      if (liveFingerprint && liveFingerprint === disk.fingerprint) {
        seasonsMemory = { fingerprint: disk.fingerprint, seasons: disk.payload };
        return disk.payload;
      }
    }
  }

  const lists = await fetchAllLists(force);
  const seasons = seasonsFromLists(lists);
  if (seasons.length) {
    const fingerprint = listFingerprint(lists);
    seasonsMemory = { fingerprint, seasons };
    writeCacheFile("seasons.json", fingerprint, seasons);
    return seasons;
  }

  const disk = readCacheFile<SeasonInfo[]>("seasons.json");
  if (disk?.payload?.length) {
    seasonsMemory = { fingerprint: disk.fingerprint, seasons: disk.payload };
    return disk.payload;
  }
  return seasonsMemory?.seasons ?? [];
}

async function resolveSeason(year?: string, preferCache = false): Promise<SeasonInfo> {
  let seasons = await getSeasons(false, preferCache);
  const requested = year?.trim() || DEFAULT_SEASON;
  let match = seasons.find((season) => season.year === requested);
  if (!match && requested !== DEFAULT_SEASON && !preferCache) {
    seasons = await getSeasons(true);
    match = seasons.find((season) => season.year === requested);
  }
  return match ?? seasons[0] ?? {
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
  // Fill gaps when the year has roster lists but the index call was truncated.
  if (Number(season.year) >= 2022 && rosterLists.length) {
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
        const payload =
          fromIndex?.data
            ? fromIndex
            : (
                await fetchJson<SpList[]>(
                  `${SITE_ORIGIN}/wp-json/sportspress/v2/lists?slug=${encodeURIComponent(slug)}&per_page=1&_fields=id,slug,title,data`,
                  15000
                )
              )?.[0];
        const data = payload?.data;
        if (!data) return;

        const title = payload?.title?.rendered ?? fromIndex?.title?.rendered ?? slug;
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

async function loadSeasonEventTeams(
  season: SeasonInfo,
  teamNames: Map<number, string>
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const seasonId = season.seasonId ?? (await resolveSeasonTaxonomyId(season.year));
  if (!seasonId) return map;

  for (let page = 1; page <= 10; page += 1) {
    const batch = await fetchJson<Array<{ teams?: number[]; players?: number[] }>>(
      `${SITE_ORIGIN}/wp-json/sportspress/v2/events?seasons=${seasonId}&per_page=50&page=${page}&orderby=date&order=asc&_fields=teams,players`,
      20000
    );
    if (!batch?.length) break;

    for (const event of batch) {
      const teamIds = (event.teams ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
      const playerIds = (event.players ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id));
      for (const { playerId, team } of mapEventLineup(teamIds, playerIds, teamNames)) {
        map.set(playerId, team);
      }
    }

    if (batch.length < 50) break;
  }

  return map;
}

async function loadCurrentTeamsFallback(
  playerIds: number[],
  teamNames: Map<number, string>
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!playerIds.length) return map;

  for (const group of chunk(playerIds, 50)) {
    const players = await fetchJson<Array<{ id: number; current_teams?: number[]; teams?: number[] }>>(
      `${SITE_ORIGIN}/wp-json/sportspress/v2/players?include=${group.join(",")}&per_page=${group.length}&_fields=id,current_teams,teams`,
      20000
    );
    for (const player of players ?? []) {
      const teamId = player.current_teams?.[0] ?? player.teams?.filter((id) => id > 0).at(-1);
      const team = teamId ? teamNames.get(teamId) : undefined;
      if (team) map.set(player.id, team);
    }
  }

  return map;
}

function mergeTeamMap(target: Map<number, string>, extra: Map<number, string>) {
  for (const [id, team] of extra) {
    if (!target.has(id)) target.set(id, team);
  }
}

async function enrichPlayersWithTeams(players: Player[], season: SeasonInfo): Promise<Player[]> {
  const sourceIds = players
    .map((player) => Number(player.sourceId))
    .filter((id) => Number.isFinite(id) && id > 0);

  const [rosterTeams, standings, teamNames] = await Promise.all([
    loadSeasonRosterTeams(season),
    getStandings(false, season.year),
    loadTeamNameMap()
  ]);

  const aliases = uniqueTeamAliases(
    standings.map((row) => row.name),
    teamNames.values(),
    FRANCHISE_TEAM_NAMES
  );

  const missingAfterRoster = sourceIds.filter((id) => !rosterTeams.has(id));
  if (missingAfterRoster.length) {
    mergeTeamMap(rosterTeams, await loadSeasonEventTeams(season, teamNames));
  }

  // Only fall back to "current team" for the live season — historical rosters are the source of truth.
  if (season.year === DEFAULT_SEASON) {
    const missing = sourceIds.filter((id) => !rosterTeams.has(id));
    if (missing.length) {
      mergeTeamMap(rosterTeams, await loadCurrentTeamsFallback(missing, teamNames));
    }
  }

  return players.map((player) => {
    const sourceId = Number(player.sourceId);
    const raw = Number.isFinite(sourceId) ? rosterTeams.get(sourceId) : undefined;
    const team = raw ? canonicalTeamName(raw, aliases) : undefined;
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

async function getSeasonFingerprint(season: SeasonInfo): Promise<string | null> {
  const statsMeta = await fetchStatsListMeta(season.slug);
  if (!statsMeta) return null;

  let rosterMetas: SpList[] = [];
  try {
    const lists = await fetchAllLists();
    rosterMetas = lists.filter(
      (list) => !isStatsList(list) && list.slug.toLowerCase().startsWith(`${season.year}-`)
    );
  } catch {
    rosterMetas = [];
  }

  return `${listFingerprint([statsMeta, ...rosterMetas])}|te:${TEAM_ENRICHMENT_VERSION}`;
}

function seasonCacheName(year: string) {
  return `season-${year}.json`;
}

function readSeasonCache(year: string): SeasonCacheEntry | null {
  const memory = seasonCache.get(year);
  if (memory) return memory;
  const disk = readCacheFile<PlayersResponse>(seasonCacheName(year));
  if (!disk?.payload?.players?.length) return null;
  const entry = { fingerprint: disk.fingerprint, data: disk.payload };
  seasonCache.set(year, entry);
  return entry;
}

function writeSeasonCache(year: string, fingerprint: string, data: PlayersResponse) {
  const previous = seasonCache.get(year);
  const entry = { fingerprint, data };
  seasonCache.set(year, entry);
  writeCacheFile(seasonCacheName(year), fingerprint, data);
  if (previous && previous.fingerprint !== fingerprint) {
    profileMemory.clear();
  }
}

async function fetchSeasonPlayers(season: SeasonInfo): Promise<PlayersResponse> {
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
  const standings = await getStandings(false, season.year);
  const teams = uniqueTeamAliases(
    players.map((player) => player.team ?? ""),
    standings.map((row) => canonicalTeamName(row.name))
  ).sort((a, b) => a.localeCompare(b));

  return {
    players,
    meta: {
      source,
      fetchedAt: new Date().toISOString(),
      total: players.length,
      teams,
      season: season.year,
      seasonLabel: season.label,
      standings: standings.length ? standings : undefined
    }
  };
}

type StandingsCacheEntry = {
  fingerprint: string;
  standings: TeamStanding[];
};

const standingsCache = new Map<string, StandingsCacheEntry>();

function standingsCacheName(year: string) {
  return `standings-${year}.json`;
}

function readStandingsCache(year: string): StandingsCacheEntry | null {
  const memory = standingsCache.get(year);
  if (memory) return memory;
  const disk = readCacheFile<TeamStanding[]>(standingsCacheName(year));
  if (!disk?.payload?.length) return null;
  const entry = { fingerprint: disk.fingerprint, standings: disk.payload };
  standingsCache.set(year, entry);
  return entry;
}

async function fetchStandingsMeta(slug: string) {
  return fetchJson<Array<{ id: number; slug: string; modified?: string; modified_gmt?: string }>>(
    `${SITE_ORIGIN}/wp-json/sportspress/v2/tables?slug=${encodeURIComponent(slug)}&per_page=1&_fields=id,slug,modified,modified_gmt`,
    12000
  ).then((rows) => rows?.[0] ?? null);
}

export async function getStandings(force = false, seasonYear?: string): Promise<TeamStanding[]> {
  const year = (seasonYear ?? DEFAULT_SEASON).trim() || DEFAULT_SEASON;
  const cached = readStandingsCache(year);
  const slugs = standingsSlugCandidates(year);

  let liveFingerprint: string | null = null;
  if (!force) {
    for (const slug of slugs) {
      const meta = await fetchStandingsMeta(slug);
      if (meta) {
        liveFingerprint = listFingerprint([meta]);
        break;
      }
    }
    if (cached && liveFingerprint && cached.fingerprint === liveFingerprint) {
      return cached.standings;
    }
    if (cached && !liveFingerprint) {
      return cached.standings;
    }
  }

  for (const slug of slugs) {
    const payload = await fetchJson<Array<{
      slug: string;
      modified?: string;
      modified_gmt?: string;
      data?: Record<string, Record<string, unknown>>;
    }>>(`${SITE_ORIGIN}/wp-json/sportspress/v2/tables?slug=${encodeURIComponent(slug)}&per_page=1`, 15000);

    const table = payload?.[0];
    const standings = parseStandingsTable(table?.data);
    if (!standings.length) continue;

    const fingerprint =
      liveFingerprint ??
      listFingerprint([{ id: undefined, slug: table?.slug, modified: table?.modified, modified_gmt: table?.modified_gmt }]) ??
      `fetched:${new Date().toISOString()}`;
    standingsCache.set(year, { fingerprint, standings });
    writeCacheFile(standingsCacheName(year), fingerprint, standings);
    return standings;
  }

  return cached?.standings ?? [];
}

type ScheduleCacheEntry = {
  fingerprint: string;
  games: ScheduleGame[];
};

const scheduleCache = new Map<string, ScheduleCacheEntry>();
const gameBoxCache = new Map<number, GameDetail>();

function scheduleCacheName(year: string) {
  return `schedule-${year}.json`;
}

function readScheduleCache(year: string): ScheduleCacheEntry | null {
  const memory = scheduleCache.get(year);
  if (memory) return memory;
  const disk = readCacheFile<ScheduleGame[]>(scheduleCacheName(year));
  if (!disk?.payload?.length) return null;
  const entry = { fingerprint: disk.fingerprint, games: disk.payload };
  scheduleCache.set(year, entry);
  return entry;
}

async function resolveSeasonTaxonomyId(year: string): Promise<number | null> {
  const seasons = await getSeasons(false, true);
  const known = seasons.find((season) => season.year === year)?.seasonId;
  if (known) return known;

  const tax = await fetchJson<Array<{ id: number; name?: string; slug?: string }>>(
    `${SITE_ORIGIN}/wp-json/sportspress/v2/seasons?per_page=100`,
    12000
  );
  const hit = tax?.find((season) => season.slug === year || season.name === year);
  return hit?.id ?? null;
}

async function loadVenueNameMap(): Promise<Map<number, string>> {
  const venues = await fetchJson<Array<{ id: number; name?: string; title?: { rendered?: string } }>>(
    `${SITE_ORIGIN}/wp-json/sportspress/v2/venues?per_page=100`,
    12000
  );
  const map = new Map<number, string>();
  for (const venue of venues ?? []) {
    const name = decodeEntities(venue.name ?? venue.title?.rendered ?? "").trim();
    if (name) map.set(venue.id, name);
  }
  return map;
}

async function fetchScheduleFingerprint(seasonId: number): Promise<string | null> {
  const response = await fetchResponse(
    `${SITE_ORIGIN}/wp-json/sportspress/v2/events?seasons=${seasonId}&per_page=1&orderby=modified&order=desc&_fields=id,modified_gmt`,
    12000
  );
  if (!response) return null;
  const total = response.headers.get("X-WP-Total") ?? "0";
  const rows = (await response.json()) as Array<{ modified_gmt?: string }>;
  return `${total}:${rows[0]?.modified_gmt ?? ""}`;
}

async function fetchAllSeasonEvents(seasonId: number) {
  const events: Array<{
    id: number;
    date?: string;
    status?: string;
    link?: string;
    title?: { rendered?: string };
    teams?: number[];
    venues?: number[];
    main_results?: unknown;
    results?: Record<string, unknown>;
    modified_gmt?: string;
  }> = [];

  for (let page = 1; page <= 10; page += 1) {
    const batch = await fetchJson<typeof events>(
      `${SITE_ORIGIN}/wp-json/sportspress/v2/events?seasons=${seasonId}&per_page=50&page=${page}&orderby=date&order=asc&_fields=id,date,status,title,link,teams,venues,main_results,results,modified_gmt`,
      20000
    );
    if (!batch?.length) break;
    events.push(...batch);
    if (batch.length < 50) break;
  }
  return events;
}

export type ScheduleResponse = {
  season: string;
  games: ScheduleGame[];
  meta: { fetchedAt: string; total: number };
};

async function withResolvedTeamNames(games: ScheduleGame[]): Promise<ScheduleGame[]> {
  if (!games.length) return games;
  const needsNames = games.some((game) =>
    game.teams.some((side) => !side.name || side.name === `Team ${side.id}`)
  );
  if (!needsNames) return games;
  const teamNames = await loadTeamNameMap();
  const hydrated = hydrateScheduleGames(games, teamNames);
  return hydrated;
}

export async function getSchedule(force = false, seasonYear?: string): Promise<ScheduleResponse> {
  const year = (seasonYear ?? DEFAULT_SEASON).trim() || DEFAULT_SEASON;
  const cached = readScheduleCache(year);
  const seasonId = await resolveSeasonTaxonomyId(year);

  if (!seasonId) {
    const games = await withResolvedTeamNames(cached?.games ?? []);
    return { season: year, games, meta: { fetchedAt: new Date().toISOString(), total: games.length } };
  }

  const liveFingerprint = force ? null : await fetchScheduleFingerprint(seasonId);
  if (!force && cached && liveFingerprint && cached.fingerprint === liveFingerprint) {
    const games = await withResolvedTeamNames(cached.games);
    if (games !== cached.games) {
      scheduleCache.set(year, { fingerprint: cached.fingerprint, games });
      writeCacheFile(scheduleCacheName(year), cached.fingerprint, games);
    }
    return { season: year, games, meta: { fetchedAt: new Date().toISOString(), total: games.length } };
  }
  if (!force && cached && !liveFingerprint) {
    const games = await withResolvedTeamNames(cached.games);
    return { season: year, games, meta: { fetchedAt: new Date().toISOString(), total: games.length } };
  }

  try {
    const [events, teamNames, venueNames] = await Promise.all([
      fetchAllSeasonEvents(seasonId),
      loadTeamNameMap(),
      loadVenueNameMap()
    ]);

    const games = events
      .map((event) => parseScheduleEvent(event, teamNames, venueNames))
      .filter((game): game is ScheduleGame => Boolean(game))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (games.length) {
      const fingerprint = liveFingerprint ?? (await fetchScheduleFingerprint(seasonId)) ?? `fetched:${new Date().toISOString()}`;
      scheduleCache.set(year, { fingerprint, games });
      writeCacheFile(scheduleCacheName(year), fingerprint, games);
    } else if (cached) {
      const fallback = await withResolvedTeamNames(cached.games);
      return { season: year, games: fallback, meta: { fetchedAt: new Date().toISOString(), total: fallback.length } };
    }

    return { season: year, games, meta: { fetchedAt: new Date().toISOString(), total: games.length } };
  } catch (error) {
    if (cached) {
      const fallback = await withResolvedTeamNames(cached.games);
      return { season: year, games: fallback, meta: { fetchedAt: new Date().toISOString(), total: fallback.length } };
    }
    throw error;
  }
}

export async function getGame(eventId: string, seasonYear?: string): Promise<GameDetail | null> {
  const id = Number(eventId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const cached = gameBoxCache.get(id);
  if (cached) return cached;

  const event = await fetchJson<{
    id: number;
    date?: string;
    status?: string;
    link?: string;
    title?: { rendered?: string };
    teams?: Array<number | string>;
    venues?: number[];
    main_results?: unknown;
    results?: Record<string, unknown>;
    players?: number[];
    performance?: Record<string, Record<string, Record<string, unknown>>>;
  }>(
    `${SITE_ORIGIN}/wp-json/sportspress/v2/events/${id}?_fields=id,date,status,title,link,teams,venues,main_results,results,players,performance`,
    20000
  );
  if (!event?.id) return null;

  const [teamNames, venueNames] = await Promise.all([loadTeamNameMap(), loadVenueNameMap()]);
  const game = parseScheduleEvent(event, teamNames, venueNames);
  if (!game) return null;

  const year = (seasonYear ?? DEFAULT_SEASON).trim() || DEFAULT_SEASON;
  const names = new Map<number, string>();
  let seasonPlayers = readSeasonCache(year)?.data?.players ?? [];
  if (!seasonPlayers.length) {
    try {
      seasonPlayers = (await getPlayers(false, year, true)).players;
    } catch {
      seasonPlayers = [];
    }
  }
  for (const player of seasonPlayers) {
    const sourceId = Number(player.sourceId);
    if (Number.isFinite(sourceId) && player.name) names.set(sourceId, player.name);
  }

  const missing = [
    ...new Set(
      Object.values(event.performance ?? {}).flatMap((block) =>
        Object.keys(block ?? {})
          .map((key) => Number(key))
          .filter((playerId) => playerId > 0 && !names.has(playerId))
      )
    )
  ];
  for (const group of chunk(missing, 50)) {
    const rows = await fetchJson<Array<{ id: number; title?: { rendered?: string } }>>(
      `${SITE_ORIGIN}/wp-json/sportspress/v2/players?include=${group.join(",")}&per_page=${group.length}&_fields=id,title`,
      15000
    );
    for (const row of rows ?? []) {
      const name = decodeEntities(row.title?.rendered ?? "").trim();
      if (name) names.set(row.id, name);
    }
  }

  const detail: GameDetail = {
    game,
    sides: parseBoxScore(event.performance, game.teams, names),
    meta: { fetchedAt: new Date().toISOString() }
  };
  gameBoxCache.set(id, detail);
  return detail;
}

export async function getPlayers(force = false, seasonYear?: string, preferCache = false): Promise<PlayersResponse> {
  const season = await resolveSeason(seasonYear, preferCache && !force);
  const cached = readSeasonCache(season.year);

  const attachStandings = async (data: PlayersResponse, forceStandings = false) => {
    if (!forceStandings && data.meta.standings?.length) return data;
    const standings = await getStandings(forceStandings, season.year);
    if (!standings.length) return data;
    return { ...data, meta: { ...data.meta, standings } };
  };

  // Career / warm-path reads: trust memory/disk snapshots; skip SportsPress fingerprint chatter.
  if (!force && preferCache && cached) {
    return attachStandings(cached.data);
  }

  const liveFingerprint = force ? null : await getSeasonFingerprint(season);

  if (!force && cached && liveFingerprint && cached.fingerprint === liveFingerprint) {
    return attachStandings(cached.data);
  }

  // Source unreachable but we have a prior snapshot — serve it rather than failing.
  if (!force && cached && !liveFingerprint) {
    return attachStandings(cached.data);
  }

  try {
    const data = await fetchSeasonPlayers(season);
    const fingerprint = liveFingerprint ?? (await getSeasonFingerprint(season)) ?? `fetched:${data.meta.fetchedAt}`;
    writeSeasonCache(season.year, fingerprint, data);
    return data;
  } catch (error) {
    if (cached) return attachStandings(cached.data);
    throw error;
  }
}

export async function warmSeasonCaches(): Promise<{ warmed: string[]; failed: string[] }> {
  warmState = {
    status: "running",
    warmed: [],
    failed: [],
    startedAt: new Date().toISOString(),
    finishedAt: null
  };

  try {
    const seasons = await getSeasons();
    const warmed: string[] = [];
    const failed: string[] = [];

    for (const group of chunk(seasons, 2)) {
      const results = await Promise.all(
        group.map(async (season) => {
          try {
            await getPlayers(false, season.year);
            await getSchedule(false, season.year);
            return { year: season.year, ok: true as const };
          } catch {
            return { year: season.year, ok: false as const };
          }
        })
      );
      for (const result of results) {
        if (result.ok) warmed.push(result.year);
        else failed.push(result.year);
        warmState = { ...warmState, warmed: [...warmed], failed: [...failed] };
      }
    }

    warmState = {
      status: "done",
      warmed,
      failed,
      startedAt: warmState.startedAt,
      finishedAt: new Date().toISOString()
    };
    return { warmed, failed };
  } catch (error) {
    warmState = {
      ...warmState,
      status: "done",
      finishedAt: new Date().toISOString()
    };
    throw error;
  }
}

export function getServiceStatus() {
  const seasons = [...seasonCache.entries()]
    .map(([year, entry]) => ({
      year,
      fetchedAt: entry.data.meta.fetchedAt,
      playerCount: entry.data.players.length,
      fingerprint: entry.fingerprint.slice(0, 48)
    }))
    .sort((a, b) => Number(b.year) - Number(a.year));

  return {
    ok: true,
    service: "tuff-stats-api",
    uptimeSeconds: Math.round(process.uptime()),
    warm: warmState,
    cache: {
      seasonsCached: seasons.length,
      profilesCached: profileMemory.size,
      seasons
    }
  };
}

export async function refreshSeasonData(seasonYear?: string) {
  profileMemory.clear();
  teamNamesMemory = null;
  standingsCache.clear();
  scheduleCache.clear();
  gameBoxCache.clear();

  if (seasonYear) {
    await getStandings(true, seasonYear);
    await getSchedule(true, seasonYear);
    const data = await getPlayers(true, seasonYear);
    return { refreshed: [data.meta.season], failed: [] as string[] };
  }

  const seasons = await getSeasons(true);
  const refreshed: string[] = [];
  const failed: string[] = [];
  for (const group of chunk(seasons, 2)) {
    const results = await Promise.all(
      group.map(async (season) => {
        try {
          await getStandings(true, season.year);
          await getSchedule(true, season.year);
          await getPlayers(true, season.year);
          return { year: season.year, ok: true as const };
        } catch {
          return { year: season.year, ok: false as const };
        }
      })
    );
    for (const result of results) {
      if (result.ok) refreshed.push(result.year);
      else failed.push(result.year);
    }
  }
  return { refreshed, failed };
}

async function loadTeamNameMap(): Promise<Map<number, string>> {
  if (teamNamesMemory?.size) return teamNamesMemory;

  const map = new Map<number, string>();
  for (let page = 1; page <= 5; page += 1) {
    const teams = await fetchJson<Array<{ id: number; title?: { rendered?: string } }>>(
      `${SITE_ORIGIN}/wp-json/sportspress/v2/teams?per_page=100&page=${page}&_fields=id,title`,
      15000
    );
    if (!teams?.length) break;
    for (const team of teams) {
      const id = Number(team.id);
      const name = decodeEntities(team.title?.rendered ?? "").trim();
      if (Number.isFinite(id) && name) map.set(id, name);
    }
    if (teams.length < 100) break;
  }
  if (map.size) teamNamesMemory = map;
  return map;
}

export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  const sourceId = extractSourceId(playerId);
  if (!sourceId) return null;

  const cachedProfile = profileMemory.get(sourceId);
  if (cachedProfile) return cachedProfile;

  const seasons = await getSeasons(false, true);
  // Assemble from warm season snapshots only — never kick off N full season fetches here.
  const seasonResults = seasons.map((season) => ({
    season,
    data: readSeasonCache(season.year)?.data ?? null
  }));

  const [teamNames, spPlayer] = await Promise.all([
    loadTeamNameMap(),
    fetchJson<{
      id: number;
      title?: { rendered?: string };
      number?: number | string;
      link?: string;
      teams?: number[];
      current_teams?: number[];
      seasons?: number[];
    }>(`${SITE_ORIGIN}/wp-json/sportspress/v2/players/${sourceId}`, 12000)
  ]);

  const resolvedName =
    decodeEntities(spPlayer?.title?.rendered ?? "").trim() ||
    seasonResults.flatMap((row) => row.data?.players ?? []).find((player) => player.sourceId === sourceId)?.name ||
    `Player ${sourceId}`;

  const candidates = seasonResults.flatMap(({ season, data }) =>
    (data?.players ?? [])
      .filter((player) => player.sourceId)
      .map((player) => ({
        season: season.year,
        sourceId: String(player.sourceId),
        name: player.name,
        team: player.team,
        stats: player.stats,
        derived: player.derived
      }))
  );

  const { appearances, linkedSourceIds } = collectCareerAppearances(
    sourceId,
    resolvedName,
    candidates,
    spPlayer?.number
  );

  if (!appearances.length && !spPlayer) return null;

  const careerPlayer = careerFromSeasons(resolvedName, appearances, sourceId);
  const currentTeam =
    (spPlayer?.current_teams ?? [])
      .map((id) => teamNames.get(id))
      .find(Boolean) || appearances[0]?.team;
  // Only show teams confirmed by season stats/rosters — SportsPress `teams` includes
  // historical associations that are often stale or incomplete for our season lists.
  const teams = [...new Set(appearances.map((row) => row.team).filter((name): name is string => Boolean(name)))];

  const profile: PlayerProfile = {
    id: careerPlayer.id,
    sourceId,
    name: resolvedName,
    number: spPlayer?.number || undefined,
    profileUrl: spPlayer?.link,
    currentTeam,
    teams,
    linkedSourceIds: linkedSourceIds.length ? linkedSourceIds : undefined,
    seasons: appearances,
    career: {
      seasonsPlayed: appearances.length,
      stats: careerPlayer.stats,
      derived: careerPlayer.derived
    },
    meta: { fetchedAt: new Date().toISOString() }
  };

  profileMemory.set(sourceId, profile);
  return profile;
}
