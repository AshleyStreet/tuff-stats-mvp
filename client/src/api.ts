import type { PlayersResponse, SeasonInfo, StatKey } from "./types";

export async function getSeasons() {
  const response = await fetch("/api/seasons");
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail ?? "Could not load seasons");
  }
  return response.json() as Promise<{ seasons: SeasonInfo[]; defaultSeason: string }>;
}

export async function getPlayers(
  search = "",
  sort: StatKey | "totalPoints" = "totalPoints",
  team = "",
  season = ""
) {
  const params = new URLSearchParams({ sort, order: "desc" });
  if (search) params.set("search", search);
  if (team) params.set("team", team);
  if (season) params.set("season", season);
  const response = await fetch(`/api/players?${params}`);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail ?? "Could not load player stats");
  }
  return response.json() as Promise<PlayersResponse>;
}
