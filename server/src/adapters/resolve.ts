import { getDefaultLeague } from "../leagues/registry.js";
import type { League } from "../leagues/types.js";
import { getFixtureAdapter } from "./fixture/index.js";
import { getSportspressAdapter } from "./sportspress/index.js";
import { getTuffAdapter } from "./tuff/index.js";
import type { LeagueDataAdapter } from "./types.js";

/**
 * Pick the ingest adapter for a league. Unknown adapter ids fall back to TUFF
 * so a config mistake cannot take the live product down.
 */
export function getAdapter(league: League = getDefaultLeague()): LeagueDataAdapter {
  switch (league.adapter) {
    case "fixture":
      return getFixtureAdapter(league);
    case "sportspress":
      return getSportspressAdapter(league);
    case "tuff":
      return getTuffAdapter();
    default:
      return getTuffAdapter();
  }
}
