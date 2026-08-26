import type { SeasonInfo, Stats, TeamStanding } from "../domain/types.js";
import type { LeagueSourceConfig } from "./types.js";

export type FixturePlayerSeed = {
  name: string;
  team: string;
  sourceId: string;
  number?: string;
  stats: Partial<Stats>;
};

export type FixtureBoxPlayer = {
  sourceId: string;
  name: string;
  number?: string;
  stats: Partial<Stats>;
};

export type FixtureGameSeed = {
  id: number;
  date: string;
  status: "final" | "upcoming";
  title: string;
  venue?: string;
  season: string;
  teams: Array<{
    id: number;
    name: string;
    score?: number;
    outcome?: string;
  }>;
  sides: Array<{
    id: number;
    name: string;
    score?: number;
    outcome?: string;
    players: FixtureBoxPlayer[];
  }>;
};

export type FixtureSeed = {
  seasons: SeasonInfo[];
  players: FixturePlayerSeed[];
  standings: TeamStanding[];
  games: FixtureGameSeed[];
};

export function slugifyTeam(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "team";
}

export function emptyStandings(teamNames: string[]): TeamStanding[] {
  return teamNames.map((name, index) => ({
    name,
    pos: index + 1,
    wins: 0,
    losses: 0,
    ties: 0,
    pct: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    netPoints: 0,
    standingsPoints: 0,
    streak: "-"
  }));
}

export function emptyFixtureSeed(input: {
  slug: string;
  publicSeason: string;
  franchiseTeamNames: string[];
}): FixtureSeed {
  const year = input.publicSeason.trim() || "2026";
  return {
    seasons: [{ year, label: `${year} Season`, slug: `${year}-${input.slug}-stats` }],
    players: [],
    standings: emptyStandings(input.franchiseTeamNames),
    games: []
  };
}

export function dummyFixtureSource(input: {
  slug: string;
  publicSeason: string;
  franchiseTeamNames: string[];
}): LeagueSourceConfig {
  const teams = input.franchiseTeamNames.map((name) => name.trim()).filter(Boolean);
  return {
    origin: "https://fixture.invalid",
    statsUrl: `https://fixture.invalid/list/${input.publicSeason}-${input.slug}-stats/`,
    userAgent: `${input.slug}-Stats-Fixture/0.1`,
    defaultStatsListSuffix: `${input.slug}-stats`,
    statsListTokens: [input.slug],
    excludeStatsSlugs: [],
    standings: {
      modernFromYear: Number(input.publicSeason) || 2026,
      modern: [`${input.slug}-standings`],
      legacy: [`${input.slug}-standings`]
    },
    modernTeamSlugs: teams.map(slugifyTeam),
    franchiseTeamNames: teams
  };
}
