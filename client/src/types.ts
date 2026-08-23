export type StatKey =
  | "gms" | "tpqb" | "tpnqb" | "paTD" | "ruTD" | "recTD" | "retTD"
  | "comp" | "int" | "sack" | "att" | "pa1PT" | "ru1PT" | "re1PT"
  | "pa2PT" | "rec" | "ru2PT" | "re2PT" | "ret2PT" | "safety";

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

export interface SeasonInfo {
  year: string;
  label: string;
  slug: string;
}

export interface SeasonAppearance {
  season: string;
  team?: string;
  stats: Stats;
  derived: Player["derived"];
}

export interface PlayerProfile {
  id: string;
  sourceId: string;
  name: string;
  number?: number | string;
  profileUrl?: string;
  currentTeam?: string;
  teams: string[];
  seasons: SeasonAppearance[];
  career: {
    seasonsPlayed: number;
    stats: Stats;
    derived: Player["derived"];
  };
  meta: { fetchedAt: string };
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
  };
}
