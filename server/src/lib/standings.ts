import { toNumber } from "./stats.js";

export type TeamStanding = {
  name: string;
  pos?: number;
  wins: number;
  losses: number;
  ties: number;
  pct: number;
  pointsFor: number;
  pointsAgainst: number;
  netPoints: number;
  standingsPoints: number;
  streak?: string;
};

export function standingsSlugCandidates(year: string): string[] {
  const y = year.trim();
  if (Number(y) >= 2022) return [`${y}-tuff-standings`, `${y}-tgfl-standings`];
  return [`${y}-tgfl-standings`, `${y}-tuff-standings`];
}

function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function parseStandingsTable(
  data: Record<string, Record<string, unknown>> | null | undefined
): TeamStanding[] {
  if (!data) return [];

  const rows: TeamStanding[] = [];
  for (const [key, row] of Object.entries(data)) {
    if (key === "0") continue;
    const name = stripHtml(row.name ?? row.team);
    if (!name || name.toLowerCase() === "team") continue;

    rows.push({
      name,
      pos: toNumber(row.pos) || undefined,
      wins: toNumber(row.w ?? row.tw),
      losses: toNumber(row.l ?? row["l-2"]),
      ties: toNumber(row.t ?? row["t-2"]),
      pct: toNumber(row.pct),
      pointsFor: toNumber(row.pf),
      pointsAgainst: toNumber(row.pa),
      netPoints: toNumber(row.netpts),
      standingsPoints: toNumber(row.sp),
      streak: stripHtml(row.streak) || undefined
    });
  }

  return rows.sort(
    (a, b) =>
      (a.pos ?? 999) - (b.pos ?? 999) ||
      b.wins - a.wins ||
      b.standingsPoints - a.standingsPoints ||
      a.name.localeCompare(b.name)
  );
}
