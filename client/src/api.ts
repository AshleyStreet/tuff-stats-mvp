import type { PlayerProfile, PlayersResponse, SeasonInfo } from "./types";

const profileCache = new Map<string, PlayerProfile>();
const profileInflight = new Map<string, Promise<PlayerProfile>>();
const seasonPlayersCache = new Map<string, PlayersResponse>();
const seasonPlayersInflight = new Map<string, Promise<PlayersResponse>>();

export async function getSeasons() {
  const response = await fetch("/api/seasons");
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail ?? "Could not load seasons");
  }
  return response.json() as Promise<{ seasons: SeasonInfo[]; defaultSeason: string }>;
}

export async function getPlayers(season = "") {
  const key = season || "default";
  const cached = seasonPlayersCache.get(key);
  if (cached) return cached;

  const pending = seasonPlayersInflight.get(key);
  if (pending) return pending;

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
