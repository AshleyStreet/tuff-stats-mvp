import { flagFootballPresentation } from "./sports/flag-football.js";
import type { League } from "./types.js";

/**
 * Second tenant: fixture flag football. Different identity from TUFF.
 * Never points at playtuff.ca.
 */
export const harborLeague: League = {
  id: "harbor",
  slug: "harbor",
  name: "Harbor Flag Football",
  shortName: "HARBOR",
  sport: "flag-football",
  hostnames: ["demo.afterwhistle.ca", "demo.localhost", "anotherleague.localhost"],
  serviceName: "harbor-stats-api",
  branding: {
    logo: "/harbor-logo.svg",
    logoAlt: "Harbor Flag Football",
    primaryColor: "#0e7c7b",
    secondaryColor: "#e8c547"
  },
  publicSeason: "2026",
  copy: {
    documentTitle: "Harbor Stats · Flag Football",
    tagline: "HARBOR FLAG FOOTBALL",
    loadErrorTitle: "Couldn’t load Harbor.",
    profileLinkLabel: "Open original Harbor profile",
    recapLinkLabel: "Open original Harbor recap",
    htmlSourceLabel: "Harbor table"
  },
  sportIcon: "football",
  presentation: flagFootballPresentation,
  adapter: "fixture",
  source: {
    origin: "https://fixture.invalid",
    statsUrl: "https://fixture.invalid/list/2026-harbor-stats/",
    userAgent: "Harbor-Stats-Fixture/0.1",
    defaultStatsListSuffix: "harbor-stats",
    statsListTokens: ["harbor"],
    excludeStatsSlugs: [],
    standings: {
      modernFromYear: 2026,
      modern: ["harbor-standings"],
      legacy: ["harbor-standings"]
    },
    modernTeamSlugs: ["hawks", "otters"],
    franchiseTeamNames: ["Hawks", "Otters"]
  }
};
