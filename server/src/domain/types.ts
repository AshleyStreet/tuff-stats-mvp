/**
 * Platform domain for what the app actually presents today.
 * Raw SportsPress / HTML payloads belong in adapters, not here.
 *
 * The record holds flag-football, softball, and soccer columns.
 * Presentation schemas pick which keys the UI shows; adapters map
 * source abbreviations onto these names rather than leaking them to React.
 */

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
  "deflag",
  "pa1PT",
  "ru1PT",
  "re1PT",
  "pa2PT",
  "rec",
  "ru2PT",
  "re2PT",
  "ret2PT",
  "safety",
  "ab",
  "r",
  "h",
  "doubles",
  "triples",
  "hr",
  "rbi",
  "bb",
  "so",
  "sb",
  "goals",
  "yellowCards",
  "redCards"
] as const;

export type StatKey = (typeof statKeys)[number];

export type Stats = Record<StatKey, number>;

export type PlayerDerived = {
  totalTouchdowns: number;
  totalPoints: number;
  receptionsPerGame: number;
  receivingTouchdownsPerGame: number;
};

/** Identity of the tenant that produced a payload. Safe to send to the client. */
export type LeagueRef = {
  slug: string;
  name: string;
  shortName: string;
  sport: string;
};

export function toLeagueRef(league: LeagueRef): LeagueRef {
  return {
    slug: league.slug,
    name: league.name,
    shortName: league.shortName,
    sport: league.sport
  };
}

export type Season = {
  year: string;
  label: string;
  slug: string;
  seasonId?: number;
  url?: string;
};

export type SeasonInfo = Season;

/**
 * Teams are canonical display names in this phase, not first-class entities.
 * Logos are attached as a name → URL map on list responses.
 */
export type Player = {
  id: string;
  name: string;
  profileUrl?: string;
  team?: string;
  sourceId?: string;
  stats: Stats;
  derived: PlayerDerived;
};

export type PlayerSeason = {
  season: string;
  team?: string;
  stats: Stats;
  derived: PlayerDerived;
  sourceId?: string;
  linked?: boolean;
};

export type SeasonAppearance = PlayerSeason;

export type PlayerProfile = {
  id: string;
  sourceId: string;
  name: string;
  number?: number | string;
  profileUrl?: string;
  currentTeam?: string;
  teams: string[];
  linkedSourceIds?: string[];
  seasons: PlayerSeason[];
  career: {
    seasonsPlayed: number;
    stats: Stats;
    derived: PlayerDerived;
  };
  meta: { fetchedAt: string; league?: LeagueRef };
};

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

export type ScheduleSide = {
  id: number;
  name: string;
  score?: number;
  outcome?: string;
  logoUrl?: string;
};

export type ScheduleGame = {
  id: number;
  date: string;
  status: "final" | "upcoming" | "unknown";
  title: string;
  link?: string;
  venue?: string;
  teams: ScheduleSide[];
};

export type BoxScorePlayer = {
  sourceId: string;
  name: string;
  number?: string;
  stats: Stats;
  derived: { totalTouchdowns: number };
};

export type BoxScoreSide = ScheduleSide & {
  players: BoxScorePlayer[];
};

export type GameDetail = {
  game: ScheduleGame;
  sides: BoxScoreSide[];
  meta: { fetchedAt: string; league?: LeagueRef };
};

export type GameLogEntry = {
  game: ScheduleGame;
  team: string;
  opponent: string;
  outcome?: string;
  score?: number;
  oppScore?: number;
  stats: Stats;
  derived: { totalTouchdowns: number };
  number?: string;
};

export type PlayerGameLog = {
  season: string;
  sourceIds: string[];
  games: GameLogEntry[];
  meta: { fetchedAt: string; league?: LeagueRef };
};

export type PlayersResponse = {
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
};

export type ScheduleResponse = {
  season: string;
  games: ScheduleGame[];
  meta: { fetchedAt: string; total: number; league?: LeagueRef };
};

export type SeasonsResponse = {
  seasons: SeasonInfo[];
  defaultSeason: string;
  league?: LeagueRef;
};
