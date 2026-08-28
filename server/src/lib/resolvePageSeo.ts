import type { LeagueDataAdapter } from "../adapters/types.js";
import { canonicalTeamName } from "./stats.js";
import { buildAppPath, parseAppRoute, resolveTeamName, slugifyTeam } from "./appRoutes.js";
import type { League } from "../leagues/types.js";
import { toPublicLeague } from "../leagues/registry.js";
import {
  gameSeo,
  leagueSeo,
  leagueTabSeo,
  playerSeo,
  teamSeo,
  type PageSeo
} from "./pageSeo.js";

export async function resolveLeaguePageSeo(
  league: League,
  adapter: LeagueDataAdapter,
  origin: string,
  pathname: string,
  search = ""
): Promise<PageSeo> {
  const publicLeague = toPublicLeague(league);
  const route = parseAppRoute(pathname, search);
  const season = route.season?.trim() || league.publicSeason;

  try {
    if (route.tab === "players" && route.playerId) {
      const profile = await adapter.getPlayerProfile(route.playerId);
      if (profile) {
        const image = await teamLogoForProfile(adapter, profile, season);
        return playerSeo(
          publicLeague,
          profile,
          origin,
          buildAppPath({ tab: "players", playerId: route.playerId, season }),
          season,
          image
        );
      }
    }

    if (route.tab === "teams" && route.teamSlug) {
      const players = await loadPlayersSnapshot(adapter, season);
      const names = [
        ...(players?.meta.standings?.map((row) => row.name) ?? []),
        ...(players?.meta.teams ?? [])
      ];
      const teamName = resolveTeamName(route.teamSlug, names);
      if (teamName) {
        const standing = players?.meta.standings?.find(
          (row) => canonicalTeamName(row.name).toLowerCase() === canonicalTeamName(teamName).toLowerCase()
        );
        return teamSeo(
          publicLeague,
          teamName,
          origin,
          buildAppPath({ tab: "teams", teamSlug: slugifyTeam(teamName), season }),
          season,
          standing,
          players?.meta.teamLogos?.[teamName] ?? players?.meta.teamLogos?.[canonicalTeamName(teamName)]
        );
      }
    }

    if (route.tab === "schedule" && route.gameId != null) {
      const detail = await adapter.getGame(String(route.gameId), { season, preferCache: true });
      if (detail) {
        return gameSeo(
          publicLeague,
          detail.game,
          origin,
          buildAppPath({ tab: "schedule", gameId: route.gameId, season }),
          season
        );
      }
    }

    if (route.tab !== "players" || pathname !== "/") {
      return leagueTabSeo(publicLeague, route.tab, origin, pathname, season);
    }
  } catch {
    // Fall through to league homepage SEO.
  }

  return leagueSeo(publicLeague, origin, season);
}

export async function buildSitemapUrls(
  origin: string,
  league: League,
  adapter: LeagueDataAdapter
): Promise<string[]> {
  const season = league.publicSeason;
  const urls: string[] = [];
  const tabs = ["players", "teams", "schedule", "cards"] as const;

  for (const tab of tabs) {
    urls.push(`${origin}${buildAppPath({ tab, season })}`);
  }

  try {
    const players = await loadPlayersSnapshot(adapter, season);
    if (!players) return urls;

    for (const player of players.players) {
      urls.push(`${origin}${buildAppPath({ tab: "players", playerId: player.id, season })}`);
    }

    const teamNames = [
      ...new Set([
        ...(players.meta.standings?.map((row) => row.name) ?? []),
        ...players.meta.teams
      ])
    ];
    for (const name of teamNames) {
      urls.push(`${origin}${buildAppPath({ tab: "teams", teamSlug: slugifyTeam(name), season })}`);
    }

    const schedule = await adapter.getSchedule({ season, preferCache: true });
    for (const game of schedule.games) {
      urls.push(`${origin}${buildAppPath({ tab: "schedule", gameId: game.id, season })}`);
    }
  } catch {
    // Tab URLs are still useful when cache is cold.
  }

  return urls;
}

async function loadPlayersSnapshot(adapter: LeagueDataAdapter, season: string) {
  try {
    return await adapter.getPlayers({ season, cacheOnly: true });
  } catch {
    return adapter.getPlayers({ season, preferCache: true });
  }
}

async function teamLogoForProfile(
  adapter: LeagueDataAdapter,
  profile: { currentTeam?: string; seasons: Array<{ season: string; team?: string }> },
  season: string
) {
  try {
    const players = await loadPlayersSnapshot(adapter, season);
    const team = profile.seasons.find((row) => row.season === season)?.team ?? profile.currentTeam;
    if (!team || !players?.meta.teamLogos) return undefined;
    return players.meta.teamLogos[team] ?? players.meta.teamLogos[canonicalTeamName(team)];
  } catch {
    return undefined;
  }
}
