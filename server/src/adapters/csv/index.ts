import { createHash } from "node:crypto";
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
import { createSnapshotCache, type SnapshotPersistence } from "../../lib/snapshots.js";
import { buildPlayer, statsFromRow, toNumber, uniqueTeamAliases } from "../../lib/stats.js";
import type { AdapterFetchOpts, AdapterStatus, AdapterWarmState, LeagueDataAdapter } from "../types.js";

type CsvRow = Record<string, string>;

/** Everything a CSV tenant publishes, keyed by season. The sheets load together. */
type CsvData = {
  players: Map<string, Player[]>;
  standings: Map<string, TeamStanding[]>;
  schedule: Map<string, ScheduleGame[]>;
};

const EMPTY_DATA: CsvData = { players: new Map(), standings: new Map(), schedule: new Map() };

async function fetchText(url: string, userAgent: string, timeoutMs = 15000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "text/csv, text/plain, */*" },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return null;
    return await response.text();
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

  let warmState: AdapterWarmState = {
    status: "idle",
    warmed: [],
    failed: [],
    startedAt: null,
    finishedAt: null
  };

  function seasonYear(season?: string) {
    return season?.trim() || defaultSeason;
  }

  function seasonsOf(data: CsvData): SeasonInfo[] {
    const years = new Set([...data.players.keys(), ...data.standings.keys(), ...data.schedule.keys()]);
    return years.size
      ? [...years].sort((a, b) => Number(b) - Number(a)).map((year) => ({ year, label: `${year} Season`, slug: year }))
      : [{ year: defaultSeason, label: `${defaultSeason} Season`, slug: defaultSeason }];
  }

  function playersBySeason(rows: CsvRow[]) {
    const bySeason = new Map<string, Player[]>();
    for (const [year, seasonRows] of groupBySeason(rows, defaultSeason)) {
      bySeason.set(
        year,
        seasonRows
          .filter((row) => row.name?.trim())
          .map((row) =>
            buildPlayer(row.name.trim(), statsFromRow(row, league.source), {
              team: row.team?.trim() || undefined,
              sourceId: row.sourceid?.trim() || undefined,
              profileUrl: row.profileurl?.trim() || undefined
            })
          )
      );
    }
    return bySeason;
  }

  function mapSeasons<T>(rows: CsvRow[], build: (rows: CsvRow[]) => T) {
    return new Map([...groupBySeason(rows, defaultSeason)].map(([year, seasonRows]) => [year, build(seasonRows)]));
  }

  /** Three files, in the shape earlier versions wrote, so existing snapshots still load. */
  const persist: SnapshotPersistence<CsvData> = {
    read() {
      const players = readLeagueCache<Array<[string, Player[]]>>(leagueId, "players.json");
      const standings = readLeagueCache<Array<[string, TeamStanding[]]>>(leagueId, "standings.json");
      const schedule = readLeagueCache<Array<[string, ScheduleGame[]]>>(leagueId, "schedule.json");
      const newest = players ?? standings ?? schedule;
      if (!newest) return null;
      return {
        fingerprint: players?.fingerprint ?? "",
        savedAt: newest.savedAt,
        payload: {
          players: new Map(players?.payload ?? []),
          standings: new Map(standings?.payload ?? []),
          schedule: new Map(schedule?.payload ?? [])
        }
      };
    },
    write(_key, fingerprint, data) {
      writeLeagueCache(leagueId, "players.json", fingerprint, [...data.players]);
      writeLeagueCache(leagueId, "standings.json", fingerprint, [...data.standings]);
      writeLeagueCache(leagueId, "schedule.json", fingerprint, [...data.schedule]);
    }
  };

  const snapshots = createSnapshotCache<CsvData>({
    persist,
    usable: (data) => data.players.size > 0 || data.standings.size > 0 || data.schedule.size > 0,
    async load(_key, { previous, force }) {
      // No players sheet means nothing to fetch — keep whatever snapshot is on disk.
      if (!csv?.playersUrl) return null;

      const [playersText, standingsText, scheduleText] = await Promise.all([
        fetchText(csv.playersUrl, userAgent),
        csv.standingsUrl ? fetchText(csv.standingsUrl, userAgent) : Promise.resolve(null),
        csv.scheduleUrl ? fetchText(csv.scheduleUrl, userAgent) : Promise.resolve(null)
      ]);
      if (playersText == null && standingsText == null && scheduleText == null) return null;

      // Sheets carry no modified stamp, so the content itself is the fingerprint.
      const fingerprint = `csv:${createHash("sha1")
        .update([playersText, standingsText, scheduleText].map((text) => text ?? "-").join("\0"))
        .digest("hex")}`;
      if (!force && previous?.fingerprint === fingerprint) return { value: previous.value, fingerprint };

      // A sheet that failed to download keeps its last good rows; a sheet that
      // is no longer configured is dropped.
      const kept = previous?.value;
      return {
        fingerprint,
        value: {
          players: playersText != null ? playersBySeason(parseCsv(playersText)) : (kept?.players ?? new Map()),
          standings:
            standingsText != null
              ? mapSeasons(parseCsv(standingsText), standingsFromRows)
              : csv.standingsUrl
                ? (kept?.standings ?? new Map())
                : new Map(),
          schedule:
            scheduleText != null
              ? mapSeasons(parseCsv(scheduleText), scheduleFromRows)
              : csv.scheduleUrl
                ? (kept?.schedule ?? new Map())
                : new Map()
        }
      };
    }
  });

  async function loadData(opts?: AdapterFetchOpts): Promise<CsvData> {
    return (await snapshots.get("all", opts)) ?? EMPTY_DATA;
  }

  function playersPayload(data: CsvData, year: string): PlayersResponse {
    const players = data.players.get(year) ?? [];
    const standings = data.standings.get(year) ?? [];
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
        seasonLabel: seasonsOf(data).find((item) => item.year === year)?.label ?? `${year} Season`,
        standings,
        league: leagueRef
      }
    };
  }

  function schedulePayload(data: CsvData, year: string): ScheduleResponse {
    const games = data.schedule.get(year) ?? [];
    return {
      season: year,
      games,
      meta: { fetchedAt: new Date().toISOString(), total: games.length, league: leagueRef }
    };
  }

  const adapter: LeagueDataAdapter = {
    leagueId,
    async getSeasons(opts) {
      return seasonsOf(await loadData(opts));
    },
    async getPlayers(opts) {
      return playersPayload(await loadData(opts), seasonYear(opts?.season));
    },
    async getStandings(opts) {
      return (await loadData(opts)).standings.get(seasonYear(opts?.season)) ?? [];
    },
    async getSchedule(opts) {
      return schedulePayload(await loadData(opts), seasonYear(opts?.season));
    },
    async getGame(eventId, opts) {
      const data = await loadData();
      const year = seasonYear(opts?.season);
      const game = (data.schedule.get(year) ?? []).find((item) => String(item.id) === String(eventId));
      if (!game) return null;
      const detail: GameDetail = {
        game,
        sides: game.teams.map((side) => ({ ...side, players: [] })),
        meta: { fetchedAt: new Date().toISOString(), league: leagueRef }
      };
      return detail;
    },
    async getPlayerProfile(playerId) {
      const data = await loadData();
      const matchedSeasons: PlayerSeason[] = [];
      let identity: Player | undefined;
      for (const [year, players] of data.players) {
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
      const data = await loadData({ force: true });
      const years = season ? [seasonYear(season)] : seasonsOf(data).map((item) => item.year);
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
        const warmed = seasonsOf(await loadData({ force: true })).map((item) => item.year);
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
      const snapshot = snapshots.peek("all");
      const players = [...(snapshot?.value.players ?? [])];
      return {
        ok: true,
        service: league.serviceName,
        uptimeSeconds: Math.round(process.uptime()),
        warm: warmState,
        cache: {
          seasonsCached: players.length,
          profilesCached: 0,
          seasons: players.map(([year, seasonPlayers]) => ({
            year,
            fetchedAt: new Date(snapshot?.at ?? Date.now()).toISOString(),
            playerCount: seasonPlayers.length,
            fingerprint: snapshot?.fingerprint ?? ""
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
