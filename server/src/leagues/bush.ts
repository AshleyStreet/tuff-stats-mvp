import { softballPresentation } from "./sports/softball.js";
import type { League } from "./types.js";

/**
 * Third tenant: Bush League Toronto softball.
 * Ingests SportsPress from www.bushleaguetoronto.ca. Never points at playtuff.ca.
 * Player lists are not published on that site yet — teams + schedule still ingest live.
 */
export const bushLeague: League = {
  id: "bush",
  slug: "bush",
  name: "Bush League Toronto",
  shortName: "BUSH",
  sport: "softball",
  hostnames: ["bush.localhost", "bushleaguetoronto.ca", "www.bushleaguetoronto.ca"],
  serviceName: "bush-stats-api",
  branding: {
    logo: "/bush-logo.svg",
    logoAlt: "Bush League Toronto",
    primaryColor: "#2d6a3e",
    secondaryColor: "#d4b483"
  },
  publicSeason: "2026",
  copy: {
    documentTitle: "Bush League Stats · Toronto Softball",
    tagline: "BUSH LEAGUE TORONTO",
    loadErrorTitle: "Couldn’t load Bush League.",
    profileLinkLabel: "Open original Bush League profile",
    recapLinkLabel: "Open original Bush League recap",
    htmlSourceLabel: "Bush League table"
  },
  sportIcon: "softball",
  presentation: softballPresentation,
  adapter: "sportspress",
  source: {
    origin: "https://www.bushleaguetoronto.ca",
    statsUrl: "https://www.bushleaguetoronto.ca/table/bush-league-2026/",
    userAgent: "Bush-Stats-MVP/0.1",
    defaultStatsListSuffix: "bush-stats",
    statsListTokens: [],
    excludeStatsSlugs: [],
    standings: {
      modernFromYear: 2022,
      modern: ["bush-league"],
      legacy: ["bush-league"]
    },
    standingsSlugTemplate: "bush-league-{year}",
    modernTeamSlugs: [
      "honey-badgers",
      "los-bastardos",
      "pornstars",
      "diamond-dogs",
      "lobbers",
      "rhinos"
    ],
    franchiseTeamNames: [
      "Honey Badgers",
      "Los Bastardos",
      "Pornstars",
      "Diamond Dogs",
      "Lobbers",
      "Rhinos"
    ],
    sportspress: {
      originEnv: "BUSH_ORIGIN",
      seasonMode: "year",
      playerSource: "none"
    }
  }
};
