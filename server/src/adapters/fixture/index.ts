import { writeLeagueCache } from "../../lib/cache.js";
import { careerFromSeasons } from "../../lib/profile.js";
import { buildPlayer, emptyStats } from "../../lib/stats.js";
import { toLeagueRef } from "../../domain/types.js";
import type {
  BoxScorePlayer,
  GameDetail,
  Player,
  PlayerGameLog,
  PlayerProfile,
  PlayersResponse,
  ScheduleGame,
  ScheduleResponse,
  SeasonInfo,
  Stats
} from "../../domain/types.js";
import { emptyFixtureSeed, type FixtureBoxPlayer, type FixtureGameSeed, type FixtureSeed } from "../../leagues/fixture-seed.js";
import type { League } from "../../leagues/types.js";
import type { AdapterStatus, AdapterWarmState, LeagueDataAdapter } from "../types.js";
import { harborGames, harborPlayers, harborSeasons, harborStandings } from "./data.js";

function mergeStats(partial: Partial<Stats> = {}): Stats {
  return { ...emptyStats(), ...partial };
}

function totalTouchdowns(stats: Stats) {
  return stats.paTD + stats.ruTD + stats.recTD + stats.retTD;
}

function boxPlayer(row: FixtureBoxPlayer): BoxScorePlayer {
  const stats = mergeStats(row.stats);
  return {
    sourceId: row.sourceId,
    name: row.name,
    number: row.number,
    stats,
    derived: { totalTouchdowns: totalTouchdowns(stats) }
  };
}

function scheduleGame(seed: FixtureGameSeed): ScheduleGame {
  return {
    id: seed.id,
    date: seed.date,
    status: seed.status,
    title: seed.title,
    venue: seed.venue,
    teams: seed.teams.map((team) => ({ ...team }))
  };
}

function seedFor(league: League): FixtureSeed {
  if (league.fixture) return league.fixture;
  if (league.id === "harbor") {
    return {
      seasons: harborSeasons,
      players: harborPlayers,
      standings: harborStandings,
      games: harborGames
    };
  }
  return emptyFixtureSeed({
    slug: league.slug,
    publicSeason: league.publicSeason,
    franchiseTeamNames: league.source.franchiseTeamNames
  });
}

export function createFixtureAdapter(league: League): LeagueDataAdapter {
  const leagueRef = toLeagueRef(league);
  const seed = seedFor(league);
  const seasons = seed.seasons;
  const defaultSeason = league.publicSeason;
  const playersBySeason = new Map<string, Player[]>();
  const standingsBySeason = new Map<string, typeof seed.standings>();
  const gamesBySeason = new Map<string, FixtureGameSeed[]>();

  for (const season of seasons) {
    const year = season.year;
    playersBySeason.set(
      year,
      seed.players.map((row) =>
        buildPlayer(row.name, mergeStats(row.stats), { team: row.team, sourceId: row.sourceId })
      )
    );
    standingsBySeason.set(year, seed.standings);
    gamesBySeason.set(
      year,
      seed.games.filter((game) => !game.season || game.season === year)
    );
  }

  if (!playersBySeason.has(defaultSeason)) {
    playersBySeason.set(
      defaultSeason,
      seed.players.map((row) =>
        buildPlayer(row.name, mergeStats(row.stats), { team: row.team, sourceId: row.sourceId })
      )
    );
    standingsBySeason.set(defaultSeason, seed.standings);
    gamesBySeason.set(defaultSeason, seed.games);
  }

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

  function playersPayload(year: string): PlayersResponse {
    const players = playersBySeason.get(year) ?? [];
    const standings = standingsBySeason.get(year) ?? [];
    const teams = [
      ...new Set([
        ...players.map((player) => player.team).filter(Boolean),
        ...standings.map((row) => row.name)
      ])
    ] as string[];
    return {
      players,
      meta: {
        source: "fixture",
        fetchedAt: new Date().toISOString(),
        total: players.length,
        teams,
        season: year,
        seasonLabel: `${year} Season`,
        standings,
        league: leagueRef
      }
    };
  }

  function schedulePayload(year: string): ScheduleResponse {
    const games = (gamesBySeason.get(year) ?? []).map(scheduleGame);
    return {
      season: year,
      games,
      meta: { fetchedAt: new Date().toISOString(), total: games.length, league: leagueRef }
    };
  }

  const adapter: LeagueDataAdapter = {
    leagueId: league.id,
    async getSeasons(): Promise<SeasonInfo[]> {
      return seasons.length
        ? seasons
        : [{ year: defaultSeason, label: `${defaultSeason} Season`, slug: `${defaultSeason}-${league.slug}-stats` }];
    },
    async getPlayers(opts) {
      return playersPayload(seasonYear(opts?.season));
    },
    async getStandings(opts) {
      return standingsBySeason.get(seasonYear(opts?.season)) ?? [];
    },
    async getSchedule(opts) {
      return schedulePayload(seasonYear(opts?.season));
    },
    async getGame(eventId, opts) {
      const year = seasonYear(opts?.season);
      const seedGame = (gamesBySeason.get(year) ?? []).find((game) => String(game.id) === String(eventId));
      if (!seedGame) return null;
      const game = scheduleGame(seedGame);
      const detail: GameDetail = {
        game,
        sides: seedGame.sides.map((side) => ({
          id: side.id,
          name: side.name,
          score: side.score,
          outcome: side.outcome,
          players: side.players.map(boxPlayer)
        })),
        meta: { fetchedAt: new Date().toISOString(), league: leagueRef }
      };
      return detail;
    },
    async getPlayerProfile(playerId) {
      for (const [year, players] of playersBySeason) {
        const player = players.find((row) => row.id === playerId || row.sourceId === playerId);
        if (!player) continue;
        const row = seed.players.find((item) => item.sourceId === player.sourceId);
        const season = {
          season: year,
          team: player.team,
          stats: player.stats,
          derived: player.derived,
          sourceId: player.sourceId
        };
        const careerPlayer = careerFromSeasons(player.name, [season], player.sourceId);
        const profile: PlayerProfile = {
          id: player.id,
          sourceId: player.sourceId ?? "",
          name: player.name,
          number: row?.number,
          currentTeam: player.team,
          teams: player.team ? [player.team] : [],
          seasons: [season],
          career: {
            seasonsPlayed: 1,
            stats: careerPlayer.stats,
            derived: careerPlayer.derived
          },
          meta: { fetchedAt: new Date().toISOString(), league: leagueRef }
        };
        return profile;
      }
      return null;
    },
    async getPlayerGameLog(playerId, opts) {
      const year = seasonYear(opts?.season);
      const players = playersBySeason.get(year) ?? [];
      const player = players.find((row) => row.id === playerId || row.sourceId === playerId);
      if (!player?.sourceId) return null;
      const games = gamesBySeason.get(year) ?? [];
      const log: PlayerGameLog = {
        season: year,
        sourceIds: [player.sourceId],
        games: games.flatMap((gameSeed) => {
          const side = gameSeed.sides.find((item) => item.players.some((row) => row.sourceId === player.sourceId));
          if (!side) return [];
          const row = side.players.find((item) => item.sourceId === player.sourceId);
          if (!row) return [];
          const opponent = gameSeed.sides.find((item) => item.id !== side.id)?.name ?? "";
          const stats = mergeStats(row.stats);
          return [
            {
              game: scheduleGame(gameSeed),
              team: side.name,
              opponent,
              outcome: side.outcome,
              score: side.score,
              oppScore: gameSeed.sides.find((item) => item.id !== side.id)?.score,
              stats,
              derived: { totalTouchdowns: totalTouchdowns(stats) },
              number: row.number
            }
          ];
        }),
        meta: { fetchedAt: new Date().toISOString(), league: leagueRef }
      };
      return log;
    },
    async refresh(season) {
      const years = season
        ? [seasonYear(season)]
        : seasons.length
          ? seasons.map((item) => item.year)
          : [defaultSeason];
      const refreshed: string[] = [];
      for (const year of years) {
        const players = playersPayload(year);
        const schedule = schedulePayload(year);
        writeLeagueCache(league.slug, `season-${year}.json`, `fixture:${league.slug}:${year}`, players);
        writeLeagueCache(league.slug, `schedule-${year}.json`, `fixture:${league.slug}:${year}`, schedule.games);
        refreshed.push(year);
      }
      return { refreshed, failed: [] };
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
      const years = seasons.length ? seasons : [{ year: defaultSeason, label: `${defaultSeason} Season`, slug: "" }];
      for (const season of years) {
        await adapter.getPlayers({ season: season.year });
        await adapter.getSchedule({ season: season.year });
        warmed.push(season.year);
      }
      warmState = {
        status: "done",
        warmed,
        failed: [],
        startedAt: warmState.startedAt,
        finishedAt: new Date().toISOString()
      };
      return { warmed, failed: [] };
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
            fingerprint: `fixture:${league.slug}:${year}`
          }))
        }
      };
    }
  };

  return adapter;
}

const adapters = new Map<string, LeagueDataAdapter>();

export function resetFixtureAdapters() {
  adapters.clear();
}

export function getFixtureAdapter(league: League): LeagueDataAdapter {
  const existing = adapters.get(league.id);
  if (existing) return existing;
  const created = createFixtureAdapter(league);
  adapters.set(league.id, created);
  return created;
}
