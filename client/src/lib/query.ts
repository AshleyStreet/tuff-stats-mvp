import { readStat } from "../league/readStat";
import type { Player } from "../types";

export type PlayerQuery = {
  search?: string;
  team?: string;
  sort?: string;
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
    const aValue = readStat(a, sort);
    const bValue = readStat(b, sort);
    return (aValue - bValue) * order || a.name.localeCompare(b.name);
  });

  return result;
}
