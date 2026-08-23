import type { ScheduleGame } from "../types";

export function partitionSchedule(games: ScheduleGame[]) {
  const finals = games.filter((game) => game.status === "final").sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = games
    .filter((game) => game.status === "upcoming")
    .sort((a, b) => a.date.localeCompare(b.date));
  const other = games
    .filter((game) => game.status === "unknown")
    .sort((a, b) => b.date.localeCompare(a.date));
  return { finals, upcoming, other };
}

export function filterScheduleGames(games: ScheduleGame[], team = "", query = "") {
  const teamKey = team.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  return games.filter((game) => {
    if (teamKey && !game.teams.some((side) => side.name.toLowerCase() === teamKey)) return false;
    if (!q) return true;
    return (
      game.title.toLowerCase().includes(q) ||
      game.teams.some((side) => side.name.toLowerCase().includes(q)) ||
      (game.venue ?? "").toLowerCase().includes(q)
    );
  });
}
