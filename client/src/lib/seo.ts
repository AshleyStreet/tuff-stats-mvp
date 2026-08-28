export type PageSeo = {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  siteName?: string;
};

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

  const canonical = seo.canonical ?? `${window.location.origin}${window.location.pathname}`;
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
  league: { name: string; shortName: string; copy: { documentTitle: string }; branding: { logo: string } },
  tab: "players" | "teams" | "schedule" | "cards",
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
  const image = league.branding.logo?.startsWith("http") ? league.branding.logo : undefined;
  return {
    title: `${league.shortName} ${tabLabel} · ${season}`,
    description: `Browse ${league.name} ${tabLabel.toLowerCase()} for the ${season} season — standings, schedules, and player stats.`,
    image,
    siteName: league.shortName
  };
}
