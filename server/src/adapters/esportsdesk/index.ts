import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { toLeagueRef } from "../../domain/types.js";
import type {
  GameDetail,
  Player,
  PlayerProfile,
  PlayerSeason,
  PlayersResponse,
  ScheduleGame,
  ScheduleResponse,
  SeasonInfo,
  Stats,
  TeamStanding
} from "../../domain/types.js";
import type { EsportsdeskSeasonSlice, League } from "../../leagues/types.js";
import { readLeagueCache, writeLeagueCache } from "../../lib/cache.js";
import { careerFromSeasons } from "../../lib/profile.js";
import { buildPlayer, emptyStats, headerMap, toNumber, uniqueTeamAliases } from "../../lib/stats.js";
import type { AdapterStatus, AdapterWarmState, LeagueDataAdapter } from "../types.js";

const ORIGIN = "https://www.esportsdesk.com/leagues";
const DEFAULT_STATS_PAGE = "stats_football_flag.cfm";
const PLAYERS_PER_PAGE = 20;

/**
 * eSportsDesk 403s any User-Agent without a `Mozilla/` prefix (a bare
 * "Mozilla/5.0" is refused too), so the tenant's own userAgent can't be used
 * here. This keeps the conventional `compatible;` bot form — it identifies us
 * honestly rather than impersonating a browser.
 *
 * Their robots.txt allows these league pages under `User-agent: *`; it does
 * disallow /leagues/*clientID=5539, so honour per-client opt-outs before
 * onboarding a league.
 */
const USER_AGENT = "Mozilla/5.0 (compatible; AfterwhistleBot/0.1; +https://afterwhistle.ca)";
const OPTED_OUT_CLIENT_IDS = new Set(["5539"]);

/** Stats rows carry a leading rank cell that has no header, so cells outnumber headers. */
type StatsRow = { cells: string[]; playerId?: string; teamId?: string };

function text($: cheerio.CheerioAPI, el: Element) {
  return $(el).text().replace(/\s+/g, " ").trim();
}

/**
 * Their pages are wrapped in nested layout tables (nav, ads, headlines), so the
 * data table has to be found by its headers rather than by position.
 */
function findTableByHeaders($: cheerio.CheerioAPI, required: string[]) {
  let match: { headers: string[]; rows: Element[] } | null = null;
  $("table").each((_, table) => {
    if (match) return;
    // cheerio's find() is recursive, and these pages nest the data table inside
    // layout tables — so an outer table's "header row" flattens the entire page
    // and matches anything. Only leaf tables are real data tables.
    if ($(table).find("table").length > 0) return;

    const rows = $(table).find("tr").toArray();
    if (rows.length < 2) return;
    const headers = $(rows[0]!)
      .find("th,td")
      .map((_i, cell) => text($, cell))
      .get()
      .filter(Boolean);
    const upper = headers.map((h) => h.toUpperCase());
    if (!required.every((need) => upper.includes(need))) return;
    match = { headers, rows: rows.slice(1) };
  });
  return match as { headers: string[]; rows: Element[] } | null;
}

function idFromHref(href: string | undefined, param: string) {
  const hit = new RegExp(`[?&]${param}=(\\d+)`, "i").exec(href ?? "");
  return hit?.[1];
}

function parsePlayerRows(html: string): { headers: string[]; rows: StatsRow[] } {
  const $ = cheerio.load(html);
  const table = findTableByHeaders($, ["PLAYER", "GP", "TD"]);
  if (!table) return { headers: [], rows: [] };

  const rows: StatsRow[] = [];
  for (const row of table.rows) {
    const cells = $(row)
      .find("td")
      .map((_i, cell) => text($, cell))
      .get();
    if (!cells.length) continue;
    const playerHref = $(row).find('a[href*="rosters_profile.cfm"]').attr("href");
    const teamHref = $(row).find('a[href*="stats_1team.cfm"]').attr("href");
    rows.push({
      cells,
      playerId: idFromHref(playerHref, "playerID"),
      teamId: idFromHref(teamHref, "teamID")
    });
  }
  return { headers: table.headers, rows };
}

/**
 * Aligns a row against the header list from the right. Rows carry an extra
 * leading rank cell that has no header, and trailing columns are stable, so
 * right-alignment survives that offset without hard-coding it.
 */
function alignToHeaders(headers: string[], cells: string[]): Record<string, string> {
  const offset = cells.length - headers.length;
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    const cell = cells[index + Math.max(0, offset)];
    if (cell !== undefined) record[header.toUpperCase()] = cell;
  });
  return record;
}

function statsFromEsdRow(row: Record<string, string>): Stats {
  const stats = emptyStats();
  for (const [rawKey, value] of Object.entries(row)) {
    const mapped = headerMap[rawKey.toLowerCase()];
    // PTS/PPG are derived downstream from td/conv1/conv2 — never map them in, or
    // buildPlayer's recomputed totals would double-count.
    if (mapped && rawKey.toUpperCase() !== "PTS" && rawKey.toUpperCase() !== "PPG") {
      stats[mapped] = toNumber(value);
    }
  }
  return stats;
}

function parseStandings(html: string): TeamStanding[] {
  const $ = cheerio.load(html);
  const table = findTableByHeaders($, ["TEAM", "GP", "W", "L"]);
  if (!table) return [];

  const upper = table.headers.map((h) => h.toUpperCase());
  const at = (name: string) => upper.indexOf(name);
  // Their standings label points-for and points-against with the same "PF"
  // header, so the pair has to be read positionally rather than by name.
  const firstPf = at("PF");
  const lastPf = upper.lastIndexOf("PF");

  const standings: TeamStanding[] = [];
  for (const row of table.rows) {
    const cells = $(row)
      .find("td")
      .map((_i, cell) => text($, cell))
      .get();
    if (cells.length < table.headers.length) continue;
    const name = cells[at("TEAM")]?.trim();
    if (!name || name.toUpperCase() === "TEAM") continue;

    const wins = toNumber(cells[at("W")]);
    const losses = toNumber(cells[at("L")]);
    const ties = toNumber(cells[at("T")]);
    const pointsFor = firstPf >= 0 ? toNumber(cells[firstPf]) : 0;
    const pointsAgainst = lastPf > firstPf ? toNumber(cells[lastPf]) : 0;
    const games = wins + losses + ties;
    const streak = at("STRK") >= 0 ? cells[at("STRK")]?.trim() : undefined;

    standings.push({
      name,
      wins,
      losses,
      ties,
      pct: at("PCT") >= 0 ? toNumber(cells[at("PCT")]) : games ? Number(((wins + ties * 0.5) / games).toFixed(3)) : 0,
      pointsFor,
      pointsAgainst,
      netPoints: pointsFor - pointsAgainst,
      standingsPoints: at("PTS") >= 0 ? toNumber(cells[at("PTS")]) : wins * 2 + ties,
      streak: streak && streak !== "-" ? streak : undefined
    });
  }

  return standings.map((row, index) => ({ ...row, pos: index + 1 }));
}

export type EsportsdeskInspection = {
  ok: boolean;
  clientId: string;
  leagueId?: string;
  leagueName?: string;
  standings: TeamStanding[];
  players: number;
  /** Highest games-played in the table — tells you mid-season from wrapped. */
  gamesPlayed: number;
  topScorer?: { name: string; team?: string; points: number };
  /** One concrete line you can put in an email. */
  headline?: string;
  notes: string[];
};

async function inspectFetch(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(20000)
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/**
 * Qualifies a prospect league without configuring a tenant: can we read it,
 * how big is it, and is the season live. Uses the same parsers the adapter
 * uses, so the answer can't drift from what the product would actually do.
 */
export async function inspectEsportsdeskLeague(
  clientId: string,
  leagueId?: string
): Promise<EsportsdeskInspection> {
  const notes: string[] = [];
  if (OPTED_OUT_CLIENT_IDS.has(clientId)) {
    return { ok: false, clientId, standings: [], players: 0, gamesPlayed: 0, notes: ["This client has opted out in robots.txt — do not approach."] };
  }

  let resolved = leagueId;
  if (!resolved) {
    const landing = await inspectFetch(`${ORIGIN}/clear.cfm?clientid=${encodeURIComponent(clientId)}`);
    resolved = /leagueID=(\d+)/i.exec(landing ?? "")?.[1];
    if (!resolved) notes.push("No leagueID discoverable from the landing page — pass one explicitly.");
  }
  if (!resolved) {
    return { ok: false, clientId, standings: [], players: 0, gamesPlayed: 0, notes };
  }

  const params = `leagueID=${encodeURIComponent(resolved)}&clientID=${encodeURIComponent(clientId)}`;
  const standingsHtml = await inspectFetch(`${ORIGIN}/standings.cfm?${params}`);
  const standings = standingsHtml ? parseStandings(standingsHtml) : [];
  const leagueName = /<title[^>]*>([^<]*?)(?:\s*-\s*Powered By)?<\/title>/i
    .exec(standingsHtml ?? "")?.[1]
    ?.trim();

  const statsHtml = await inspectFetch(
    `${ORIGIN}/${DEFAULT_STATS_PAGE}?${params}&statType=Player&showGameType=2&sortby=PTS1&selectedDivID=0&start_row=1`
  );
  const parsed = statsHtml ? parsePlayerRows(statsHtml) : { headers: [], rows: [] };

  let topScorer: EsportsdeskInspection["topScorer"];
  for (const row of parsed.rows) {
    const record = alignToHeaders(parsed.headers, row.cells);
    const name = (record.PLAYER ?? "").trim();
    if (!name || name.toUpperCase() === "PLAYER") continue;
    const points = toNumber(record.PTS);
    if (!topScorer || points > topScorer.points) {
      topScorer = { name, team: (record.TEAM ?? "").trim() || undefined, points };
    }
  }

  const gamesPlayed = standings.reduce((max, row) => Math.max(max, row.wins + row.losses + row.ties), 0);
  if (!standings.length) notes.push("No standings table found.");
  if (!parsed.rows.length) notes.push("No player stats published — board would be standings and schedule only.");

  // A roster can exist with every stat at zero — the league simply hasn't
  // recorded any yet. Quoting a "top scorer with 0 points" in an approach
  // would be worse than quoting nothing, so drop the claim entirely.
  if (parsed.rows.length && (!topScorer || topScorer.points <= 0)) {
    topScorer = undefined;
    notes.push("Roster is published but every stat is zero — they aren't recording player stats yet.");
  }

  const leader = standings[0];
  const record = leader
    ? `${leader.wins}-${leader.losses}${leader.ties ? `-${leader.ties}` : ""}`
    : "";
  const headline =
    leader && topScorer
      ? `${leader.name} lead at ${record}, and ${topScorer.name} tops scoring with ${topScorer.points} points.`
      : leader
        ? `${leader.name} lead at ${record}.`
        : undefined;

  return {
    ok: standings.length > 0 || parsed.rows.length > 0,
    clientId,
    leagueId: resolved,
    leagueName,
    standings,
    players: parsed.rows.length,
    gamesPlayed,
    topScorer,
    headline,
    notes
  };
}

/**
 * Reads a league's public eSportsDesk pages. There is no API — every page is
 * server-rendered ColdFusion — so this parses the stats and standings tables.
 * Player and team ids come off the profile links, which makes sourceIds stable
 * across seasons.
 */
export function createEsportsdeskAdapter(league: League): LeagueDataAdapter {
  const leagueRef = toLeagueRef(league);
  const esd = league.source.esportsdesk;
  const leagueId = league.id;
  const defaultSeason = league.publicSeason;
  const gameType = esd?.gameType ?? 2;
  const statsPage = esd?.statsPage ?? DEFAULT_STATS_PAGE;
  const maxPages = esd?.maxPlayerPages ?? 25;

  const playersCache = new Map<string, PlayersResponse>();
  const standingsCache = new Map<string, TeamStanding[]>();
  let warmState: AdapterWarmState = {
    status: "idle",
    warmed: [],
    failed: [],
    startedAt: null,
    finishedAt: null
  };

  function sliceFor(key: string): EsportsdeskSeasonSlice | undefined {
    const seasons = esd?.seasons ?? [];
    return seasons.find((season) => season.key === key) ?? seasons[0];
  }

  function seasonKey(season?: string) {
    return season?.trim() || defaultSeason;
  }

  async function fetchHtml(url: string, timeoutMs = 20000): Promise<string | null> {
    if (esd?.clientId && OPTED_OUT_CLIENT_IDS.has(esd.clientId)) return null;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  function pageUrl(page: string, slice: EsportsdeskSeasonSlice, extra: Record<string, string> = {}) {
    const params = new URLSearchParams({
      leagueID: slice.leagueId,
      clientID: esd?.clientId ?? "",
      ...extra
    });
    return `${ORIGIN}/${page}?${params.toString()}`;
  }

  async function loadStandings(key: string, force: boolean): Promise<TeamStanding[]> {
    if (!force) {
      const memory = standingsCache.get(key);
      if (memory) return memory;
      const disk = readLeagueCache<TeamStanding[]>(leagueId, `standings-${key}.json`);
      if (disk?.payload?.length) {
        standingsCache.set(key, disk.payload);
        return disk.payload;
      }
    }

    const slice = sliceFor(key);
    if (!slice) return standingsCache.get(key) ?? [];
    const html = await fetchHtml(pageUrl("standings.cfm", slice));
    const standings = html ? parseStandings(html) : [];
    if (standings.length) {
      standingsCache.set(key, standings);
      writeLeagueCache(leagueId, `standings-${key}.json`, `esd:${slice.leagueId}:${standings.length}`, standings);
      return standings;
    }
    return standingsCache.get(key) ?? [];
  }

  async function loadPlayers(key: string, force: boolean): Promise<Player[]> {
    const slice = sliceFor(key);
    if (!slice) return [];

    const players: Player[] = [];
    const seen = new Set<string>();

    // Their stats view pages 20 at a time via a startRow offset.
    for (let page = 0; page < maxPages; page += 1) {
      const url = pageUrl(statsPage, slice, {
        statType: "Player",
        showGameType: String(gameType),
        sortby: "PTS1",
        selectedDivID: "0",
        start_row: String(page * PLAYERS_PER_PAGE + 1)
      });
      const html = await fetchHtml(url);
      if (!html) break;

      const { headers, rows } = parsePlayerRows(html);
      if (!headers.length || !rows.length) break;

      let added = 0;
      for (const row of rows) {
        const record = alignToHeaders(headers, row.cells);
        const name = (record.PLAYER ?? "").trim();
        if (!name || name.toUpperCase() === "PLAYER") continue;
        const dedupeKey = row.playerId ?? name.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const team = (record.TEAM ?? "").trim();
        players.push(
          buildPlayer(name, statsFromEsdRow(record), {
            sourceId: row.playerId,
            team: team && team !== "-" ? team : undefined,
            profileUrl: row.playerId
              ? `${ORIGIN}/rosters_profile.cfm?clientID=${esd?.clientId}&leagueID=${slice.leagueId}&playerID=${row.playerId}`
              : undefined
          })
        );
        added += 1;
      }

      // Last page reached: fewer than a full page, or the page repeated rows we already had.
      if (added === 0 || rows.length < PLAYERS_PER_PAGE) break;
    }

    return players;
  }

  async function buildPlayersPayload(key: string, force: boolean): Promise<PlayersResponse> {
    const [players, standings] = await Promise.all([loadPlayers(key, force), loadStandings(key, force)]);
    const teams = uniqueTeamAliases(
      standings.map((row) => row.name),
      players.map((player) => player.team ?? "").filter(Boolean)
    );
    return {
      players,
      meta: {
        source: "html",
        fetchedAt: new Date().toISOString(),
        total: players.length,
        teams,
        season: key,
        seasonLabel: sliceFor(key)?.label ?? `${key} Season`,
        standings,
        league: leagueRef
      }
    };
  }

  async function getPlayersPayload(key: string, opts?: { force?: boolean; cacheOnly?: boolean }) {
    if (!opts?.force) {
      const memory = playersCache.get(key);
      if (memory) return memory;
      const disk = readLeagueCache<PlayersResponse>(leagueId, `season-${key}.json`);
      if (disk?.payload?.players?.length) {
        playersCache.set(key, disk.payload);
        return disk.payload;
      }
      if (opts?.cacheOnly) throw new Error("Season cache miss");
    }

    const payload = await buildPlayersPayload(key, Boolean(opts?.force));
    if (payload.players.length || payload.meta.standings?.length) {
      playersCache.set(key, payload);
      writeLeagueCache(leagueId, `season-${key}.json`, `esd:${key}:${payload.players.length}`, payload);
    }
    return payload;
  }

  const adapter: LeagueDataAdapter = {
    leagueId,
    async getSeasons() {
      const seasons = esd?.seasons ?? [];
      if (!seasons.length) {
        return [{ year: defaultSeason, label: `${defaultSeason} Season`, slug: defaultSeason }];
      }
      return seasons.map(
        (slice): SeasonInfo => ({
          year: slice.key,
          label: slice.label,
          slug: slice.leagueId,
          url: pageUrl("standings.cfm", slice)
        })
      );
    },
    async getPlayers(opts) {
      return getPlayersPayload(seasonKey(opts?.season), {
        force: opts?.force,
        cacheOnly: opts?.cacheOnly
      });
    },
    async getStandings(opts) {
      const key = seasonKey(opts?.season);
      if (!opts?.force) {
        const cached = standingsCache.get(key);
        if (cached) return cached;
      }
      return loadStandings(key, Boolean(opts?.force));
    },
    async getSchedule(opts): Promise<ScheduleResponse> {
      // Schedule parsing is a separate pass — schedules.cfm has its own layout.
      const key = seasonKey(opts?.season);
      const games: ScheduleGame[] = [];
      return {
        season: key,
        games,
        meta: { fetchedAt: new Date().toISOString(), total: games.length, league: leagueRef }
      };
    },
    async getGame(): Promise<GameDetail | null> {
      return null;
    },
    async getPlayerProfile(playerId) {
      const seasons = await adapter.getSeasons();
      const appearances: PlayerSeason[] = [];
      let identity: Player | undefined;

      for (const season of seasons) {
        const payload = playersCache.get(season.year) ?? readLeagueCache<PlayersResponse>(leagueId, `season-${season.year}.json`)?.payload;
        const player = payload?.players.find((row) => row.id === playerId || row.sourceId === playerId);
        if (!player) continue;
        identity ??= player;
        appearances.push({
          season: season.year,
          team: player.team,
          stats: player.stats,
          derived: player.derived,
          sourceId: player.sourceId
        });
      }
      if (!identity) return null;

      appearances.sort((a, b) => Number(b.season) - Number(a.season));
      const career = careerFromSeasons(identity.name, appearances, identity.sourceId);
      const profile: PlayerProfile = {
        id: identity.id,
        sourceId: identity.sourceId ?? "",
        name: identity.name,
        profileUrl: identity.profileUrl,
        currentTeam: appearances[0]?.team,
        teams: [...new Set(appearances.map((row) => row.team).filter((team): team is string => Boolean(team)))],
        seasons: appearances,
        career: {
          seasonsPlayed: appearances.length,
          stats: career.stats,
          derived: career.derived
        },
        meta: { fetchedAt: new Date().toISOString(), league: leagueRef }
      };
      return profile;
    },
    async getPlayerGameLog() {
      return null;
    },
    async refresh(season) {
      const keys = season ? [seasonKey(season)] : (esd?.seasons ?? []).map((slice) => slice.key);
      const refreshed: string[] = [];
      const failed: string[] = [];
      for (const key of keys.length ? keys : [defaultSeason]) {
        try {
          const payload = await getPlayersPayload(key, { force: true });
          if (payload.players.length || payload.meta.standings?.length) refreshed.push(key);
          else failed.push(key);
        } catch {
          failed.push(key);
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
      const { refreshed, failed } = await adapter.refresh(defaultSeason);
      warmState = {
        status: "done",
        warmed: refreshed,
        failed,
        startedAt: warmState.startedAt,
        finishedAt: new Date().toISOString()
      };
      return { warmed: refreshed, failed };
    },
    status(): AdapterStatus {
      return {
        ok: true,
        service: league.serviceName,
        uptimeSeconds: Math.round(process.uptime()),
        warm: warmState,
        cache: {
          seasonsCached: playersCache.size,
          profilesCached: 0,
          seasons: [...playersCache.entries()].map(([year, payload]) => ({
            year,
            fetchedAt: payload.meta.fetchedAt,
            playerCount: payload.players.length,
            fingerprint: `esd:${leagueId}:${year}`
          }))
        }
      };
    }
  };

  return adapter;
}

const adapters = new Map<string, LeagueDataAdapter>();

export function resetEsportsdeskAdapters() {
  adapters.clear();
}

export function getEsportsdeskAdapter(league: League): LeagueDataAdapter {
  const existing = adapters.get(league.id);
  if (existing) return existing;
  const created = createEsportsdeskAdapter(league);
  adapters.set(league.id, created);
  return created;
}
