import { flagFootballPresentation } from "./sports/flag-football.js";
import { touchFootballPresentation } from "./sports/touch-football.js";
import { soccerPresentation } from "./sports/soccer.js";
import { softballPresentation } from "./sports/softball.js";
import type { SportIcon, StatPresentation } from "./sports/types.js";

export type SupportedSport = "flag-football" | "touch-football" | "softball" | "soccer";

const SPORTS: Record<
  SupportedSport,
  { sportIcon: SportIcon; presentation: StatPresentation; label: string }
> = {
  "flag-football": {
    sportIcon: "football",
    presentation: flagFootballPresentation,
    label: "Flag Football"
  },
  "touch-football": {
    sportIcon: "football",
    presentation: touchFootballPresentation,
    label: "Touch Football"
  },
  softball: {
    sportIcon: "softball",
    presentation: softballPresentation,
    label: "Softball"
  },
  soccer: {
    sportIcon: "soccer",
    presentation: soccerPresentation,
    label: "Soccer"
  }
};

export function normalizeSport(raw: string | undefined): SupportedSport {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "softball" || value === "baseball") return "softball";
  if (value === "soccer") return "soccer";
  if (value === "touch-football" || value === "touch football" || value === "touchfootball") {
    return "touch-football";
  }
  if (value === "flag-football" || value === "flag football" || value === "flagfootball") {
    return "flag-football";
  }
  if (value === "football") return "flag-football";
  return "flag-football";
}

export function sportMeta(sport: SupportedSport) {
  return SPORTS[sport];
}
