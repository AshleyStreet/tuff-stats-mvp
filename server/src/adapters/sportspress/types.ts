/**
 * SportsPress WP REST shapes. Keep these out of Express routes and the React app.
 * Mappers in lib/schedule, lib/stats, and adapters/tuff turn these into domain types.
 */

export type SpRendered = {
  rendered?: string;
};

export type SpList = {
  id: number;
  slug: string;
  title?: SpRendered;
  seasons?: number[];
  data?: Record<string, Record<string, unknown>>;
  link?: string;
  modified?: string;
  modified_gmt?: string;
};

export type SpListMeta = {
  id: number;
  slug: string;
  modified?: string;
  modified_gmt?: string;
};

export type SpTable = {
  slug?: string;
  modified?: string;
  modified_gmt?: string;
  data?: Record<string, Record<string, unknown>>;
};

export type SpPlayer = {
  id: number;
  title?: SpRendered;
  number?: number | string;
  link?: string;
  teams?: number[];
  current_teams?: number[];
  seasons?: number[];
};

export type SpPlayerRef = {
  id: number;
  title?: SpRendered;
  current_teams?: number[];
  teams?: number[];
};

export type SpTeam = {
  id: number;
  title?: SpRendered;
  featured_media?: number;
};

export type SpVenue = {
  id: number;
  name?: string;
  title?: SpRendered;
};

export type SpSeason = {
  id: number;
  name?: string;
  slug?: string;
};

export type SpMedia = {
  id: number;
  source_url?: string;
  media_details?: { sizes?: Record<string, { source_url?: string }> };
};

export type SpEvent = {
  id: number;
  date?: string;
  status?: string;
  link?: string;
  title?: SpRendered;
  teams?: Array<number | string>;
  venues?: number[];
  main_results?: unknown;
  results?: Record<string, unknown>;
  players?: number[];
  performance?: Record<string, Record<string, Record<string, unknown>>>;
  modified_gmt?: string;
};

export type SpEventLineup = {
  teams?: number[];
  players?: number[];
};
