import type { Player, StatKey, Stats, TeamStanding } from "../types";

export type TeamSummary = {
  name: string;
  playerCount: number;
  stats: Stats;
  derived: {
    totalTouchdowns: number;
    totalPoints: number;
  };
  standing?: TeamStanding;
  topScorer?: Player;
};

function blankStats(): Stats {
  return {
    gms: 0, tpqb: 0, tpnqb: 0, paTD: 0, ruTD: 0, recTD: 0, retTD: 0,
    comp: 0, int: 0, sack: 0, att: 0, pa1PT: 0, ru1PT: 0, re1PT: 0,
    pa2PT: 0, rec: 0, ru2PT: 0, re2PT: 0, ret2PT: 0, safety: 0
  };
}

function sumStats(left: Stats, right: Stats): Stats {
  const total = blankStats();
  for (const key of Object.keys(total) as StatKey[]) {
    total[key] = (left[key] ?? 0) + (right[key] ?? 0);
  }
  return total;
}

export function buildTeamSummaries(players: Player[], standings: TeamStanding[] = []): TeamSummary[] {
  const byTeam = new Map<string, Player[]>();
  for (const player of players) {
    const name = player.team?.trim();
    if (!name) continue;
    const list = byTeam.get(name) ?? [];
    list.push(player);
    byTeam.set(name, list);
  }

  const standingByName = new Map(standings.map((row) => [row.name.toLowerCase(), row]));

  // Include standings-only teams (no roster stats yet) so W-L still shows.
  for (const row of standings) {
    if (!byTeam.has(row.name)) byTeam.set(row.name, []);
  }

  return [...byTeam.entries()]
    .map(([name, roster]) => {
      const stats = roster.reduce((acc, player) => sumStats(acc, player.stats), blankStats());
      const totalTouchdowns = roster.reduce((sum, player) => sum + player.derived.totalTouchdowns, 0);
      const totalPoints = roster.reduce((sum, player) => sum + player.derived.totalPoints, 0);
      const topScorer = [...roster].sort((a, b) => b.derived.totalPoints - a.derived.totalPoints)[0];
      const standing = standingByName.get(name.toLowerCase());
      return {
        name,
        playerCount: roster.length,
        stats,
        derived: { totalTouchdowns, totalPoints },
        standing,
        topScorer
      };
    })
    .sort((a, b) => {
      const aWins = a.standing?.wins ?? -1;
      const bWins = b.standing?.wins ?? -1;
      if (bWins !== aWins) return bWins - aWins;
      const aSp = a.standing?.standingsPoints ?? -1;
      const bSp = b.standing?.standingsPoints ?? -1;
      if (bSp !== aSp) return bSp - aSp;
      const aPct = a.standing?.pct ?? -1;
      const bPct = b.standing?.pct ?? -1;
      if (bPct !== aPct) return bPct - aPct;
      return b.derived.totalPoints - a.derived.totalPoints || a.name.localeCompare(b.name);
    });
}

export function formatRecord(standing?: TeamStanding) {
  if (!standing) return null;
  if (standing.ties > 0) return `${standing.wins}-${standing.losses}-${standing.ties}`;
  return `${standing.wins}-${standing.losses}`;
}
