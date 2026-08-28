import type { Player, PlayerProfile, ScheduleGame, TeamStanding } from "../types";

export type PageSeo = {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  siteName?: string;
};

function leagueImage(league: { branding: { logo: string } }) {
  return league.branding.logo?.startsWith("http") ? league.branding.logo : undefined;
}

export function canonicalUrl(origin: string, pathname: string, season?: string) {
  const base = origin.replace(/\/$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = `${base}${path}`;
  const seasonLabel = season?.trim();
  if (!seasonLabel) return url;
  return `${url}?season=${encodeURIComponent(seasonLabel)}`;
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }
  node.content = content;
}

function upsertLink(rel: string, href: string) {
  let node = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement("link");
    node.rel = rel;
    document.head.appendChild(node);
  }
  node.href = href;
}

/** Update document meta tags for SPA navigation (crawlers get server-inlined tags). */
export function setPageSeo(seo: PageSeo) {
  document.title = seo.title;
  upsertMeta("name", "description", seo.description);
  upsertMeta("property", "og:title", seo.title);
  upsertMeta("property", "og:description", seo.description);
  upsertMeta("name", "twitter:title", seo.title);
  upsertMeta("name", "twitter:description", seo.description);

  const canonical = seo.canonical ?? `${window.location.origin}${window.location.pathname}${window.location.search}`;
  upsertMeta("property", "og:url", canonical);
  upsertLink("canonical", canonical);

  if (seo.siteName) upsertMeta("property", "og:site_name", seo.siteName);
  if (seo.image) {
    upsertMeta("property", "og:image", seo.image);
    upsertMeta("name", "twitter:image", seo.image);
    upsertMeta("name", "twitter:card", "summary_large_image");
  } else {
    upsertMeta("name", "twitter:card", "summary");
  }
}

export function leagueTabSeo(
  league: { name: string; shortName: string; branding: { logo: string } },
  tab: "players" | "teams" | "schedule" | "cards",
  season: string,
  pathname: string
): PageSeo {
  const tabLabel =
    tab === "players"
      ? "Player stats"
      : tab === "teams"
        ? "Standings"
        : tab === "schedule"
          ? "Schedule"
          : "Player cards";
  return {
    title: `${league.shortName} ${tabLabel} · ${season}`,
    description: `Browse ${league.name} ${tabLabel.toLowerCase()} for the ${season} season — standings, schedules, and player stats.`,
    canonical: canonicalUrl(window.location.origin, pathname, season),
    image: leagueImage(league),
    siteName: league.shortName
  };
}

export function playerSeo(
  league: { name: string; shortName: string; branding: { logo: string } },
  profile: PlayerProfile,
  season: string,
  pathname: string,
  teamLogos?: Record<string, string>
): PageSeo {
  const seasonRow = profile.seasons.find((row) => row.season === season);
  const team = seasonRow?.team ?? profile.currentTeam;
  const points = seasonRow?.derived.totalPoints ?? profile.career.derived.totalPoints;
  const touchdowns = seasonRow?.derived.totalTouchdowns ?? profile.career.derived.totalTouchdowns;
  const logo = team && teamLogos ? teamLogos[team] : undefined;
  return {
    title: `${profile.name}${team ? ` · ${team}` : ""} · ${league.shortName} · ${season}`,
    description: `${profile.name}${team ? ` (${team})` : ""} — ${points} pts and ${touchdowns} TD in the ${season} ${league.name} season.`,
    canonical: canonicalUrl(window.location.origin, pathname, season),
    image: logo?.startsWith("http") ? logo : leagueImage(league),
    siteName: league.shortName
  };
}

export function playerSeoFromRoster(
  league: { name: string; shortName: string; branding: { logo: string } },
  player: Player,
  season: string,
  pathname: string,
  teamLogos?: Record<string, string>
): PageSeo {
  const team = player.team;
  const logo = team && teamLogos ? teamLogos[team] : undefined;
  return {
    title: `${player.name}${team ? ` · ${team}` : ""} · ${league.shortName} · ${season}`,
    description: `${player.name}${team ? ` (${team})` : ""} — ${player.derived.totalPoints} pts and ${player.derived.totalTouchdowns} TD in the ${season} ${league.name} season.`,
    canonical: canonicalUrl(window.location.origin, pathname, season),
    image: logo?.startsWith("http") ? logo : leagueImage(league),
    siteName: league.shortName
  };
}

export function teamSeo(
  league: { name: string; shortName: string; branding: { logo: string } },
  teamName: string,
  season: string,
  pathname: string,
  standing?: TeamStanding,
  logoUrl?: string
): PageSeo {
  const record = standing
    ? `${standing.wins}-${standing.losses}${standing.ties ? `-${standing.ties}` : ""}`
    : undefined;
  return {
    title: `${teamName} · ${league.shortName} · ${season}`,
    description: record
      ? `${teamName} (${record}) in the ${season} ${league.name} season — roster, standings, and player stats.`
      : `${teamName} roster and player stats for the ${season} ${league.name} season.`,
    canonical: canonicalUrl(window.location.origin, pathname, season),
    image: logoUrl?.startsWith("http") ? logoUrl : leagueImage(league),
    siteName: league.shortName
  };
}

export function gameSeo(
  league: { name: string; shortName: string; branding: { logo: string } },
  game: ScheduleGame,
  season: string,
  pathname: string
): PageSeo {
  const [home, away] = game.teams;
  const headline =
    game.status === "final" && home && away
      ? `${home.name} ${home.score ?? 0}, ${away.name} ${away.score ?? 0}`
      : game.title;
  const statusLabel = game.status === "final" ? "Final" : game.status === "upcoming" ? "Upcoming" : "Game";
  const image = home?.logoUrl?.startsWith("http")
    ? home.logoUrl
    : away?.logoUrl?.startsWith("http")
      ? away.logoUrl
      : leagueImage(league);
  return {
    title: `${headline} · ${league.shortName} · ${season}`,
    description: `${statusLabel}: ${game.title}${game.venue ? ` at ${game.venue}` : ""}. Box score and player stats.`,
    canonical: canonicalUrl(window.location.origin, pathname, season),
    image,
    siteName: league.shortName
  };
}
