import type { SpList, SpSeason, SpTable, SpTeam } from "../adapters/sportspress/types.js";
import { headerMap } from "../lib/stats.js";
import { slugifyTeam } from "./fixture-seed.js";
import { normalizeSport, type SupportedSport } from "./sport.js";
import type { LeagueSourceConfig, SportspressSeasonSlice } from "./types.js";

export type ProbeFetch = (url: string, init?: RequestInit) => Promise<Response | null>;

export type ProbeSeason = {
  key: string;
  label: string;
  slug?: string;
  seasonSlug?: string;
};

export type SourceProbeResult = {
  ok: boolean;
  origin: string;
  hostname: string;
  siteName?: string;
  sportspress: boolean;
  sportspressLive: boolean;
  adapter: "fixture" | "sportspress";
  sport: SupportedSport;
  suggestedSlug: string;
  suggestedName: string;
  suggestedShortName: string;
  publicSeason: string;
  hostnames: string[];
  franchiseTeamNames: string[];
  source?: LeagueSourceConfig;
  seasons: ProbeSeason[];
  tables: string[];
  lists: string[];
  warnings: string[];
};

const NOISE_TEAM_PATTERNS = [
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
  "venir",
  "tbd",
  "bye"
];

const USER_AGENT = "Tuff-Stats-Probe/0.1";

function yearFromSlug(value: string | undefined) {
  return value?.match(/(?:^|-)((?:19|20)\d{2})$/)?.[1] ?? value?.match(/^((?:19|20)\d{2})$/)?.[1] ?? null;
}

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function hostnameFromOrigin(origin: string) {
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return origin.replace(/^https?:\/\//, "").split("/")[0]?.replace(/^www\./, "") ?? "tenant";
  }
}

function slugFromHostname(hostname: string) {
  const base = hostname.replace(/^www\./, "").split(".")[0] ?? "tenant";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function shortNameFrom(text: string) {
  const cleaned = text.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return "LEAGUE";
  if (words.length === 1) return words[0]!.slice(0, 12).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function normalizeOrigin(raw: string) {
  let value = raw.trim();
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  return url.origin;
}

async function fetchJson<T>(fetchImpl: ProbeFetch, url: string): Promise<T | null> {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12000)
  });
  if (!response?.ok) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function listHeaders(list: SpList) {
  const headers = new Set<string>();
  for (const row of Object.values(list.data ?? {})) {
    for (const key of Object.keys(row)) {
      headers.add(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }
  }
  return headers;
}

function detectSport(headers: Set<string>, siteName: string): SupportedSport {
  const soccerKeys = ["goals", "buts", "yellowcards", "cartonsjaunes", "redcards", "cartonsrouges"];
  const softballKeys = ["ab", "hr", "rbi", "doubles", "triples", "hits", "runs"];
  const footballKeys = ["tpqb", "patd", "rutd", "rectd", "deflag", "pa1pt", "paonept"];

  const soccerHits = soccerKeys.filter((key) => headers.has(key)).length;
  const softballHits = softballKeys.filter((key) => headers.has(key)).length;
  const footballHits = footballKeys.filter((key) => headers.has(key)).length;

  if (soccerHits >= 2 || (soccerHits >= 1 && /soccer|football club|fútbol|futbol/i.test(siteName))) {
    return "soccer";
  }
  if (softballHits >= +2 || /softball|baseball|slopitch/i.test(siteName)) return "softball";
  if (footballHits >= 2 || /flag football|tuff|gridiron/i.test(siteName)) return "flag-football";

  for (const header of headers) {
    const mapped = headerMap[header];
    if (mapped === "goals" || mapped === "yellowCards" || mapped === "redCards") return "soccer";
    if (mapped === "ab" || mapped === "hr" || mapped === "rbi") return "softball";
    if (mapped === "tpqb" || mapped === "paTD" || mapped === "deflag") return "flag-football";
  }

  return "flag-football";
}

function standingsSlugTemplate(tables: string[]) {
  const withYear = tables.filter((slug) => yearFromSlug(slug));
  if (!withYear.length) return undefined;
  const sample = withYear[0]!;
  const year = yearFromSlug(sample)!;
  return sample.replace(year, "{year}");
}

function configuredSeasons(
  tables: string[],
  seasons: SpSeason[],
  lists: SpList[]
): SportspressSeasonSlice[] {
  return tables.map((standingsSlug) => {
    const year = yearFromSlug(standingsSlug);
    const seasonSlug =
      seasons.find((season) => season.slug === standingsSlug)?.slug ??
      seasons.find((season) => year && season.slug?.includes(year))?.slug ??
      standingsSlug;
    const statsListSlug = lists.find((list) => {
      const slug = list.slug ?? "";
      if (standingsSlug.includes(slug) || slug.includes(standingsSlug)) return true;
      const div = standingsSlug.split("-")[0];
      return div ? slug.includes(div) : false;
    })?.slug;
    const key = standingsSlug;
    const label = standingsSlug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    return {
      key,
      label,
      seasonSlug,
      standingsSlug,
      statsListSlug,
      divisionSlug: standingsSlug.split("-")[0]
    };
  });
}

export function buildSportspressSource(input: {
  slug: string;
  origin: string;
  sport: SupportedSport;
  tables: string[];
  lists: SpList[];
  seasons: SpSeason[];
  franchiseTeamNames: string[];
}): LeagueSourceConfig {
  const teams = input.franchiseTeamNames;
  const listSlugs = input.lists.map((list) => list.slug).filter(Boolean) as string[];
  const tableSlugs = input.tables;
  const yearTables = tableSlugs.filter((slug) => yearFromSlug(slug));
  const seasonMode = yearTables.length >= Math.max(1, Math.ceil(tableSlugs.length / 2)) ? "year" : "configured";
  const latestYear =
    [...yearTables.map((slug) => yearFromSlug(slug)!)]
      .sort((a, b) => Number(b) - Number(a))[0] ?? String(new Date().getFullYear());
  const template = standingsSlugTemplate(tableSlugs);
  const primaryList = listSlugs[0];

  return {
    origin: input.origin,
    statsUrl: primaryList ? `${input.origin}/list/${primaryList}/` : `${input.origin}/`,
    userAgent: `${input.slug}-Stats/0.1`,
    defaultStatsListSuffix: primaryList?.split("-").pop() ?? "stats",
    statsListTokens: listSlugs.filter((slug) => /stat|stats|leader/i.test(slug)),
    excludeStatsSlugs: [],
    standings: {
      modernFromYear: Number(latestYear) - 2,
      modern: tableSlugs.slice(0, 5),
      legacy: tableSlugs.slice(0, 5)
    },
    standingsSlugTemplate: template,
    modernTeamSlugs: teams.map(slugifyTeam),
    franchiseTeamNames: teams,
    sportspress: {
      seasonMode,
      playerSource: input.lists.some((list) => Object.keys(list.data ?? {}).length > 0)
        ? "lists"
        : "none",
      excludeTeamNamePatterns: NOISE_TEAM_PATTERNS,
      seasons:
        seasonMode === "configured" ? configuredSeasons(tableSlugs, input.seasons, input.lists) : undefined
    }
  };
}

export async function probeSourceUrl(rawUrl: string, fetchImpl?: ProbeFetch): Promise<SourceProbeResult> {
  const fetcher: ProbeFetch =
    fetchImpl ??
    (async (url, init) => {
      try {
        return await fetch(url, init);
      } catch {
        return null;
      }
    });

  const warnings: string[] = [];
  let origin: string;
  try {
    origin = normalizeOrigin(rawUrl);
  } catch {
    return {
      ok: false,
      origin: "",
      hostname: "",
      sportspress: false,
      sportspressLive: false,
      adapter: "fixture",
      sport: "flag-football",
      suggestedSlug: "tenant",
      suggestedName: "New League",
      suggestedShortName: "LEAGUE",
      publicSeason: String(new Date().getFullYear()),
      hostnames: [],
      franchiseTeamNames: [],
      seasons: [],
      tables: [],
      lists: [],
      warnings: ["Enter a valid URL like https://example.com"]
    };
  }

  const hostname = hostnameFromOrigin(origin);
  const suggestedSlug = slugFromHostname(hostname);
  const hostnames = [hostname, `www.${hostname}`, `${suggestedSlug}.localhost`];

  const root = await fetchJson<{ name?: string; namespaces?: string[]; url?: string }>(
    fetcher,
    `${origin}/wp-json/`
  );
  const siteName = root?.name?.trim() || hostname;
  const namespaces = root?.namespaces ?? [];
  const types = await fetchJson<Record<string, { rest_base?: string }>>(fetcher, `${origin}/wp-json/wp/v2/types`);
  const hasSpTypes = Boolean(types?.sp_event || types?.sp_table || types?.sp_list);
  const sportspress = namespaces.includes("sportspress/v2") || hasSpTypes;

  if (!sportspress) {
    warnings.push("SportsPress was not detected. This tenant will use demo fixture data.");
    return {
      ok: true,
      origin,
      hostname,
      siteName,
      sportspress: false,
      sportspressLive: false,
      adapter: "fixture",
      sport: "flag-football",
      suggestedSlug,
      suggestedName: siteName,
      suggestedShortName: shortNameFrom(siteName),
      publicSeason: String(new Date().getFullYear()),
      hostnames,
      franchiseTeamNames: [],
      seasons: [],
      tables: [],
      lists: [],
      warnings
    };
  }

  const [seasonRows, tableRows, listRows, teamRows, eventRows] = await Promise.all([
    fetchJson<SpSeason[]>(fetcher, `${origin}/wp-json/sportspress/v2/seasons?per_page=100&_fields=id,name,slug`),
    fetchJson<SpTable[]>(
      fetcher,
      `${origin}/wp-json/sportspress/v2/tables?per_page=50&_fields=id,slug,data,modified,modified_gmt`
    ),
    fetchJson<SpList[]>(
      fetcher,
      `${origin}/wp-json/sportspress/v2/lists?per_page=50&_fields=id,slug,title,data`
    ),
    fetchJson<SpTeam[]>(fetcher, `${origin}/wp-json/sportspress/v2/teams?per_page=100&_fields=id,title`),
    fetchJson<unknown[]>(fetcher, `${origin}/wp-json/sportspress/v2/events?per_page=1&_fields=id`)
  ]);

  const seasons = Array.isArray(seasonRows) ? seasonRows : [];
  const tableItems = Array.isArray(tableRows) ? tableRows : [];
  const lists = Array.isArray(listRows) ? listRows : [];
  const tables = tableItems.map((row) => row.slug).filter(Boolean) as string[];
  const listSlugs = lists.map((list) => list.slug).filter(Boolean) as string[];
  const franchiseTeamNames = (Array.isArray(teamRows) ? teamRows : [])
    .map((team) => decodeEntities(team.title?.rendered ?? ""))
    .filter((name) => name && !/match|tbd|bye|determin/i.test(name));
  const sportspressLive = Boolean(
    seasons.length || tables.length || lists.some((list) => Object.keys(list.data ?? {}).length) || eventRows?.length
  );

  const headerSet = new Set<string>();
  for (const list of lists) {
    for (const header of listHeaders(list)) headerSet.add(header);
  }
  for (const table of tableItems) {
    for (const row of Object.values(table.data ?? {})) {
      for (const key of Object.keys(row)) headerSet.add(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }
  }
  const sport = detectSport(headerSet, siteName);

  const probeSeasons: ProbeSeason[] = [];
  if (seasons.length) {
    for (const season of seasons) {
      const year = yearFromSlug(season.slug) ?? yearFromSlug(season.name);
      const key = year ?? season.slug ?? String(season.id);
      if (!key) continue;
      probeSeasons.push({
        key,
        label: season.name?.trim() || `${key} Season`,
        slug: season.slug,
        seasonSlug: season.slug
      });
    }
  }
  for (const slug of tables) {
    const year = yearFromSlug(slug);
    if (!year) continue;
    if (probeSeasons.some((season) => season.key === year)) continue;
    probeSeasons.push({ key: year, label: `${year} Season`, slug });
  }
  probeSeasons.sort((a, b) => Number(b.key) - Number(a.key));

  const publicSeason = probeSeasons[0]?.key ?? String(new Date().getFullYear());

  if (!sportspressLive) {
    warnings.push(
      "SportsPress is installed but returned no seasons, tables, lists, or events. Fixture data will be used until the source is populated."
    );
  }

  const adapter = sportspressLive ? "sportspress" : "fixture";
  const source =
    adapter === "sportspress"
      ? buildSportspressSource({
          slug: suggestedSlug,
          origin,
          sport,
          tables,
          lists,
          seasons,
          franchiseTeamNames
        })
      : undefined;

  return {
    ok: true,
    origin,
    hostname,
    siteName,
    sportspress,
    sportspressLive,
    adapter,
    sport,
    suggestedSlug,
    suggestedName: siteName,
    suggestedShortName: shortNameFrom(siteName),
    publicSeason,
    hostnames,
    franchiseTeamNames,
    source,
    seasons: probeSeasons,
    tables,
    lists: listSlugs,
    warnings
  };
}
