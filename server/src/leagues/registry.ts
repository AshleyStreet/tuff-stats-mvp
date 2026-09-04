import { resetFixtureAdapters } from "../adapters/fixture/index.js";
import { resetSportspressAdapters } from "../adapters/sportspress/index.js";
import { dummyFixtureSource, emptyFixtureSeed } from "./fixture-seed.js";
import { bushLeague } from "./bush.js";
import { harborLeague } from "./harbor.js";
import { passionLeague } from "./passion.js";
import { normalizeSport, sportMeta } from "./sport.js";
import { applyTenantRecord, cloneLeague, cloneSourceConfig, readTenantRecords, type TenantRecord } from "./store.js";
import { tuffLeague } from "./tuff.js";
import type { League, PublicLeague } from "./types.js";
import { toPublicLeague } from "./types.js";

export const DEFAULT_LEAGUE_SLUG = "tuff";
export const CODE_LEAGUES: League[] = [tuffLeague, harborLeague, bushLeague, passionLeague];
export const CODE_LEAGUE_SLUGS = new Set(CODE_LEAGUES.map((league) => league.slug));

let leagues = new Map<string, League>();

export function reloadTenants() {
  const next = new Map<string, League>();
  for (const league of CODE_LEAGUES) {
    next.set(league.slug, cloneLeague(league));
  }

  for (const record of readTenantRecords()) {
    try {
      const existing = next.get(record.slug);
      if (existing) {
        next.set(record.slug, applyTenantRecord(existing, record, CODE_LEAGUE_SLUGS.has(record.slug)));
        continue;
      }
      if (record.kind !== "created") continue;
      const created = leagueFromCreatedRecord(record);
      if (created) next.set(created.slug, created);
    } catch {
      /* skip invalid records so a bad overlay cannot take the process down */
    }
  }

  leagues = next;
  resetFixtureAdapters();
  resetSportspressAdapters();
}

function leagueFromCreatedRecord(record: TenantRecord): League | undefined {
  if (!record.slug || !record.name?.trim() || !record.shortName?.trim()) return undefined;
  const teams = (record.franchiseTeamNames ?? []).map((name) => name.trim()).filter(Boolean);
  const publicSeason = record.publicSeason?.trim() || "2026";
  const name = record.name.trim();
  const shortName = record.shortName.trim();
  const adapter = record.adapter === "sportspress" ? "sportspress" : "fixture";
  const sport = normalizeSport(record.sport);
  const { sportIcon, presentation, label: sportLabel } = sportMeta(sport);

  const source =
    adapter === "sportspress" && record.source
      ? cloneSourceConfig(record.source)
      : dummyFixtureSource({ slug: record.slug, publicSeason, franchiseTeamNames: teams });
  const fixture =
    adapter === "fixture"
      ? record.fixture ?? emptyFixtureSeed({ slug: record.slug, publicSeason, franchiseTeamNames: teams })
      : undefined;

  const base: League = {
    id: record.slug,
    slug: record.slug,
    name,
    shortName,
    sport,
    hostnames: record.hostnames?.length ? record.hostnames : [`${record.slug}.localhost`],
    serviceName: `${record.slug}-stats-api`,
    branding: {
      logo: record.branding?.logo?.trim() || "/harbor-logo.svg",
      logoAlt: record.branding?.logoAlt?.trim() || name,
      primaryColor: record.branding?.primaryColor || "#0e7c7b",
      secondaryColor: record.branding?.secondaryColor || "#e8c547"
    },
    publicSeason,
    copy: {
      documentTitle: record.copy?.documentTitle?.trim() || `${shortName} Stats · ${sportLabel}`,
      tagline: record.copy?.tagline?.trim() || name.toUpperCase(),
      loadErrorTitle: record.copy?.loadErrorTitle?.trim() || `Couldn’t load ${shortName}.`,
      profileLinkLabel: record.copy?.profileLinkLabel?.trim() || `Open original ${shortName} profile`,
      recapLinkLabel: record.copy?.recapLinkLabel?.trim() || `Open original ${shortName} recap`,
      htmlSourceLabel: record.copy?.htmlSourceLabel?.trim() || `${shortName} table`
    },
    sportIcon: record.sportIcon ?? sportIcon,
    presentation,
    adapter,
    source,
    fixture
  };
  return applyTenantRecord(base, record, false);
}

reloadTenants();

export function listLeagues(): League[] {
  return [...leagues.values()];
}

export function getLeagueBySlug(slug: string): League | undefined {
  return leagues.get(slug.trim().toLowerCase());
}

/** O(n) over a small tenant set — intentional, don't add a cache keyed by hostname here, since it'd need to stay in sync across reloadTenants(). */
export function getLeagueByHostname(host: string): League | undefined {
  const hostname = host.trim().toLowerCase().split(":")[0];
  if (!hostname) return undefined;
  for (const league of leagues.values()) {
    if (league.hostnames.some((item) => item.toLowerCase() === hostname)) return league;
  }
  return undefined;
}

/** Unknown slugs fall back to TUFF so a bad LEAGUE_SLUG cannot take production down. */
export function resolveLeague(slug?: string | null): League {
  const requested = (slug ?? process.env.LEAGUE_SLUG ?? DEFAULT_LEAGUE_SLUG).trim().toLowerCase();
  if (!requested) return getLeagueBySlug(DEFAULT_LEAGUE_SLUG) ?? cloneLeague(tuffLeague);
  return getLeagueBySlug(requested) ?? getLeagueBySlug(DEFAULT_LEAGUE_SLUG) ?? cloneLeague(tuffLeague);
}

export function getDefaultLeague(): League {
  return resolveLeague();
}

/**
 * Host wins so one process can serve TUFF and Harbor.
 * Unknown hosts use the process default (TUFF unless LEAGUE_SLUG says otherwise).
 * `slug` is a dev-only override and is ignored in production.
 */
export function resolveRequestLeague(input: {
  host?: string | null;
  forwardedHost?: string | null;
  slug?: string | null;
}): League {
  const fromHost =
    (input.host ? getLeagueByHostname(input.host) : undefined) ??
    (input.forwardedHost ? getLeagueByHostname(input.forwardedHost.split(",")[0] ?? "") : undefined);
  if (fromHost) return fromHost;
  if (process.env.NODE_ENV !== "production") {
    const slug = input.slug?.trim();
    if (slug) return getLeagueBySlug(slug) ?? getDefaultLeague();
  }
  return getDefaultLeague();
}

export function getPublicLeague(slug?: string | null): PublicLeague {
  return toPublicLeague(resolveLeague(slug));
}

export function isBuiltInLeague(slug: string) {
  return CODE_LEAGUE_SLUGS.has(slug.trim().toLowerCase());
}

export { toPublicLeague };
