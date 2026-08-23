export const statKeys = [
  "gms",
  "tpqb",
  "tpnqb",
  "paTD",
  "ruTD",
  "recTD",
  "retTD",
  "comp",
  "int",
  "sack",
  "att",
  "pa1PT",
  "ru1PT",
  "re1PT",
  "pa2PT",
  "rec",
  "ru2PT",
  "re2PT",
  "ret2PT",
  "safety"
] as const;

export type StatKey = (typeof statKeys)[number];

export type Stats = Record<StatKey, number>;

export interface Player {
  id: string;
  name: string;
  profileUrl?: string;
  team?: string;
  sourceId?: string;
  stats: Stats;
  derived: {
    totalTouchdowns: number;
    totalPoints: number;
    receptionsPerGame: number;
    receivingTouchdownsPerGame: number;
  };
}

export interface TeamStanding {
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
}

export interface PlayersResponse {
  players: Player[];
  meta: {
    source: "sportspress" | "html";
    fetchedAt: string;
    total: number;
    teams: string[];
    season: string;
    seasonLabel: string;
    standings?: TeamStanding[];
  };
}

export interface SeasonInfo {
  year: string;
  label: string;
  slug: string;
  seasonId?: number;
  url?: string;
}
