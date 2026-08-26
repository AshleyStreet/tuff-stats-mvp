import type { SeasonInfo, TeamStanding } from "../../domain/types.js";
import type { FixtureGameSeed, FixturePlayerSeed } from "../../leagues/fixture-seed.js";

export type {
  FixtureBoxPlayer,
  FixtureGameSeed,
  FixturePlayerSeed,
  FixtureSeed
} from "../../leagues/fixture-seed.js";

export const harborSeasons: SeasonInfo[] = [
  { year: "2026", label: "2026 Season", slug: "2026-harbor-stats" }
];

export const harborStandings: TeamStanding[] = [
  {
    name: "Hawks",
    pos: 1,
    wins: 1,
    losses: 0,
    ties: 0,
    pct: 1,
    pointsFor: 28,
    pointsAgainst: 14,
    netPoints: 14,
    standingsPoints: 8,
    streak: "W1"
  },
  {
    name: "Otters",
    pos: 2,
    wins: 0,
    losses: 1,
    ties: 0,
    pct: 0,
    pointsFor: 14,
    pointsAgainst: 28,
    netPoints: -14,
    standingsPoints: 1,
    streak: "L1"
  }
];

export const harborPlayers: FixturePlayerSeed[] = [
  {
    name: "Maya K.",
    team: "Hawks",
    sourceId: "101",
    number: "7",
    stats: { gms: 4, rec: 18, recTD: 6, tpnqb: 42, tpqb: 0, int: 1, deflag: 3, pa1PT: 0, re1PT: 4 }
  },
  {
    name: "Jonah P.",
    team: "Hawks",
    sourceId: "102",
    number: "12",
    stats: { gms: 4, paTD: 8, comp: 42, tpqb: 36, tpnqb: 6, rec: 2, recTD: 1, sack: 0 }
  },
  {
    name: "Priya S.",
    team: "Hawks",
    sourceId: "103",
    number: "21",
    stats: { gms: 4, int: 4, deflag: 11, sack: 3, tpnqb: 12, rec: 3, recTD: 0, safety: 1 }
  },
  {
    name: "Chris D.",
    team: "Otters",
    sourceId: "201",
    number: "9",
    stats: { gms: 4, paTD: 5, comp: 31, tpqb: 24, tpnqb: 2, rec: 1, int: 0 }
  },
  {
    name: "Lena M.",
    team: "Otters",
    sourceId: "202",
    number: "11",
    stats: { gms: 4, rec: 14, recTD: 4, tpnqb: 28, tpqb: 0, re1PT: 2, deflag: 1 }
  },
  {
    name: "Omar T.",
    team: "Otters",
    sourceId: "203",
    number: "44",
    stats: { gms: 4, int: 2, deflag: 8, sack: 2, tpnqb: 6, rec: 1 }
  }
];

export const harborGames: FixtureGameSeed[] = [
  {
    id: 9001,
    date: "2026-06-07T16:00:00.000Z",
    status: "final",
    title: "Hawks vs Otters",
    venue: "Harbourfront Field",
    season: "2026",
    teams: [
      { id: 1, name: "Hawks", score: 28, outcome: "win" },
      { id: 2, name: "Otters", score: 14, outcome: "loss" }
    ],
    sides: [
      {
        id: 1,
        name: "Hawks",
        score: 28,
        outcome: "win",
        players: [
          { sourceId: "101", name: "Maya K.", number: "7", stats: { rec: 6, recTD: 2, deflag: 1 } },
          { sourceId: "102", name: "Jonah P.", number: "12", stats: { paTD: 3, comp: 12, rec: 1 } },
          { sourceId: "103", name: "Priya S.", number: "21", stats: { int: 1, deflag: 4, sack: 1 } }
        ]
      },
      {
        id: 2,
        name: "Otters",
        score: 14,
        outcome: "loss",
        players: [
          { sourceId: "201", name: "Chris D.", number: "9", stats: { paTD: 2, comp: 9 } },
          { sourceId: "202", name: "Lena M.", number: "11", stats: { rec: 5, recTD: 1 } },
          { sourceId: "203", name: "Omar T.", number: "44", stats: { int: 0, deflag: 3, sack: 1 } }
        ]
      }
    ]
  },
  {
    id: 9002,
    date: "2026-06-14T16:00:00.000Z",
    status: "upcoming",
    title: "Otters vs Hawks",
    venue: "Harbourfront Field",
    season: "2026",
    teams: [
      { id: 2, name: "Otters" },
      { id: 1, name: "Hawks" }
    ],
    sides: [
      { id: 2, name: "Otters", players: [] },
      { id: 1, name: "Hawks", players: [] }
    ]
  }
];
