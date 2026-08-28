import type {
  GameDetail,
  PlayerGameLog,
  PlayerProfile,
  PlayersResponse,
  ScheduleResponse,
  SeasonInfo,
  TeamStanding
} from "../domain/types.js";

export type AdapterFetchOpts = {
  force?: boolean;
  season?: string;
  preferCache?: boolean;
  /** Never hit upstream APIs — return cached snapshots only (for HTML bootstrap). */
  cacheOnly?: boolean;
};

export type AdapterWarmState = {
  status: "idle" | "running" | "done";
  warmed: string[];
  failed: string[];
  startedAt: string | null;
  finishedAt: string | null;
};

export type AdapterStatus = {
  ok: true;
  service: string;
  uptimeSeconds: number;
  warm: AdapterWarmState;
  cache: {
    seasonsCached: number;
    profilesCached: number;
    seasons: Array<{
      year: string;
      fetchedAt: string;
      playerCount: number;
      fingerprint: string;
    }>;
  };
};

/**
 * What Express actually needs from a league source.
 * League identity lives in the registry, not here.
 */
export interface LeagueDataAdapter {
  readonly leagueId: string;
  getSeasons(opts?: AdapterFetchOpts): Promise<SeasonInfo[]>;
  getPlayers(opts?: AdapterFetchOpts): Promise<PlayersResponse>;
  getStandings(opts?: AdapterFetchOpts): Promise<TeamStanding[]>;
  getSchedule(opts?: AdapterFetchOpts): Promise<ScheduleResponse>;
  getGame(eventId: string, opts?: AdapterFetchOpts): Promise<GameDetail | null>;
  getPlayerProfile(playerId: string): Promise<PlayerProfile | null>;
  getPlayerGameLog(playerId: string, opts?: AdapterFetchOpts): Promise<PlayerGameLog | null>;
  refresh(season?: string): Promise<{ refreshed: string[]; failed: string[] }>;
  warm(): Promise<{ warmed: string[]; failed: string[] }>;
  status(): AdapterStatus;
}
