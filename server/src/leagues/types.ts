import type { StatKey } from "../domain/types.js";
import type { FixtureSeed } from "./fixture-seed.js";
import type { SportIcon, StatPresentation } from "./sports/types.js";

export type { SportIcon, StatColumn, StatDetailGroup, StatPresentation } from "./sports/types.js";

export type LeagueBranding = {
  logo: string;
  logoAlt: string;
  primaryColor: string;
  secondaryColor: string;
};

export type LeagueCopy = {
  documentTitle: string;
  tagline: string;
  loadErrorTitle: string;
  profileLinkLabel: string;
  recapLinkLabel: string;
  htmlSourceLabel: string;
};

/**
 * One ingestable board for the config-driven SportsPress adapter
 * (e.g. Passion D2 Été 2026). `key` is the API season id.
 */
export type SportspressSeasonSlice = {
  key: string;
  label: string;
  /** SportsPress `sp_season` taxonomy slug */
  seasonSlug: string;
  /** Standings table slug */
  standingsSlug: string;
  /** Optional player list slug (`statistiques-d2`). Omit when lists are empty. */
  statsListSlug?: string;
  /** Optional SportsPress `sp_league` slug used to scope events when present */
  divisionSlug?: string;
};

/** Options for adapter: "sportspress" (Bush, Passion, …). TUFF ignores this block. */
export type SportspressSourceOptions = {
  /** Env var that may override `origin` (e.g. BUSH_ORIGIN, PASSION_ORIGIN). */
  originEnv?: string;
  /**
   * `year` — discover seasons from taxonomy/tables (Bush).
   * `configured` — use explicit `seasons` slices (Passion divisions).
   */
  seasonMode: "year" | "configured";
  seasons?: SportspressSeasonSlice[];
  /**
   * `lists` — player board from SportsPress lists (Passion).
   * `players` — roster from `/players?seasons=` (often empty).
   * `none` — standings/schedule only (Bush today).
   */
  playerSource: "lists" | "players" | "none";
  /** Drop announcement / placeholder team titles from catalogs and schedules. */
  excludeTeamNamePatterns?: string[];
};

/** SportsPress / HTML ingest settings. Adapter-specific fields live under `sportspress`. */
export type LeagueSourceConfig = {
  origin: string;
  statsUrl: string;
  userAgent: string;
  defaultStatsListSuffix: string;
  statsListTokens: string[];
  excludeStatsSlugs: string[];
  /**
   * Raw source field name (lowercased) -> canonical StatKey. Merged over,
   * and able to override, the shared default map in lib/stats.ts. Omit
   * for tenants whose fields already match the shared map.
   */
  statMap?: Record<string, StatKey>;
  standings: {
    modernFromYear: number;
    modern: string[];
    legacy: string[];
  };
  /**
   * When set, standings tables are `{year}` substituted, e.g. `bush-league-{year}`.
   * TUFF omits this and uses `year-suffix` candidates instead.
   */
  standingsSlugTemplate?: string;
  modernTeamSlugs: string[];
  franchiseTeamNames: string[];
  sportspress?: SportspressSourceOptions;
};

export type League = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  sport: string;
  hostnames: string[];
  serviceName: string;
  branding: LeagueBranding;
  publicSeason: string;
  copy: LeagueCopy;
  sportIcon: SportIcon;
  presentation: StatPresentation;
  adapter: "tuff" | "fixture" | "sportspress";
  source: LeagueSourceConfig;
  /** Present for created fixture tenants. Harbor uses the baked seed in the fixture adapter. */
  fixture?: FixtureSeed;
  /** Club-plan tenants hide the "Stats by Afterwhistle" footer badge. */
  whiteLabel?: boolean;
};

/** Client-safe subset. Source URLs and slug-discovery rules stay on the server. */
export type PublicLeague = {
  slug: string;
  name: string;
  shortName: string;
  sport: string;
  branding: LeagueBranding;
  publicSeason: string;
  copy: LeagueCopy;
  sportIcon: SportIcon;
  presentation: StatPresentation;
  franchiseTeamNames: string[];
  whiteLabel?: boolean;
};

export function toPublicLeague(league: League): PublicLeague {
  return {
    slug: league.slug,
    name: league.name,
    shortName: league.shortName,
    sport: league.sport,
    branding: league.branding,
    publicSeason: league.publicSeason,
    copy: league.copy,
    sportIcon: league.sportIcon,
    presentation: league.presentation,
    franchiseTeamNames: league.source.franchiseTeamNames,
    whiteLabel: league.whiteLabel
  };
}
