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

export type SportIcon = "football" | "softball" | "soccer";

export type StatColumn = {
  key: string;
  label: string;
  short: string;
  group?: string;
};

export type StatDetailGroup = {
  id: string;
  title: string;
  icon?: "zap" | "shield" | "trophy";
  columns: StatColumn[];
};

export type StatPresentation = {
  sortOptions: StatColumn[];
  playerCardMini: StatColumn[];
  playerCardFooter: StatColumn[];
  heroKpis: StatColumn[];
  careerKpis: StatColumn[];
  seasonTableColumns: StatColumn[];
  detailGroups: StatDetailGroup[];
  gameLogColumns: StatColumn[];
  boxScoreColumns: StatColumn[];
  cardDefaults: StatColumn[];
  cardOptions: StatColumn[];
};

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
  features: string[];
};

export type AdminTenant = {
  slug: string;
  name: string;
  shortName: string;
  sport: string;
  hostnames: string[];
  branding: LeagueBranding;
  publicSeason: string;
  copy: LeagueCopy;
  sportIcon: SportIcon;
  adapter: "tuff" | "fixture" | "sportspress" | "csv";
  builtIn: boolean;
  franchiseTeamNames: string[];
  sourceOrigin?: string;
  whiteLabel: boolean;
  features: string[];
  hasRefreshToken: boolean;
};

/** Mirrors server/src/adapters/types.ts's AdapterStatus. */
export type AdminTenantStatus = {
  ok: boolean;
  service: string;
  uptimeSeconds: number;
  warm: {
    status: "idle" | "running" | "done";
    warmed: string[];
    failed: string[];
    startedAt: string | null;
    finishedAt: string | null;
  };
  cache: {
    seasonsCached: number;
    profilesCached: number;
    seasons: Array<{
      year: string;
      fetchedAt: string;
      playerCount: number;
      fingerprint: string;
    }>;
  };
};

export type DeleteTenantResult = {
  deleted: boolean;
  reset: boolean;
  tenant?: AdminTenant;
};

export type SourceProbeResult = {
  ok: boolean;
  origin: string;
  hostname: string;
  siteName?: string;
  sportspress: boolean;
  sportspressLive: boolean;
  adapter: "fixture" | "sportspress";
  sport: string;
  suggestedSlug: string;
  suggestedName: string;
  suggestedShortName: string;
  publicSeason: string;
  hostnames: string[];
  franchiseTeamNames: string[];
  /** Present when probe built a SportsPress ingest config; opaque to the client. */
  source?: Record<string, unknown>;
  seasons: Array<{ key: string; label: string }>;
  tables: string[];
  lists: string[];
  warnings: string[];
};
