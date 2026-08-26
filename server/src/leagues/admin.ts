import { emptyFixtureSeed } from "./fixture-seed.js";
import {
  CODE_LEAGUE_SLUGS,
  getLeagueByHostname,
  getLeagueBySlug,
  isBuiltInLeague,
  listLeagues,
  reloadTenants
} from "./registry.js";
import { probeSourceUrl, type SourceProbeResult } from "./probe.js";
import { normalizeSport, sportMeta } from "./sport.js";
import {
  isValidSlug,
  mergeTenantRecord,
  parseHexColor,
  parseHostnames,
  TenantStoreError
} from "./store.js";
import type { League, LeagueBranding, LeagueCopy, LeagueSourceConfig } from "./types.js";

export class AdminError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "AdminError";
  }
}

export type AdminTenant = {
  slug: string;
  name: string;
  shortName: string;
  sport: string;
  hostnames: string[];
  branding: LeagueBranding;
  publicSeason: string;
  copy: LeagueCopy;
  sportIcon: League["sportIcon"];
  adapter: League["adapter"];
  builtIn: boolean;
  franchiseTeamNames: string[];
  sourceOrigin?: string;
};

export type TenantWriteInput = {
  slug?: string;
  name?: string;
  shortName?: string;
  hostnames?: unknown;
  branding?: Partial<LeagueBranding>;
  copy?: Partial<LeagueCopy>;
  publicSeason?: string;
  franchiseTeamNames?: unknown;
  adapter?: string;
  sport?: string;
  sourceUrl?: string;
  source?: LeagueSourceConfig;
};

function toAdminTenant(league: League): AdminTenant {
  return {
    slug: league.slug,
    name: league.name,
    shortName: league.shortName,
    sport: league.sport,
    hostnames: [...league.hostnames],
    branding: { ...league.branding },
    publicSeason: league.publicSeason,
    copy: { ...league.copy },
    sportIcon: league.sportIcon,
    adapter: league.adapter,
    builtIn: isBuiltInLeague(league.slug),
    franchiseTeamNames: [...league.source.franchiseTeamNames],
    sourceOrigin: league.adapter === "sportspress" ? league.source.origin : undefined
  };
}

export function listAdminTenants(): AdminTenant[] {
  return listLeagues().map(toAdminTenant);
}

export async function probeAdminSourceUrl(rawUrl: string): Promise<SourceProbeResult> {
  const url = String(rawUrl ?? "").trim();
  if (!url) throw new AdminError(400, "Source URL is required");
  return probeSourceUrl(url);
}

function teamNames(raw: unknown) {
  if (raw == null) return undefined;
  const list = Array.isArray(raw) ? raw : String(raw).split(/[\n,]/);
  return list.map((item) => String(item).trim()).filter(Boolean);
}

function brandingPatch(raw?: Partial<LeagueBranding>) {
  if (!raw) return undefined;
  const branding: Partial<LeagueBranding> = {};
  if (raw.logo != null) branding.logo = String(raw.logo).trim();
  if (raw.logoAlt != null) branding.logoAlt = String(raw.logoAlt).trim();
  if (raw.primaryColor != null) branding.primaryColor = parseHexColor(raw.primaryColor, "Primary color");
  if (raw.secondaryColor != null) branding.secondaryColor = parseHexColor(raw.secondaryColor, "Secondary color");
  return branding;
}

function assertUniqueHostnames(hostnames: string[], slug: string) {
  for (const hostname of hostnames) {
    const owner = getLeagueByHostname(hostname);
    if (owner && owner.slug !== slug) {
      throw new AdminError(409, `Hostname ${hostname} is already used by ${owner.shortName}`);
    }
  }
}

function resolveCreateAdapter(input: TenantWriteInput, probed?: SourceProbeResult) {
  const requested = input.adapter?.trim().toLowerCase();
  if (requested === "fixture" || requested === "sportspress") return requested;
  if (probed?.adapter) return probed.adapter;
  if (input.source) return "sportspress";
  return "fixture";
}

async function resolveCreatePayload(input: TenantWriteInput) {
  let probed: SourceProbeResult | undefined;
  if (input.sourceUrl?.trim()) {
    probed = await probeSourceUrl(input.sourceUrl.trim());
  }
  const adapter = resolveCreateAdapter(input, probed);
  const sport = normalizeSport(input.sport ?? probed?.sport);
  const { sportIcon } = sportMeta(sport);
  const source =
    adapter === "sportspress"
      ? input.source ?? probed?.source ?? (() => {
          throw new AdminError(
            400,
            "SportsPress source config is required. Probe the URL first or provide source settings."
          );
        })()
      : undefined;

  return { adapter, sport, sportIcon, source, probed };
}

export async function createAdminTenant(input: TenantWriteInput): Promise<AdminTenant> {
  const slug = String(input.slug ?? "").trim().toLowerCase();
  if (!isValidSlug(slug)) throw new AdminError(400, "Slug must be lowercase letters, numbers, and hyphens");
  if (CODE_LEAGUE_SLUGS.has(slug) || getLeagueBySlug(slug)) {
    throw new AdminError(409, "A tenant with that slug already exists");
  }

  const name = String(input.name ?? "").trim();
  const shortName = String(input.shortName ?? "").trim();
  if (!name) throw new AdminError(400, "Name is required");
  if (!shortName) throw new AdminError(400, "Short name is required");

  const { adapter, sport, sportIcon, source, probed } = await resolveCreatePayload(input);

  const hostnames =
    runStore(() => {
      if (input.hostnames != null) return parseHostnames(input.hostnames);
      if (probed?.hostnames.length) return probed.hostnames;
      return [`${slug}.localhost`];
    }) ?? [`${slug}.localhost`];
  assertUniqueHostnames(hostnames, slug);

  const publicSeason =
    String(input.publicSeason ?? probed?.publicSeason ?? "2026").trim() || "2026";
  const franchiseTeamNames =
    teamNames(input.franchiseTeamNames) ?? probed?.franchiseTeamNames ?? [];
  const branding = runStore(() => brandingPatch(input.branding) ?? {});

  try {
    mergeTenantRecord(slug, "created", {
      name,
      shortName,
      hostnames,
      publicSeason,
      franchiseTeamNames,
      branding,
      copy: input.copy,
      adapter,
      sport,
      sportIcon,
      source,
      fixture:
        adapter === "fixture"
          ? emptyFixtureSeed({ slug, publicSeason, franchiseTeamNames })
          : undefined
    });
  } catch (error) {
    wrapStoreError(error);
  }

  reloadTenants();
  const created = getLeagueBySlug(slug);
  if (!created) throw new AdminError(500, "Tenant was saved but could not be loaded");
  return toAdminTenant(created);
}

export function updateAdminTenant(slugInput: string, input: TenantWriteInput): AdminTenant {
  const slug = slugInput.trim().toLowerCase();
  const existing = getLeagueBySlug(slug);
  if (!existing) throw new AdminError(404, "Tenant not found");
  if (input.adapter && input.adapter !== existing.adapter) {
    throw new AdminError(400, "Cannot change adapter for this tenant");
  }
  if (input.slug && input.slug.trim().toLowerCase() !== slug) {
    throw new AdminError(400, "Cannot change slug");
  }

  const hostnames = input.hostnames != null ? runStore(() => parseHostnames(input.hostnames)) : undefined;
  if (hostnames) assertUniqueHostnames(hostnames, slug);

  const franchiseTeamNames = isBuiltInLeague(slug) ? undefined : teamNames(input.franchiseTeamNames);
  const sport = !isBuiltInLeague(slug) && input.sport ? normalizeSport(input.sport) : undefined;
  const sportIcon = sport ? sportMeta(sport).sportIcon : undefined;

  try {
    mergeTenantRecord(slug, isBuiltInLeague(slug) ? "overlay" : "created", {
      name: input.name,
      shortName: input.shortName,
      hostnames,
      publicSeason: input.publicSeason,
      franchiseTeamNames,
      branding: runStore(() => brandingPatch(input.branding)),
      copy: input.copy,
      sport,
      sportIcon
    });
  } catch (error) {
    wrapStoreError(error);
  }

  reloadTenants();
  const updated = getLeagueBySlug(slug);
  if (!updated) throw new AdminError(500, "Tenant was saved but could not be loaded");
  return toAdminTenant(updated);
}

function wrapStoreError(error: unknown): never {
  if (error instanceof TenantStoreError) throw new AdminError(error.status, error.message);
  if (error instanceof AdminError) throw error;
  throw error;
}

function runStore<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    wrapStoreError(error);
  }
}
