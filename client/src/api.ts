import type { GameDetail, PlayerGameLog, PlayerProfile, PlayersResponse, ScheduleResponse, SeasonInfo } from "./types";

const profileCache = new Map<string, PlayerProfile>();
const profileInflight = new Map<string, Promise<PlayerProfile>>();
const seasonPlayersCache = new Map<string, PlayersResponse>();
const seasonPlayersInflight = new Map<string, Promise<PlayersResponse>>();
const scheduleCache = new Map<string, ScheduleResponse>();
const scheduleInflight = new Map<string, Promise<ScheduleResponse>>();

export async function getSeasons() {
  const response = await fetch("/api/seasons");
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail ?? "Could not load seasons");
  }
  return response.json() as Promise<{ seasons: SeasonInfo[]; defaultSeason: string }>;
}

export async function getPlayers(season = "", options: { bypassCache?: boolean } = {}) {
  const key = season || "default";
  if (options.bypassCache) {
    seasonPlayersCache.delete(key);
  } else {
    const cached = seasonPlayersCache.get(key);
    if (cached) return cached;
  }

  const pending = seasonPlayersInflight.get(key);
  if (pending && !options.bypassCache) return pending;

  const request = (async () => {
    const params = new URLSearchParams();
    if (season) params.set("season", season);
    const response = await fetch(`/api/players?${params}`);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail ?? "Could not load player stats");
    }
    const data = (await response.json()) as PlayersResponse;
    seasonPlayersCache.set(key, data);
    return data;
  })().finally(() => {
    seasonPlayersInflight.delete(key);
  });

  seasonPlayersInflight.set(key, request);
  return request;
}

export function peekSeasonPlayers(season = "") {
  return seasonPlayersCache.get(season || "default") ?? null;
}

export async function getSchedule(season = "") {
  const key = season || "default";
  const cached = scheduleCache.get(key);
  if (cached) return cached;

  const pending = scheduleInflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const params = new URLSearchParams();
    if (season) params.set("season", season);
    const response = await fetch(`/api/schedule?${params}`);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail ?? "Could not load schedule");
    }
    const data = (await response.json()) as ScheduleResponse;
    scheduleCache.set(key, data);
    return data;
  })().finally(() => {
    scheduleInflight.delete(key);
  });

  scheduleInflight.set(key, request);
  return request;
}

const gameCache = new Map<string, GameDetail>();
const gameInflight = new Map<string, Promise<GameDetail>>();

export async function getGame(id: number, season = "") {
  const key = `${season || "default"}:${id}`;
  const cached = gameCache.get(key);
  if (cached) return cached;

  const pending = gameInflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const params = new URLSearchParams();
    if (season) params.set("season", season);
    const response = await fetch(`/api/games/${id}?${params}`);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail ?? error?.error ?? "Could not load box score");
    }
    const data = (await response.json()) as GameDetail;
    gameCache.set(key, data);
    return data;
  })().finally(() => {
    gameInflight.delete(key);
  });

  gameInflight.set(key, request);
  return request;
}

const gameLogCache = new Map<string, PlayerGameLog>();
const gameLogInflight = new Map<string, Promise<PlayerGameLog>>();

export async function getPlayerGameLog(playerId: string, season = "") {
  const key = `${playerId}:${season || "default"}`;
  const cached = gameLogCache.get(key);
  if (cached) return cached;

  const pending = gameLogInflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const params = new URLSearchParams();
    if (season) params.set("season", season);
    const response = await fetch(`/api/players/${encodeURIComponent(playerId)}/games?${params}`);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail ?? error?.error ?? "Could not load game log");
    }
    const data = (await response.json()) as PlayerGameLog;
    gameLogCache.set(key, data);
    return data;
  })().finally(() => {
    gameLogInflight.delete(key);
  });

  gameLogInflight.set(key, request);
  return request;
}

export function peekPlayerProfile(playerId: string) {
  return profileCache.get(playerId) ?? null;
}

export async function getPlayerProfile(playerId: string) {
  const cached = profileCache.get(playerId);
  if (cached) return cached;

  const pending = profileInflight.get(playerId);
  if (pending) return pending;

  const request = (async () => {
    const response = await fetch(`/api/players/${encodeURIComponent(playerId)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail ?? error?.error ?? "Could not load player profile");
    }
    const profile = (await response.json()) as PlayerProfile;
    profileCache.set(playerId, profile);
    return profile;
  })().finally(() => {
    profileInflight.delete(playerId);
  });

  profileInflight.set(playerId, request);
  return request;
}

export function formatUpdatedAt(iso?: string, now = Date.now()) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const delta = Math.max(0, now - then);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
