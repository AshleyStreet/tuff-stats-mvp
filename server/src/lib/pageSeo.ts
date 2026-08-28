import type { PublicLeague } from "../leagues/types.js";
import { listLeagues } from "../leagues/registry.js";
import { isMarketingHost } from "./marketingHosts.js";
import type { PlayerProfile, ScheduleGame, TeamStanding } from "../domain/types.js";
import { tabPath, type AppTab } from "./appRoutes.js";

export type PageSeo = {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  siteName?: string;
  type?: "website" | "article" | "profile";
};

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function leagueSeoDescription(league: PublicLeague, season?: string) {
  const seasonLabel = season?.trim();
  if (seasonLabel) {
    return `Live ${league.name} standings, schedules, player stats, and trading cards for the ${seasonLabel} season.`;
  }
  return `Live ${league.name} standings, schedules, player stats, and trading cards.`;
}

export function marketingSeo(origin: string): PageSeo {
  return {
    title: "Afterwhistle · League stats boards",
    description:
      "Standings, schedules, and player cards for rec leagues — under your club's name and colors, without replacing your existing website.",
    canonical: origin.endsWith("/") ? origin : `${origin}/`,
    siteName: "Afterwhistle",
    type: "website"
  };
}

export function canonicalUrl(origin: string, pathname: string, season?: string) {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = `${base}${path}`;
  const seasonLabel = season?.trim();
  if (!seasonLabel) return url;
  return `${url}?season=${encodeURIComponent(seasonLabel)}`;
}

export function leagueTabSeo(
  league: PublicLeague,
  tab: AppTab,
  origin: string,
  pathname: string,
  season: string
): PageSeo {
  const tabLabel =
    tab === "players"
      ? "Player stats"
      : tab === "teams"
        ? "Standings"
        : tab === "schedule"
          ? "Schedule"
          : "Player cards";
  const logo = league.branding?.logo;
  const image = logo?.startsWith("http") ? logo : undefined;
  return {
    title: `${league.shortName} ${tabLabel} · ${season}`,
    description: `Browse ${league.name} ${tabLabel.toLowerCase()} for the ${season} season — standings, schedules, and player stats.`,
    canonical: canonicalUrl(origin, pathname || tabPath(tab), season),
    image,
    siteName: league.shortName,
    type: "website"
  };
}

export function playerSeo(
  league: PublicLeague,
  profile: PlayerProfile,
  origin: string,
  pathname: string,
  season: string,
  image?: string
): PageSeo {
  const seasonRow = profile.seasons.find((row) => row.season === season);
  const team = seasonRow?.team ?? profile.currentTeam;
  const points = seasonRow?.derived.totalPoints ?? profile.career.derived.totalPoints;
  const touchdowns = seasonRow?.derived.totalTouchdowns ?? profile.career.derived.totalTouchdowns;
  return {
    title: `${profile.name}${team ? ` · ${team}` : ""} · ${league.shortName} · ${season}`,
    description: `${profile.name}${team ? ` (${team})` : ""} — ${points} pts and ${touchdowns} TD in the ${season} ${league.name} season.`,
    canonical: canonicalUrl(origin, pathname, season),
    image,
    siteName: league.shortName,
    type: "profile"
  };
}

export function teamSeo(
  league: PublicLeague,
  teamName: string,
  origin: string,
  pathname: string,
  season: string,
  standing?: TeamStanding,
  logoUrl?: string
): PageSeo {
  const record = standing
    ? `${standing.wins}-${standing.losses}${standing.ties ? `-${standing.ties}` : ""}`
    : undefined;
  const image = logoUrl?.startsWith("http") ? logoUrl : undefined;
  return {
    title: `${teamName} · ${league.shortName} · ${season}`,
    description: record
      ? `${teamName} (${record}) in the ${season} ${league.name} season — roster, standings, and player stats.`
      : `${teamName} roster and player stats for the ${season} ${league.name} season.`,
    canonical: canonicalUrl(origin, pathname, season),
    image,
    siteName: league.shortName,
    type: "website"
  };
}

export function gameSeo(
  league: PublicLeague,
  game: ScheduleGame,
  origin: string,
  pathname: string,
  season: string
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
      : undefined;
  return {
    title: `${headline} · ${league.shortName} · ${season}`,
    description: `${statusLabel}: ${game.title}${game.venue ? ` at ${game.venue}` : ""}. Box score and player stats.`,
    canonical: canonicalUrl(origin, pathname, season),
    image,
    siteName: league.shortName,
    type: "article"
  };
}

export function leagueSeo(league: PublicLeague, origin: string, season?: string): PageSeo {
  const logo = league.branding?.logo;
  const image = logo?.startsWith("http") ? logo : undefined;
  return {
    title: league.copy.documentTitle,
    description: leagueSeoDescription(league, season),
    canonical: origin.endsWith("/") ? origin : `${origin}/`,
    image,
    siteName: league.shortName,
    type: "website"
  };
}

function metaTag(attr: "name" | "property", key: string, content: string) {
  return `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(content)}">`;
}

function jsonLdScript(data: unknown) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

export function renderSeoHead(seo: PageSeo) {
  const tags = [
    `<title>${escapeHtml(seo.title)}</title>`,
    metaTag("name", "description", seo.description),
    metaTag("name", "robots", "index, follow"),
    `<link rel="canonical" href="${escapeHtml(seo.canonical)}">`,
    metaTag("property", "og:title", seo.title),
    metaTag("property", "og:description", seo.description),
    metaTag("property", "og:url", seo.canonical),
    metaTag("property", "og:type", seo.type ?? "website"),
    metaTag("name", "twitter:card", seo.image ? "summary_large_image" : "summary"),
    metaTag("name", "twitter:title", seo.title),
    metaTag("name", "twitter:description", seo.description)
  ];

  if (seo.siteName) tags.push(metaTag("property", "og:site_name", seo.siteName));
  if (seo.image) {
    tags.push(metaTag("property", "og:image", seo.image));
    tags.push(metaTag("name", "twitter:image", seo.image));
  }

  tags.push(
    jsonLdScript({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: seo.title,
      url: seo.canonical,
      description: seo.description
    })
  );

  return tags.join("\n");
}

export function injectPageSeo(html: string, seo: PageSeo) {
  const head = renderSeoHead(seo);
  let out = html.replace(/<title>[^<]*<\/title>\s*/i, "");
  if (out.includes("</head>")) {
    return out.replace("</head>", `${head}\n</head>`);
  }
  return out.replace("</body>", `${head}\n</body>`);
}

export function renderRobotsTxt(origin: string) {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return ["User-agent: *", "Allow: /", "Disallow: /admin", `Sitemap: ${base}/sitemap.xml`, ""].join("\n");
}

export async function renderSitemapXml(
  origin: string,
  host: string,
  extraUrls: string[] = []
) {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  const urls = new Set<string>(extraUrls);

  if (isMarketingHost(host)) {
    urls.add(`${base}/`);
  } else {
    const league = listLeagues().find((item) =>
      item.hostnames.some((name) => name.toLowerCase() === host.toLowerCase())
    );
    if (league) {
      for (const name of league.hostnames) {
        urls.add(`https://${name}/`);
      }
    } else {
      urls.add(`${base}/`);
    }
  }

  const body = [...urls]
    .map(
      (loc) => `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function requestOrigin(req: { protocol: string; get(name: string): string | undefined }) {
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]?.trim() ?? "";
  const proto = (req.get("x-forwarded-proto") ?? req.protocol ?? "https").split(",")[0]?.trim() ?? "https";
  return host ? `${proto}://${host}` : "";
}
