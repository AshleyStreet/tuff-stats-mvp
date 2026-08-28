import type { LeagueDataAdapter } from "../types.js";
import {
  getGame,
  getPlayerGameLog,
  getPlayerProfile,
  getPlayers,
  getSchedule,
  getSeasons,
  getServiceStatus,
  getStandings,
  refreshSeasonData,
  warmSeasonCaches
} from "./source.js";

export function createTuffAdapter(): LeagueDataAdapter {
  return {
    leagueId: "tuff",
    getSeasons: (opts) =>
      getSeasons(opts?.force ?? false, opts?.preferCache ?? false, opts?.cacheOnly ?? false),
    getPlayers: (opts) =>
      getPlayers(opts?.force ?? false, opts?.season, opts?.preferCache ?? false, opts?.cacheOnly ?? false),
    getStandings: (opts) => getStandings(opts?.force ?? false, opts?.season),
    getSchedule: (opts) => getSchedule(opts?.force ?? false, opts?.season),
    getGame: (eventId, opts) => getGame(eventId, opts?.season),
    getPlayerProfile: (playerId) => getPlayerProfile(playerId),
    getPlayerGameLog: (playerId, opts) => getPlayerGameLog(playerId, opts?.season),
    refresh: (season) => refreshSeasonData(season),
    warm: () => warmSeasonCaches(),
    status: () => getServiceStatus()
  };
}

let tuffAdapter: LeagueDataAdapter | null = null;

export function getTuffAdapter(): LeagueDataAdapter {
  tuffAdapter ??= createTuffAdapter();
  return tuffAdapter;
}
