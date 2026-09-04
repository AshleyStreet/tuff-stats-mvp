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
  TeamStanding
} from "../../domain/types.js";
import type { League } from "../../leagues/types.js";
import { readLeagueCache, writeLeagueCache } from "../../lib/cache.js";
import { parseCsv } from "../../lib/csv.js";
import { careerFromSeasons } from "../../lib/profile.js";
import { buildPlayer, statsFromRow, toNumber, uniqueTeamAliases } from "../../lib/stats.js";
import type { AdapterStatus, AdapterWarmState, LeagueDataAdapter } from "../types.js";

type CsvRow = Record<string, string>;

async function fetchCsv(url: string, userAgent: string, timeoutMs = 15000): Promise<CsvRow[] | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "text/csv, text/plain, */*" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return null;
    return parseCsv(await response.text());
  } catch {
    return null;
  }
}

function groupBySeason(rows: CsvRow[], defaultSeason: string): Map<string, CsvRow[]> {
  const bySeason = new Map<string, CsvRow[]>();
  for (const row of rows) {
    const year = row.season?.trim() || defaultSeason;
    const list = bySeason.get(year) ?? [];
    list.push(row);
    bySeason.set(year, list);
  }
  return bySeason;
}

function standingsFromRows(rows: CsvRow[]): TeamStanding[] {
  const teams = rows
    .map((row) => {
      const name = (row.name ?? row.team ?? "").trim();
      const wins = toNumber(row.wins);
      const losses = toNumber(row.losses);
      const ties = toNumber(row.ties);
      const games = wins + losses + ties;
      const pointsFor = toNumber(row.pointsfor ?? row.pf);
      const pointsAgainst = toNumber(row.pointsagainst ?? row.pa);
      const standing: Omit<TeamStanding, "pos"> = {
        name,
        wins,
        losses,
        ties,
        pct: games > 0 ? Number(((wins + ties * 0.5) / games).toFixed(3)) : 0,
        pointsFor,
        pointsAgainst,
        netPoints: pointsFor - pointsAgainst,
        standingsPoints: wins * 2 + ties,
        streak: row.streak?.trim() || undefined
      };
      return standing;
    })
    .filter((row) => row.name);

  teams.sort((a, b) => b.standingsPoints - a.standingsPoints || b.netPoints - a.netPoints);
  return teams.map((row, index) => ({ ...row, pos: index + 1 }));
}

function scheduleFromRows(rows: CsvRow[]): ScheduleGame[] {
  return rows
    .map((row, index): ScheduleGame | null => {
      const home = (row.hometeam ?? row.home ?? "").trim();
      const away = (row.awayteam ?? row.away ?? "").trim();
      if (!home && !away) return null;

      const homeScore = row.homescore?.trim() ? toNumber(row.homescore) : undefined;
      const awayScore = row.awayscore?.trim() ? toNumber(row.awayscore) : undefined;
      const statusRaw = row.status?.trim().toLowerCase();
      const status =
        statusRaw === "final" || statusRaw === "upcoming"
          ? statusRaw
          : homeScore != null && awayScore != null
            ? "final"
            : "upcoming";
      const outcome = (mine?: number, theirs?: number) =>
        status !== "final" || mine == null || theirs == null
          ? undefined
          : mine > theirs
            ? "win"
            : mine < theirs
              ? "loss"
              : "tie";

      const id = Number(row.id) || index + 1;
      return {
        id,
        date: row.date?.trim() || new Date().toISOString(),
        status,
        title: row.title?.trim() || `${home} vs ${away}`,
        venue: row.venue?.trim() || undefined,
        teams: [
          { id: 1, name: home, score: homeScore, outcome: outcome(homeScore, awayScore) },
          { id: 2, name: away, score: awayScore, outcome: outcome(awayScore, homeScore) }
        ]
      };
    })
    .filter((game): game is ScheduleGame => Boolean(game))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Ingests player/standings/schedule data from published spreadsheet CSV
 * exports instead of a live API — for leagues run on a Google Sheet rather
 * than SportsPress. No per-game box scores: getGame returns empty rosters
 * and getPlayerGameLog returns null, since the CSVs carry season totals only.
 */
export function createCsvAdapter(league: League): LeagueDataAdapter {
  const leagueRef = toLeagueRef(league);
  const csv = league.source.csv;
  const userAgent = league.source.userAgent;
  const defaultSeason = league.publicSeason;
  const leagueId = league.id;

  const playersBySeason = new Map<string, Player[]>();
  const standingsBySeason = new Map<string, TeamStanding[]>();
  const scheduleBySeason = new Map<string, ScheduleGame[]>();
  let seasons: SeasonInfo[] = [];
  let loaded = false;
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

  function seasonYear(season?: string) {
    return season?.trim() || defaultSeason;
  }

  function recomputeSeasons() {
    const years = new Set([...playersBySeason.keys(), ...standingsBySeason.keys(), ...scheduleBySeason.keys()]);
    seasons = years.size
      ? [...years].sort((a, b) => Number(b) - Number(a)).map((year) => ({ year, label: `${year} Season`, slug: year }))
      : [{ year: defaultSeason, label: `${defaultSeason} Season`, slug: defaultSeason }];
  }

  function hydratePlayersFromDisk() {
    const disk = readDisk<Array<[string, Player[]]>>("players.json");
    if (!disk?.payload) return;
    playersBySeason.clear();
    for (const [year, players] of disk.payload) playersBySeason.set(year, players);
  }
  function hydrateStandingsFromDisk() {
    const disk = readDisk<Array<[string, TeamStanding[]]>>("standings.json");
    if (!disk?.payload) return;
    standingsBySeason.clear();
    for (const [year, standings] of disk.payload) standingsBySeason.set(year, standings);
  }
  function hydrateScheduleFromDisk() {
    const disk = readDisk<Array<[string, ScheduleGame[]]>>("schedule.json");
    if (!disk?.payload) return;
    scheduleBySeason.clear();
    for (const [year, games] of disk.payload) scheduleBySeason.set(year, games);
  }

  async function loadAll(opts: { force?: boolean; cacheOnly?: boolean } = {}) {
    if (loaded && !opts.force) return;

    if (opts.cacheOnly || !csv?.playersUrl) {
      hydratePlayersFromDisk();
      hydrateStandingsFromDisk();
      hydrateScheduleFromDisk();
      recomputeSeasons();
      loaded = true;
      return;
    }

    const [playerRows, standingsRows, scheduleRows] = await Promise.all([
      fetchCsv(csv.playersUrl, userAgent),
      csv.standingsUrl ? fetchCsv(csv.standingsUrl, userAgent) : Promise.resolve(null),
      csv.scheduleUrl ? fetchCsv(csv.scheduleUrl, userAgent) : Promise.resolve(null)
    ]);

    if (playerRows) {
      playersBySeason.clear();
      for (const [year, rows] of groupBySeason(playerRows, defaultSeason)) {
        const players = rows
          .filter((row) => row.name?.trim())
          .map((row) =>
            buildPlayer(row.name.trim(), statsFromRow(row, league.source), {
              team: row.team?.trim() || undefined,
              sourceId: row.sourceid?.trim() || undefined,
              profileUrl: row.profileurl?.trim() || undefined
            })
          );
        playersBySeason.set(year, players);
      }
      writeDisk("players.json", `csv:${playerRows.length}`, [...playersBySeason.entries()]);
    } else {
      hydratePlayersFromDisk();
    }

    if (standingsRows) {
      standingsBySeason.clear();
      for (const [year, rows] of groupBySeason(standingsRows, defaultSeason)) {
        standingsBySeason.set(year, standingsFromRows(rows));
      }
      writeDisk("standings.json", `csv:${standingsRows.length}`, [...standingsBySeason.entries()]);
    } else if (csv.standingsUrl) {
      hydrateStandingsFromDisk();
    }

    if (scheduleRows) {
      scheduleBySeason.clear();
      for (const [year, rows] of groupBySeason(scheduleRows, defaultSeason)) {
        scheduleBySeason.set(year, scheduleFromRows(rows));
      }
      writeDisk("schedule.json", `csv:${scheduleRows.length}`, [...scheduleBySeason.entries()]);
    } else if (csv.scheduleUrl) {
      hydrateScheduleFromDisk();
    }

    recomputeSeasons();
    loaded = true;
  }

  function playersPayload(year: string): PlayersResponse {
    const players = playersBySeason.get(year) ?? [];
    const standings = standingsBySeason.get(year) ?? [];
    const teams = uniqueTeamAliases(
      standings.map((row) => row.name),
      league.source.franchiseTeamNames
    );
    return {
      players,
      meta: {
        source: "csv",
        fetchedAt: new Date().toISOString(),
        total: players.length,
        teams,
        season: year,
        seasonLabel: seasons.find((item) => item.year === year)?.label ?? `${year} Season`,
        standings,
        league: leagueRef
      }
    };
  }

  function schedulePayload(year: string): ScheduleResponse {
    const games = scheduleBySeason.get(year) ?? [];
    return {
      season: year,
      games,
      meta: { fetchedAt: new Date().toISOString(), total: games.length, league: leagueRef }
    };
  }

  const adapter: LeagueDataAdapter = {
    leagueId,
    async getSeasons(opts) {
      await loadAll({ force: opts?.force, cacheOnly: opts?.cacheOnly });
      return seasons;
    },
    async getPlayers(opts) {
      await loadAll({ force: opts?.force, cacheOnly: opts?.cacheOnly });
      return playersPayload(seasonYear(opts?.season));
    },
    async getStandings(opts) {
      await loadAll({ force: opts?.force, cacheOnly: opts?.cacheOnly });
      return standingsBySeason.get(seasonYear(opts?.season)) ?? [];
    },
    async getSchedule(opts) {
      await loadAll({ force: opts?.force, cacheOnly: opts?.cacheOnly });
      return schedulePayload(seasonYear(opts?.season));
    },
    async getGame(eventId, opts) {
      await loadAll();
      const year = seasonYear(opts?.season);
      const game = (scheduleBySeason.get(year) ?? []).find((item) => String(item.id) === String(eventId));
      if (!game) return null;
      const detail: GameDetail = {
        game,
        sides: game.teams.map((side) => ({ ...side, players: [] })),
        meta: { fetchedAt: new Date().toISOString(), league: leagueRef }
      };
      return detail;
    },
    async getPlayerProfile(playerId) {
      await loadAll();
      const matchedSeasons: PlayerSeason[] = [];
      let identity: Player | undefined;
      for (const [year, players] of playersBySeason) {
        const player = players.find((row) => row.id === playerId || row.sourceId === playerId);
        if (!player) continue;
        identity ??= player;
        matchedSeasons.push({
          season: year,
          team: player.team,
          stats: player.stats,
          derived: player.derived,
          sourceId: player.sourceId
        });
      }
      if (!identity) return null;
      matchedSeasons.sort((a, b) => Number(b.season) - Number(a.season));
      const career = careerFromSeasons(identity.name, matchedSeasons, identity.sourceId);
      const profile: PlayerProfile = {
        id: identity.id,
        sourceId: identity.sourceId ?? "",
        name: identity.name,
        profileUrl: identity.profileUrl,
        currentTeam: matchedSeasons[0]?.team,
        teams: [...new Set(matchedSeasons.map((row) => row.team).filter((team): team is string => Boolean(team)))],
        seasons: matchedSeasons,
        career: {
          seasonsPlayed: matchedSeasons.length,
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
      await loadAll({ force: true });
      const years = season ? [seasonYear(season)] : seasons.map((item) => item.year);
      return { refreshed: years, failed: [] };
    },
    async warm() {
      warmState = {
        status: "running",
        warmed: [],
        failed: [],
        startedAt: new Date().toISOString(),
        finishedAt: null
      };
      try {
        await loadAll({ force: true });
        const warmed = seasons.map((item) => item.year);
        warmState = { status: "done", warmed, failed: [], startedAt: warmState.startedAt, finishedAt: new Date().toISOString() };
        return { warmed, failed: [] };
      } catch {
        warmState = {
          status: "done",
          warmed: [],
          failed: [leagueId],
          startedAt: warmState.startedAt,
          finishedAt: new Date().toISOString()
        };
        return { warmed: [], failed: [leagueId] };
      }
    },
    status(): AdapterStatus {
      return {
        ok: true,
        service: league.serviceName,
        uptimeSeconds: Math.round(process.uptime()),
        warm: warmState,
        cache: {
          seasonsCached: playersBySeason.size,
          profilesCached: 0,
          seasons: [...playersBySeason.entries()].map(([year, players]) => ({
            year,
            fetchedAt: new Date().toISOString(),
            playerCount: players.length,
            fingerprint: `csv:${leagueId}:${year}`
          }))
        }
      };
    }
  };

  return adapter;
}

const adapters = new Map<string, LeagueDataAdapter>();

export function resetCsvAdapters() {
  adapters.clear();
}

export function getCsvAdapter(league: League): LeagueDataAdapter {
  const existing = adapters.get(league.id);
  if (existing) return existing;
  const created = createCsvAdapter(league);
  adapters.set(league.id, created);
  return created;
}
