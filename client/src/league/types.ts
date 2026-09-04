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
  adapter: "tuff" | "fixture" | "sportspress";
  builtIn: boolean;
  franchiseTeamNames: string[];
  sourceOrigin?: string;
  whiteLabel: boolean;
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
