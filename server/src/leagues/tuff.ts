import { flagFootballPresentation } from "./sports/flag-football.js";
import type { League } from "./types.js";

export const tuffLeague: League = {
  id: "tuff",
  slug: "tuff",
  name: "Toronto United Flag Football",
  shortName: "TUFF",
  sport: "flag-football",
  hostnames: ["stats.playtuff.ca"],
  serviceName: "tuff-stats-api",
  branding: {
    logo: "https://www.playtuff.ca/wp-content/uploads/2022/03/TUFF_logo_v2.png",
    logoAlt: "Toronto United Flag Football",
    primaryColor: "#e31b23",
    secondaryColor: "#d7b56d"
  },
  publicSeason: "2026",
  copy: {
    documentTitle: "TUFF Stats · Toronto Flag Football",
    tagline: "TORONTO UNITED FLAG FOOTBALL",
    loadErrorTitle: "Couldn’t load TUFF.",
    profileLinkLabel: "Open original TUFF profile",
    recapLinkLabel: "Open original TUFF recap",
    htmlSourceLabel: "TUFF table"
  },
  sportIcon: "football",
  presentation: flagFootballPresentation,
  adapter: "tuff",
  source: {
    origin: "https://www.playtuff.ca",
    statsUrl: "https://www.playtuff.ca/list/2026-tuff-stats/",
    userAgent: "TUFF-Stats-MVP/0.1",
    defaultStatsListSuffix: "tuff-stats",
    statsListTokens: ["tuff", "tgfl"],
    excludeStatsSlugs: ["tuff-stats-old"],
    standings: {
      modernFromYear: 2022,
      modern: ["tuff-standings", "tgfl-standings"],
      legacy: ["tgfl-standings", "tuff-standings"]
    },
    modernTeamSlugs: [
      "brawlers",
      "bulldogs",
      "cobras",
      "knights",
      "lumberjacks",
      "menace",
      "rhinos",
      "sirens",
      "stallions",
      "wildcats",
      "wolfhounds",
      "yetis"
    ],
    franchiseTeamNames: [
      "Brawlers",
      "Bulldogs",
      "Cobras",
      "Knights",
      "Lumberjacks",
      "Menace",
      "Rhinos",
      "Sirens",
      "Stallions",
      "Storm Crows",
      "Wildcats",
      "Wolfhounds",
      "Yetis"
    ]
  }
};
