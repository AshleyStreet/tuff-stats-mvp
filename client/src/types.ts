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
  sourceId?: string;
  linked?: boolean;
}

export interface PlayerProfile {
  id: string;
  sourceId: string;
  name: string;
  number?: number | string;
  profileUrl?: string;
  currentTeam?: string;
  teams: string[];
  linkedSourceIds?: string[];
  seasons: SeasonAppearance[];
  career: {
    seasonsPlayed: number;
    stats: Stats;
    derived: Player["derived"];
  };
  meta: { fetchedAt: string };
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

export interface ScheduleSide {
  id: number;
  name: string;
  score?: number;
  outcome?: string;
}

export interface ScheduleGame {
  id: number;
  date: string;
  status: "final" | "upcoming" | "unknown";
  title: string;
  link?: string;
  venue?: string;
  teams: ScheduleSide[];
}

export interface ScheduleResponse {
  season: string;
  games: ScheduleGame[];
  meta: { fetchedAt: string; total: number };
}

export interface BoxScorePlayer {
  sourceId: string;
  name: string;
  number?: string;
  stats: Stats;
  derived: { totalTouchdowns: number };
}

export interface BoxScoreSide extends ScheduleSide {
  players: BoxScorePlayer[];
}

export interface GameDetail {
  game: ScheduleGame;
  sides: BoxScoreSide[];
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
    standings?: TeamStanding[];
  };
}
