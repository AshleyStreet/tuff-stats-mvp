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
import { careerFromSeasons, extractSourceId } from "./lib/profile.js";
import { listFingerprint, readCacheFile, writeCacheFile } from "./lib/cache.js";
import type { Player, PlayersResponse, SeasonInfo } from "./types.js";

const SITE_ORIGIN = new URL(process.env.TUFF_STATS_URL ?? "https://www.playtuff.ca/list/2026-tuff-stats/").origin;
const DEFAULT_SEASON = "2026";
const LIST_META_FIELDS = "id,slug,title,seasons,link,modified,modified_gmt";

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

  return listFingerprint([statsMeta, ...rosterMetas]);
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
  const teams = [...new Set(players.map((player) => player.team).filter((team): team is string => Boolean(team)))].sort((a, b) =>
    a.localeCompare(b)
  );

  return {
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
}

export async function getPlayers(force = false, seasonYear?: string, preferCache = false): Promise<PlayersResponse> {
  const season = await resolveSeason(seasonYear, preferCache && !force);
  const cached = readSeasonCache(season.year);

  // Career / warm-path reads: trust memory/disk snapshots; skip SportsPress fingerprint chatter.
  if (!force && preferCache && cached) {
    return cached.data;
  }

  const liveFingerprint = force ? null : await getSeasonFingerprint(season);

  if (!force && cached && liveFingerprint && cached.fingerprint === liveFingerprint) {
    return cached.data;
  }

  // Source unreachable but we have a prior snapshot — serve it rather than failing.
  if (!force && cached && !liveFingerprint) {
    return cached.data;
  }

  try {
    const data = await fetchSeasonPlayers(season);
    const fingerprint = liveFingerprint ?? (await getSeasonFingerprint(season)) ?? `fetched:${data.meta.fetchedAt}`;
    writeSeasonCache(season.year, fingerprint, data);
    return data;
  } catch (error) {
    if (cached) return cached.data;
    throw error;
  }
}

export async function warmSeasonCaches(): Promise<{ warmed: string[]; failed: string[] }> {
  const seasons = await getSeasons();
  const warmed: string[] = [];
  const failed: string[] = [];

  for (const group of chunk(seasons, 2)) {
    const results = await Promise.all(
      group.map(async (season) => {
        try {
          await getPlayers(false, season.year);
          return { year: season.year, ok: true as const };
        } catch {
          return { year: season.year, ok: false as const };
        }
      })
    );
    for (const result of results) {
      if (result.ok) warmed.push(result.year);
      else failed.push(result.year);
    }
  }

  return { warmed, failed };
}

export type PlayerProfile = {
  id: string;
  sourceId: string;
  name: string;
  number?: number | string;
  profileUrl?: string;
  currentTeam?: string;
  teams: string[];
  seasons: Array<{
    season: string;
    team?: string;
    stats: Player["stats"];
    derived: Player["derived"];
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

async function loadTeamNameMap(): Promise<Map<number, string>> {
  if (teamNamesMemory?.size) return teamNamesMemory;

  const teams = await fetchJson<Array<{ id: number; title?: { rendered?: string } }>>(
    `${SITE_ORIGIN}/wp-json/sportspress/v2/teams?per_page=100`
  );
  const map = new Map<number, string>();
  for (const team of teams ?? []) {
    const name = decodeEntities(team.title?.rendered ?? "").trim();
    if (name) map.set(team.id, name);
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

  const appearances = seasonResults
    .map(({ season, data }) => {
      const match = data?.players.find((player) => player.sourceId === sourceId);
      if (!match) return null;
      return {
        season: season.year,
        team: match.team,
        stats: match.stats,
        derived: match.derived
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => Number(b.season) - Number(a.season));

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

  if (!appearances.length && !spPlayer) return null;

  const resolvedName =
    decodeEntities(spPlayer?.title?.rendered ?? "").trim() ||
    seasonResults.flatMap((row) => row.data?.players ?? []).find((player) => player.sourceId === sourceId)?.name ||
    `Player ${sourceId}`;

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
