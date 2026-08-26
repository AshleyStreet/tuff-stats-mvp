import { toLeagueRef } from "../../domain/types.js";
import type {
  GameDetail,
  Player,
  PlayersResponse,
  ScheduleGame,
  ScheduleResponse,
  SeasonInfo,
  TeamStanding
} from "../../domain/types.js";
import type { League, SportspressSeasonSlice } from "../../leagues/types.js";
import { listFingerprint, readLeagueCache, writeLeagueCache } from "../../lib/cache.js";
import { parseBoxScore, parseScheduleEvent } from "../../lib/schedule.js";
import { parseStandingsTable, standingsTableSlugs } from "../../lib/standings.js";
import {
  buildPlayer,
  chunk,
  decodeEntities,
  emptyStats,
  statsFromRow,
  uniqueTeamAliases
} from "../../lib/stats.js";
import type { SpEvent, SpList, SpPlayer, SpSeason, SpTable, SpTeam, SpVenue } from "../sportspress/types.js";
import type { AdapterFetchOpts, AdapterStatus, AdapterWarmState, LeagueDataAdapter } from "../types.js";

function originFor(league: League) {
  const envName = league.source.sportspress?.originEnv;
  const raw = ((envName ? process.env[envName] : undefined) ?? league.source.origin).trim();
  try {
    return new URL(raw).origin;
  } catch {
    return league.source.origin;
  }
}

function compileExclude(patterns: string[] | undefined) {
  return (patterns ?? []).map((pattern) => {
    try {
      return new RegExp(pattern, "i");
    } catch {
      return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
  });
}

function isNoiseTeam(name: string, exclude: RegExp[]) {
  const trimmed = name.trim();
  if (!trimmed) return true;
  return exclude.some((re) => re.test(trimmed));
}

/**
 * Config-driven SportsPress ingest. Bush (year tables) and Passion (division slices)
 * share this adapter; TUFF keeps its own HTML/list pipeline.
 */
export function createSportspressAdapter(league: League): LeagueDataAdapter {
  const leagueRef = toLeagueRef(league);
  const sp = league.source.sportspress ?? {
    seasonMode: "year" as const,
    playerSource: "none" as const
  };
  const origin = originFor(league);
  const userAgent = league.source.userAgent;
  const defaultSeason = league.publicSeason;
  const leagueId = league.id;
  const excludeTeam = compileExclude(sp.excludeTeamNamePatterns);
  const configuredSlices = new Map((sp.seasons ?? []).map((slice) => [slice.key, slice]));

  let seasonsMemory: { fingerprint: string; seasons: SeasonInfo[] } | null = null;
  const standingsCache = new Map<string, { fingerprint: string; standings: TeamStanding[] }>();
  const scheduleCache = new Map<string, { fingerprint: string; games: ScheduleGame[] }>();
  const playersCache = new Map<string, PlayersResponse>();
  const gameBoxCache = new Map<number, GameDetail>();
  const seasonIdBySlug = new Map<string, number>();
  let teamNames = new Map<number, string>();
  let venueNames = new Map<number, string>();
  let warmState: AdapterWarmState = {
    status: "idle",
    warmed: [],
    failed: [],
    startedAt: null,
    finishedAt: null
  };

  function readDisk<T>(name: string) {
    return readLeagueCache<T>(leagueId, name);
  }

  function writeDisk<T>(name: string, fingerprint: string, payload: T) {
    writeLeagueCache(leagueId, name, fingerprint, payload);
  }

  async function fetchJson<T>(url: string, timeoutMs = 12000): Promise<T | null> {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  async function fetchResponse(url: string, timeoutMs = 12000): Promise<Response | null> {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) return null;
      return response;
    } catch {
      return null;
    }
  }

  async function loadTeamNameMap(force = false): Promise<Map<number, string>> {
    if (!force && teamNames.size) return teamNames;
    const map = new Map<number, string>();
    for (let page = 1; page <= 5; page += 1) {
      const batch = await fetchJson<SpTeam[]>(
        `${origin}/wp-json/sportspress/v2/teams?per_page=100&page=${page}&_fields=id,title`,
        15000
      );
      if (!batch?.length) break;
      for (const team of batch) {
        const name = decodeEntities(team.title?.rendered ?? "").trim();
        if (name && !isNoiseTeam(name, excludeTeam)) map.set(team.id, name);
      }
      if (batch.length < 100) break;
    }
    if (map.size) teamNames = map;
    return teamNames;
  }

  async function loadVenueNameMap(force = false): Promise<Map<number, string>> {
    if (!force && venueNames.size) return venueNames;
    const venues = await fetchJson<SpVenue[]>(`${origin}/wp-json/sportspress/v2/venues?per_page=100`, 12000);
    const map = new Map<number, string>();
    for (const venue of venues ?? []) {
      const name = decodeEntities(venue.name ?? venue.title?.rendered ?? "").trim();
      if (name) map.set(venue.id, name);
    }
    if (map.size) venueNames = map;
    return venueNames;
  }

  function yearFromSlug(value: string | undefined) {
    return value?.match(/(?:^|-)((?:19|20)\d{2})$/)?.[1] ?? value?.match(/^((?:19|20)\d{2})$/)?.[1] ?? null;
  }

  function sliceFor(key: string): SportspressSeasonSlice | undefined {
    return configuredSlices.get(key);
  }

  async function resolveTaxonomySeasonId(seasonSlug: string): Promise<number | null> {
    const cached = seasonIdBySlug.get(seasonSlug);
    if (cached) return cached;
    const tax = await fetchJson<SpSeason[]>(
      `${origin}/wp-json/sportspress/v2/seasons?slug=${encodeURIComponent(seasonSlug)}&per_page=1&_fields=id,slug`,
      12000
    );
    const id = tax?.[0]?.id;
    if (id) seasonIdBySlug.set(seasonSlug, id);
    return id ?? null;
  }

  async function fetchConfiguredSeasons(): Promise<{ fingerprint: string; seasons: SeasonInfo[] }> {
    const seasons: SeasonInfo[] = [];
    for (const slice of sp.seasons ?? []) {
      const seasonId = await resolveTaxonomySeasonId(slice.seasonSlug);
      seasons.push({
        year: slice.key,
        label: slice.label,
        slug: slice.standingsSlug,
        seasonId: seasonId ?? undefined,
        url: `${origin}/table/${slice.standingsSlug}/`
      });
    }
    return {
      fingerprint: listFingerprint(seasons.map((season) => ({ slug: season.slug, id: season.seasonId }))),
      seasons
    };
  }

  async function fetchYearSeasons(): Promise<{ fingerprint: string; seasons: SeasonInfo[] } | null> {
    const tax = await fetchJson<SpSeason[]>(`${origin}/wp-json/sportspress/v2/seasons?per_page=100`, 12000);
    const tables = await fetchJson<SpTable[]>(
      `${origin}/wp-json/sportspress/v2/tables?per_page=50&_fields=id,slug,modified,modified_gmt`,
      12000
    );
    const byYear = new Map<string, SeasonInfo>();

    for (const season of tax ?? []) {
      const year = yearFromSlug(season.slug) ?? yearFromSlug(season.name);
      if (!year) continue;
      seasonIdBySlug.set(season.slug ?? year, season.id);
      byYear.set(year, {
        year,
        label: `${year} Season`,
        slug: league.source.standingsSlugTemplate?.replaceAll("{year}", year) ?? `${year}-standings`,
        seasonId: season.id,
        url: `${origin}/table/${league.source.standingsSlugTemplate?.replaceAll("{year}", year) ?? year}/`
      });
    }

    for (const table of tables ?? []) {
      const year = yearFromSlug(table.slug);
      if (!year) continue;
      const existing = byYear.get(year);
      byYear.set(year, {
        year,
        label: existing?.label ?? `${year} Season`,
        slug: table.slug ?? existing?.slug ?? year,
        seasonId: existing?.seasonId,
        url: `${origin}/table/${table.slug ?? year}/`
      });
    }

    const seasons = [...byYear.values()].sort((a, b) => Number(b.year) - Number(a.year));
    if (!seasons.length) return null;
    return {
      fingerprint: listFingerprint([
        ...(tax ?? []).map((row) => ({ id: row.id, slug: row.slug })),
        ...(tables ?? []).map((row) => ({
          slug: row.slug,
          modified: row.modified,
          modified_gmt: row.modified_gmt
        }))
      ]),
      seasons
    };
  }

  async function getSeasons(opts?: AdapterFetchOpts): Promise<SeasonInfo[]> {
    if (!opts?.force && opts?.preferCache) {
      if (seasonsMemory?.seasons.length) return seasonsMemory.seasons;
      const disk = readDisk<SeasonInfo[]>("seasons.json");
      if (disk?.payload?.length) {
        seasonsMemory = { fingerprint: disk.fingerprint, seasons: disk.payload };
        return disk.payload;
      }
    }

    if (!opts?.force && seasonsMemory?.seasons.length) return seasonsMemory.seasons;

    const live =
      sp.seasonMode === "configured" ? await fetchConfiguredSeasons() : await fetchYearSeasons();
    if (live?.seasons.length) {
      seasonsMemory = live;
      writeDisk("seasons.json", live.fingerprint, live.seasons);
      return live.seasons;
    }

    const disk = readDisk<SeasonInfo[]>("seasons.json");
    if (disk?.payload?.length) {
      seasonsMemory = { fingerprint: disk.fingerprint, seasons: disk.payload };
      return disk.payload;
    }
    return seasonsMemory?.seasons ?? [
      { year: defaultSeason, label: `${defaultSeason} Season`, slug: defaultSeason }
    ];
  }

  function seasonKey(season?: string) {
    return season?.trim() || defaultSeason;
  }

  async function resolveSeasonId(key: string): Promise<number | null> {
    const slice = sliceFor(key);
    if (slice) return resolveTaxonomySeasonId(slice.seasonSlug);
    const seasons = await getSeasons({ preferCache: true });
    return seasons.find((season) => season.year === key)?.seasonId ?? null;
  }

  function standingsSlugsFor(key: string): string[] {
    const slice = sliceFor(key);
    if (slice) return [slice.standingsSlug];
    return standingsTableSlugs(key, league.source);
  }

  async function getStandings(opts?: AdapterFetchOpts): Promise<TeamStanding[]> {
    const key = seasonKey(opts?.season);
    const cached = standingsCache.get(key) ?? (() => {
      const disk = readDisk<TeamStanding[]>(`standings-${key}.json`);
      if (!disk?.payload) return null;
      const entry = { fingerprint: disk.fingerprint, standings: disk.payload };
      standingsCache.set(key, entry);
      return entry;
    })();

    if (!opts?.force && opts?.preferCache && cached) return cached.standings;

    for (const slug of standingsSlugsFor(key)) {
      const payload = await fetchJson<SpTable[]>(
        `${origin}/wp-json/sportspress/v2/tables?slug=${encodeURIComponent(slug)}&per_page=1`,
        15000
      );
      const table = payload?.[0];
      const standings = parseStandingsTable(table?.data).filter(
        (row) => !isNoiseTeam(row.name, excludeTeam)
      );
      if (!standings.length) continue;
      const fingerprint = listFingerprint([
        { slug: table?.slug, modified: table?.modified, modified_gmt: table?.modified_gmt }
      ]);
      standingsCache.set(key, { fingerprint, standings });
      writeDisk(`standings-${key}.json`, fingerprint, standings);
      return standings;
    }

    return cached?.standings ?? [];
  }

  async function fetchAllSeasonEvents(seasonId: number) {
    const fields = "id,date,status,title,link,teams,venues,main_results,results,modified_gmt,leagues";
    const events: SpEvent[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const batch = await fetchJson<SpEvent[]>(
        `${origin}/wp-json/sportspress/v2/events?seasons=${seasonId}&per_page=50&page=${page}&orderby=date&order=asc&_fields=${fields}`,
        20000
      );
      if (!batch?.length) break;
      events.push(...batch);
      if (batch.length < 50) break;
    }
    return events;
  }

  async function fetchScheduleFingerprint(seasonId: number): Promise<string | null> {
    const response = await fetchResponse(
      `${origin}/wp-json/sportspress/v2/events?seasons=${seasonId}&per_page=1&orderby=modified&order=desc&_fields=id,modified_gmt`,
      12000
    );
    if (!response) return null;
    const total = response.headers.get("X-WP-Total") ?? "0";
    const rows = (await response.json()) as Array<{ modified_gmt?: string }>;
    return `${total}:${rows[0]?.modified_gmt ?? ""}`;
  }

  function readSchedule(key: string) {
    const memory = scheduleCache.get(key);
    if (memory) return memory;
    const disk = readDisk<ScheduleGame[]>(`schedule-${key}.json`);
    if (!disk?.payload?.length) return null;
    const entry = { fingerprint: disk.fingerprint, games: disk.payload };
    scheduleCache.set(key, entry);
    return entry;
  }

  function filterScheduleToDivision(games: ScheduleGame[], standings: TeamStanding[]) {
    const allowed = new Set(standings.map((row) => row.name.toLowerCase()));
    if (!allowed.size) {
      return games.filter((game) => !game.teams.some((side) => isNoiseTeam(side.name, excludeTeam)));
    }
    return games.filter((game) =>
      game.teams.some((side) => allowed.has(side.name.toLowerCase())) &&
      !game.teams.some((side) => isNoiseTeam(side.name, excludeTeam))
    );
  }

  async function getSchedule(opts?: AdapterFetchOpts): Promise<ScheduleResponse> {
    const key = seasonKey(opts?.season);
    const cached = readSchedule(key);
    if (!opts?.force && opts?.preferCache && cached) {
      return {
        season: key,
        games: cached.games,
        meta: { fetchedAt: new Date().toISOString(), total: cached.games.length, league: leagueRef }
      };
    }

    const seasonId = await resolveSeasonId(key);
    if (!seasonId) {
      const games = cached?.games ?? [];
      return {
        season: key,
        games,
        meta: { fetchedAt: new Date().toISOString(), total: games.length, league: leagueRef }
      };
    }

    if (!opts?.force && cached) {
      const liveFingerprint = await fetchScheduleFingerprint(seasonId);
      if (liveFingerprint && liveFingerprint === cached.fingerprint) {
        return {
          season: key,
          games: cached.games,
          meta: { fetchedAt: new Date().toISOString(), total: cached.games.length, league: leagueRef }
        };
      }
    }

    const [events, names, venues, standings] = await Promise.all([
      fetchAllSeasonEvents(seasonId),
      loadTeamNameMap(),
      loadVenueNameMap(),
      getStandings({ season: key, preferCache: true })
    ]);
    const games = filterScheduleToDivision(
      events
        .map((event) => parseScheduleEvent(event, names, venues))
        .filter((game): game is ScheduleGame => Boolean(game))
        .sort((a, b) => a.date.localeCompare(b.date)),
      standings
    );

    if (games.length) {
      const fingerprint =
        (await fetchScheduleFingerprint(seasonId)) ?? `fetched:${new Date().toISOString()}`;
      scheduleCache.set(key, { fingerprint, games });
      writeDisk(`schedule-${key}.json`, fingerprint, games);
    }

    const payload = games.length ? games : cached?.games ?? [];
    return {
      season: key,
      games: payload,
      meta: { fetchedAt: new Date().toISOString(), total: payload.length, league: leagueRef }
    };
  }

  async function fetchPlayersFromList(listSlug: string, names: Map<number, string>): Promise<Player[]> {
    const payload = await fetchJson<SpList[]>(
      `${origin}/wp-json/sportspress/v2/lists?slug=${encodeURIComponent(listSlug)}&per_page=1`,
      20000
    );
    const data = payload?.[0]?.data;
    if (!data) return [];
    const players: Player[] = [];
    for (const [id, row] of Object.entries(data)) {
      if (id === "0" || !row || typeof row !== "object") continue;
      const name = decodeEntities(String(row.name ?? "")).trim();
      if (!name || name.toLowerCase() === "joueur" || name.toLowerCase() === "player") continue;
      const teamRaw = row.team;
      const teamId = Number(teamRaw);
      const team =
        Number.isFinite(teamId) && teamId > 0
          ? names.get(teamId)
          : typeof teamRaw === "string"
            ? decodeEntities(teamRaw).trim()
            : undefined;
      const stats = statsFromRow(row as Record<string, unknown>);
      players.push(
        buildPlayer(name, stats, {
          sourceId: id,
          team: team && !isNoiseTeam(team, excludeTeam) ? team : undefined
        })
      );
    }
    return players;
  }

  async function fetchPlayersFromEndpoint(seasonId: number | null, names: Map<number, string>): Promise<Player[]> {
    if (!seasonId) return [];
    const players: Player[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const batch = await fetchJson<SpPlayer[]>(
        `${origin}/wp-json/sportspress/v2/players?seasons=${seasonId}&per_page=100&page=${page}&_fields=id,title,link,current_teams,teams`,
        15000
      );
      if (!batch?.length) break;
      for (const row of batch) {
        const name = decodeEntities(row.title?.rendered ?? "").trim();
        if (!name) continue;
        const teamId = row.current_teams?.[0] ?? row.teams?.[0];
        players.push(
          buildPlayer(name, emptyStats(), {
            sourceId: String(row.id),
            profileUrl: row.link,
            team: teamId ? names.get(teamId) : undefined
          })
        );
      }
      if (batch.length < 100) break;
    }
    return players;
  }

  async function getPlayers(opts?: AdapterFetchOpts): Promise<PlayersResponse> {
    const key = seasonKey(opts?.season);
    if (!opts?.force && opts?.preferCache) {
      const memory = playersCache.get(key);
      if (memory) return memory;
      const disk = readDisk<PlayersResponse>(`season-${key}.json`);
      if (disk?.payload) {
        playersCache.set(key, disk.payload);
        return disk.payload;
      }
    }

    const slice = sliceFor(key);
    const [standings, names, seasonId] = await Promise.all([
      getStandings(opts),
      loadTeamNameMap(),
      resolveSeasonId(key)
    ]);

    let players: Player[] = [];
    if (sp.playerSource === "lists") {
      const listSlug = slice?.statsListSlug;
      if (listSlug) players = await fetchPlayersFromList(listSlug, names);
    } else if (sp.playerSource === "players") {
      players = await fetchPlayersFromEndpoint(seasonId, names);
    }

    const seasonLabel =
      slice?.label ??
      (await getSeasons({ preferCache: true })).find((season) => season.year === key)?.label ??
      `${key} Season`;

    const teams = uniqueTeamAliases(
      standings.map((row) => row.name),
      league.source.franchiseTeamNames
    );

    const payload: PlayersResponse = {
      players,
      meta: {
        source: "sportspress",
        fetchedAt: new Date().toISOString(),
        total: players.length,
        teams,
        season: key,
        seasonLabel,
        standings,
        league: leagueRef
      }
    };
    playersCache.set(key, payload);
    writeDisk(`season-${key}.json`, `players:${key}:${players.length}:${standings.length}`, payload);
    return payload;
  }

  const adapter: LeagueDataAdapter = {
    leagueId,
    getSeasons,
    getPlayers,
    getStandings,
    getSchedule,
    async getGame(eventId, opts) {
      const id = Number(eventId);
      if (!Number.isFinite(id) || id <= 0) return null;
      const cached = gameBoxCache.get(id);
      if (cached) return cached;

      const event = await fetchJson<SpEvent>(
        `${origin}/wp-json/sportspress/v2/events/${id}?_fields=id,date,status,title,link,teams,venues,main_results,results,players,performance`,
        20000
      );
      if (!event?.id) return null;

      const [names, venues] = await Promise.all([loadTeamNameMap(), loadVenueNameMap()]);
      const game = parseScheduleEvent(event, names, venues);
      if (!game) return null;

      const playerNames = new Map<number, string>();
      const key = seasonKey(opts?.season);
      const seasonPlayers = (playersCache.get(key) ?? (await getPlayers({ season: key, preferCache: true }))).players;
      for (const player of seasonPlayers) {
        const sourceId = Number(player.sourceId);
        if (Number.isFinite(sourceId) && player.name) playerNames.set(sourceId, player.name);
      }

      const missing = [
        ...new Set(
          Object.values(event.performance ?? {}).flatMap((block) =>
            Object.keys(block ?? {})
              .map((playerId) => Number(playerId))
              .filter((playerId) => playerId > 0 && !playerNames.has(playerId))
          )
        )
      ];
      for (const group of chunk(missing, 50)) {
        const rows = await fetchJson<SpPlayer[]>(
          `${origin}/wp-json/sportspress/v2/players?include=${group.join(",")}&per_page=${group.length}&_fields=id,title`,
          15000
        );
        for (const row of rows ?? []) {
          const name = decodeEntities(row.title?.rendered ?? "").trim();
          if (name) playerNames.set(row.id, name);
        }
      }

      const detail: GameDetail = {
        game,
        sides: parseBoxScore(event.performance, game.teams, playerNames),
        meta: { fetchedAt: new Date().toISOString(), league: leagueRef }
      };
      gameBoxCache.set(id, detail);
      return detail;
    },
    async getPlayerProfile() {
      return null;
    },
    async getPlayerGameLog() {
      return null;
    },
    async refresh(season) {
      const years = season
        ? [seasonKey(season)]
        : (await getSeasons({ force: true })).map((item) => item.year);
      const refreshed: string[] = [];
      const failed: string[] = [];
      for (const year of years) {
        try {
          await getPlayers({ season: year, force: true });
          await getSchedule({ season: year, force: true });
          refreshed.push(year);
        } catch {
          failed.push(year);
        }
      }
      return { refreshed, failed };
    },
    async warm() {
      warmState = {
        status: "running",
        warmed: [],
        failed: [],
        startedAt: new Date().toISOString(),
        finishedAt: null
      };
      const warmed: string[] = [];
      const failed: string[] = [];
      try {
        await getSeasons({ force: true });
        await getPlayers({ season: defaultSeason, force: true });
        await getSchedule({ season: defaultSeason, force: true });
        warmed.push(defaultSeason);
      } catch {
        failed.push(defaultSeason);
      }
      warmState = {
        status: "done",
        warmed,
        failed,
        startedAt: warmState.startedAt,
        finishedAt: new Date().toISOString()
      };
      return { warmed, failed };
    },
    status(): AdapterStatus {
      return {
        ok: true,
        service: league.serviceName,
        uptimeSeconds: Math.round(process.uptime()),
        warm: warmState,
        cache: {
          seasonsCached: playersCache.size || standingsCache.size,
          profilesCached: 0,
          seasons: [...playersCache.entries()].map(([year, payload]) => ({
            year,
            fetchedAt: payload.meta.fetchedAt,
            playerCount: payload.players.length,
            fingerprint: `${leagueId}:${year}`
          }))
        }
      };
    }
  };

  return adapter;
}

const adapters = new Map<string, LeagueDataAdapter>();

export function resetSportspressAdapters() {
  adapters.clear();
}

export function getSportspressAdapter(league: League): LeagueDataAdapter {
  const existing = adapters.get(league.id);
  if (existing) return existing;
  const created = createSportspressAdapter(league);
  adapters.set(league.id, created);
  return created;
}
