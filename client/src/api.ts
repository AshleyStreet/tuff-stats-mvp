import type { PlayersResponse, StatKey } from "./types";

export async function getPlayers(
  search = "",
  sort: StatKey | "totalPoints" = "totalPoints",
  team = ""
) {
  const params = new URLSearchParams({ sort, order: "desc" });
  if (search) params.set("search", search);
  if (team) params.set("team", team);
  const response = await fetch(`/api/players?${params}`);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail ?? "Could not load player stats");
  }
  return response.json() as Promise<PlayersResponse>;
}
