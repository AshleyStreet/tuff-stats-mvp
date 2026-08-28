export type AppTab = "players" | "teams" | "schedule" | "cards";

export type AppRoute = {
  tab: AppTab;
  playerId?: string;
  teamSlug?: string;
  gameId?: number;
  season?: string;
};

export function slugifyTeam(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "team"
  );
}

export function resolveTeamName(slug: string, names: string[]) {
  const normalized = slug.trim().toLowerCase();
  return names.find((name) => slugifyTeam(name) === normalized) ?? null;
}

export function parseAppRoute(pathname: string, search = ""): AppRoute {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const season = params.get("season")?.trim() || undefined;
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);

  if (!parts.length) return { tab: "players", season };

  const [section, id] = parts;
  switch (section) {
    case "players":
      return id
        ? { tab: "players", playerId: decodeURIComponent(id), season }
        : { tab: "players", season };
    case "teams":
      return id
        ? { tab: "teams", teamSlug: decodeURIComponent(id), season }
        : { tab: "teams", season };
    case "schedule": {
      if (!id) return { tab: "schedule", season };
      const gameId = Number(id);
      return Number.isFinite(gameId) ? { tab: "schedule", gameId, season } : { tab: "schedule", season };
    }
    case "cards":
      return { tab: "cards", season };
    default:
      return { tab: "players", season };
  }
}

export function tabPath(tab: AppTab) {
  switch (tab) {
    case "players":
      return "/players";
    case "teams":
      return "/teams";
    case "schedule":
      return "/schedule";
    case "cards":
      return "/cards";
  }
}

export function buildAppPath(route: AppRoute) {
  const params = new URLSearchParams();
  if (route.season) params.set("season", route.season);
  const query = params.toString();
  const suffix = query ? `?${query}` : "";

  let path = "/";
  switch (route.tab) {
    case "players":
      path = route.playerId ? `/players/${encodeURIComponent(route.playerId)}` : "/players";
      break;
    case "teams":
      path = route.teamSlug ? `/teams/${encodeURIComponent(route.teamSlug)}` : "/teams";
      break;
    case "schedule":
      path = route.gameId != null ? `/schedule/${route.gameId}` : "/schedule";
      break;
    case "cards":
      path = "/cards";
      break;
  }
  return `${path}${suffix}`;
}
