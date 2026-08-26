export type StatKey =
  | "gms" | "tpqb" | "tpnqb" | "paTD" | "ruTD" | "recTD" | "retTD"
  | "comp" | "int" | "sack" | "deflag" | "pa1PT" | "ru1PT" | "re1PT"
  | "pa2PT" | "rec" | "ru2PT" | "re2PT" | "ret2PT" | "safety"
  | "ab" | "r" | "h" | "doubles" | "triples" | "hr" | "rbi" | "bb" | "so" | "sb"
  | "goals" | "yellowCards" | "redCards";

export type Stats = Record<StatKey, number>;

export type LeagueRef = {
  slug: string;
  name: string;
  shortName: string;
  sport: string;
};

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
  seasonId?: number;
  url?: string;
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
  meta: { fetchedAt: string; league?: LeagueRef };
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
  logoUrl?: string;
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
  meta: { fetchedAt: string; total: number; league?: LeagueRef };
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
  meta: { fetchedAt: string; league?: LeagueRef };
}

export interface GameLogEntry {
  game: ScheduleGame;
  team: string;
  opponent: string;
  outcome?: string;
  score?: number;
  oppScore?: number;
  stats: Stats;
  derived: { totalTouchdowns: number };
  number?: string;
}

export interface PlayerGameLog {
  season: string;
  sourceIds: string[];
  games: GameLogEntry[];
  meta: { fetchedAt: string; league?: LeagueRef };
}

export interface PlayersResponse {
  players: Player[];
  meta: {
    source: "sportspress" | "html" | "fixture";
    fetchedAt: string;
    total: number;
    teams: string[];
    season: string;
    seasonLabel: string;
    standings?: TeamStanding[];
    teamLogos?: Record<string, string>;
    league?: LeagueRef;
  };
}
