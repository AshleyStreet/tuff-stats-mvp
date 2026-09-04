import { soccerPresentation } from "./sports/soccer.js";
import type { League, SportspressSeasonSlice } from "./types.js";

const ETE_2026 = "saison-reguliere-ete-2026";
const HIVER_2025_2026 = "saison-reguliere-hiver-2025-2026";

const DIVISIONS = ["d2", "d3", "d4", "d5"] as const;

function slicesFor(
  phase: "ete-2026" | "hiver-2025-2026",
  seasonSlug: string,
  labelPhase: string,
  divisions: readonly string[]
): SportspressSeasonSlice[] {
  return divisions.map((div) => ({
    key: `${div}-${phase}`,
    label: `${div.toUpperCase()} · ${labelPhase}`,
    seasonSlug,
    standingsSlug: `${div}-saison-reguliere-${phase === "ete-2026" ? "ete-2026" : "hiver-2025-2026"}`,
    statsListSlug: `statistiques-${div}`,
    divisionSlug: div
  }));
}

/**
 * Fourth tenant: Passion Soccer (multi-division SportsPress).
 * Never points at playtuff.ca. Player lists include PII fields — adapter maps only known stats.
 */
export const passionLeague: League = {
  id: "passion",
  slug: "passion",
  name: "Passion Soccer",
  shortName: "PASSION",
  sport: "soccer",
  hostnames: ["passion.localhost", "passion-soccer.com", "www.passion-soccer.com", "passion.afterwhistle.ca"],
  serviceName: "passion-stats-api",
  branding: {
    logo: "/passion-logo.svg",
    logoAlt: "Passion Soccer",
    primaryColor: "#1a5f4a",
    secondaryColor: "#e8b84a"
  },
  publicSeason: "d2-ete-2026",
  copy: {
    documentTitle: "Passion Soccer Stats",
    tagline: "PASSION SOCCER",
    loadErrorTitle: "Couldn’t load Passion Soccer.",
    profileLinkLabel: "Open original Passion profile",
    recapLinkLabel: "Open original Passion recap",
    htmlSourceLabel: "Passion table"
  },
  sportIcon: "soccer",
  presentation: soccerPresentation,
  adapter: "sportspress",
  source: {
    origin: "https://passion-soccer.com",
    statsUrl: "https://passion-soccer.com/list/statistiques-d2/",
    userAgent: "Passion-Stats-MVP/0.1",
    defaultStatsListSuffix: "statistiques",
    statsListTokens: ["statistiques"],
    excludeStatsSlugs: [],
    standings: {
      modernFromYear: 2020,
      modern: ["saison-reguliere"],
      legacy: ["saison-reguliere"]
    },
    modernTeamSlugs: [],
    franchiseTeamNames: [],
    sportspress: {
      originEnv: "PASSION_ORIGIN",
      seasonMode: "configured",
      playerSource: "lists",
      excludeTeamNamePatterns: [
        "match",
        "finale",
        "demi",
        "quart",
        "annul",
        "amical",
        "aucun",
        "test",
        "determiner",
        "d[eé]terminer",
        "qualification",
        "rel[aâ]che",
        "hors-concours",
        "partie amicale",
        "venir"
      ],
      seasons: [
        ...slicesFor("ete-2026", ETE_2026, "Été 2026", DIVISIONS),
        ...slicesFor("hiver-2025-2026", HIVER_2025_2026, "Hiver 2025-26", [...DIVISIONS, "d6"])
      ]
    }
  }
};
