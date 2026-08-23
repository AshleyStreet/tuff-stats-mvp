import type { Player, StatKey } from "../types.js";

export type PlayerQuery = {
  search?: string;
  team?: string;
  sort?: StatKey | "totalPoints";
  order?: "asc" | "desc";
};

export function filterAndSortPlayers(players: Player[], query: PlayerQuery = {}): Player[] {
  const search = (query.search ?? "").trim().toLowerCase();
  const team = (query.team ?? "").trim().toLowerCase();
  const sort = query.sort ?? "totalPoints";
  const order = query.order === "asc" ? 1 : -1;

  let result = [...players];
  if (team) {
    result = result.filter((player) => (player.team ?? "").toLowerCase() === team);
  }
  if (search) {
    result = result.filter((player) => player.name.toLowerCase().includes(search));
  }

  result.sort((a, b) => {
    const aValue = sort === "totalPoints" ? a.derived.totalPoints : a.stats[sort] ?? 0;
    const bValue = sort === "totalPoints" ? b.derived.totalPoints : b.stats[sort] ?? 0;
    return (aValue - bValue) * order || a.name.localeCompare(b.name);
  });

  return result;
}
