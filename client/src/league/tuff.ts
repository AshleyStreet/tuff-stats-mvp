import type { PublicLeague } from "./types";
import { flagFootballPresentation } from "./flagFootball";

/** Baked-in tenant #1 so the first paint matches today’s TUFF UI if /api/league is slow. */
export const tuffPublicLeague: PublicLeague = {
  slug: "tuff",
  name: "Toronto United Flag Football",
  shortName: "TUFF",
  sport: "flag-football",
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
  ],
  features: []
};
