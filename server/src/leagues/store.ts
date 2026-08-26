import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FixtureSeed } from "./fixture-seed.js";
import type { League, LeagueBranding, LeagueCopy, LeagueSourceConfig } from "./types.js";
import type { SportIcon } from "./sports/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type TenantRecordKind = "overlay" | "created";

export type TenantRecord = {
  kind: TenantRecordKind;
  slug: string;
  name?: string;
  shortName?: string;
  hostnames?: string[];
  branding?: Partial<LeagueBranding>;
  copy?: Partial<LeagueCopy>;
  publicSeason?: string;
  franchiseTeamNames?: string[];
  fixture?: FixtureSeed;
  adapter?: "fixture" | "sportspress";
  sport?: string;
  sportIcon?: SportIcon;
  source?: LeagueSourceConfig;
};

export class TenantStoreError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "TenantStoreError";
  }
}

export function tenantsDir() {
  return path.resolve(process.env.TENANTS_DIR || path.join(__dirname, "../../.tenants"));
}

export function isValidSlug(slug: string) {
  return SLUG_RE.test(slug) && slug.length <= 48;
}

export function parseHostname(raw: string) {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0] ?? "";
  value = value.split(":")[0] ?? "";
  value = value.trim();
  if (!value || !HOST_RE.test(value)) {
    throw new TenantStoreError(400, `Invalid hostname: ${raw}`);
  }
  return value;
}

export function parseHostnames(raw: unknown) {
  if (raw == null) return undefined;
  const list = Array.isArray(raw) ? raw : String(raw).split(/[\n,]/);
  const hostnames = [...new Set(list.map((item) => parseHostname(String(item))))];
  if (!hostnames.length) throw new TenantStoreError(400, "At least one hostname is required");
  return hostnames;
}

export function parseHexColor(raw: string, label: string) {
  const value = raw.trim();
  if (!HEX_RE.test(value)) throw new TenantStoreError(400, `${label} must be a hex color`);
  return value.toLowerCase();
}

export function cloneSourceConfig(source: LeagueSourceConfig): LeagueSourceConfig {
  return {
    ...source,
    statsListTokens: [...source.statsListTokens],
    excludeStatsSlugs: [...source.excludeStatsSlugs],
    standings: {
      ...source.standings,
      modern: [...source.standings.modern],
      legacy: [...source.standings.legacy]
    },
    modernTeamSlugs: [...source.modernTeamSlugs],
    franchiseTeamNames: [...source.franchiseTeamNames],
    sportspress: source.sportspress
      ? {
          ...source.sportspress,
          seasons: source.sportspress.seasons?.map((slice) => ({ ...slice })),
          excludeTeamNamePatterns: source.sportspress.excludeTeamNamePatterns
            ? [...source.sportspress.excludeTeamNamePatterns]
            : undefined
        }
      : undefined
  };
}

export function cloneLeague(league: League): League {
  return {
    ...league,
    hostnames: [...league.hostnames],
    branding: { ...league.branding },
    copy: { ...league.copy },
    source: cloneSourceConfig(league.source),
    fixture: league.fixture ? structuredClone(league.fixture) : undefined
  };
}

export function applyTenantRecord(base: League, record: TenantRecord, builtIn: boolean): League {
  const next = cloneLeague(base);
  if (record.name?.trim()) next.name = record.name.trim();
  if (record.shortName?.trim()) next.shortName = record.shortName.trim();
  if (record.publicSeason?.trim()) next.publicSeason = record.publicSeason.trim();
  if (record.hostnames?.length) next.hostnames = record.hostnames.map((item) => parseHostname(item));
  if (record.branding) {
    if (record.branding.logo != null) next.branding.logo = String(record.branding.logo).trim();
    if (record.branding.logoAlt != null) next.branding.logoAlt = String(record.branding.logoAlt).trim();
    if (record.branding.primaryColor != null) {
      next.branding.primaryColor = parseHexColor(record.branding.primaryColor, "Primary color");
    }
    if (record.branding.secondaryColor != null) {
      next.branding.secondaryColor = parseHexColor(record.branding.secondaryColor, "Secondary color");
    }
  }
  if (record.copy) {
    next.copy = { ...next.copy, ...sanitizeCopy(record.copy) };
  }
  if (!builtIn && record.franchiseTeamNames) {
    const teams = record.franchiseTeamNames.map((name) => String(name).trim()).filter(Boolean);
    next.source.franchiseTeamNames = teams;
    next.source.modernTeamSlugs = teams.map((name) =>
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    );
    if (next.fixture) next.fixture.standings = next.fixture.standings.length ? next.fixture.standings : [];
  }
  if (!builtIn && record.fixture) next.fixture = structuredClone(record.fixture);
  if (!builtIn && record.adapter) next.adapter = record.adapter;
  if (!builtIn && record.sport?.trim()) next.sport = record.sport.trim();
  if (!builtIn && record.sportIcon) next.sportIcon = record.sportIcon;
  if (!builtIn && record.source) next.source = cloneSourceConfig(record.source);
  return next;
}

function sanitizeCopy(copy: Partial<LeagueCopy>): Partial<LeagueCopy> {
  const next: Partial<LeagueCopy> = {};
  for (const key of [
    "documentTitle",
    "tagline",
    "loadErrorTitle",
    "profileLinkLabel",
    "recapLinkLabel",
    "htmlSourceLabel"
  ] as const) {
    if (copy[key] != null) next[key] = String(copy[key]).trim();
  }
  return next;
}

export function readTenantRecords(): TenantRecord[] {
  const dir = tenantsDir();
  if (!fs.existsSync(dir)) return [];
  const records: TenantRecord[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(dir, name);
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as TenantRecord;
      if (!parsed?.slug || !isValidSlug(parsed.slug)) continue;
      if (parsed.kind !== "overlay" && parsed.kind !== "created") continue;
      records.push(parsed);
    } catch {
      /* skip unreadable tenant files */
    }
  }
  return records;
}

export function readTenantRecord(slug: string): TenantRecord | undefined {
  const file = path.join(tenantsDir(), `${slug}.json`);
  if (!fs.existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as TenantRecord;
    if (parsed?.slug !== slug) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeTenantRecord(record: TenantRecord) {
  if (!isValidSlug(record.slug)) throw new TenantStoreError(400, "Invalid slug");
  const dir = tenantsDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.slug}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

export function mergeTenantRecord(slug: string, kind: TenantRecordKind, patch: Omit<TenantRecord, "kind" | "slug">) {
  const existing = readTenantRecord(slug);
  const record: TenantRecord = {
    kind: existing?.kind ?? kind,
    slug,
    name: patch.name ?? existing?.name,
    shortName: patch.shortName ?? existing?.shortName,
    hostnames: patch.hostnames ?? existing?.hostnames,
    branding: { ...existing?.branding, ...patch.branding },
    copy: { ...existing?.copy, ...patch.copy },
    publicSeason: patch.publicSeason ?? existing?.publicSeason,
    franchiseTeamNames: patch.franchiseTeamNames ?? existing?.franchiseTeamNames,
    fixture: patch.fixture ?? existing?.fixture,
    adapter: patch.adapter ?? existing?.adapter,
    sport: patch.sport ?? existing?.sport,
    sportIcon: patch.sportIcon ?? existing?.sportIcon,
    source: patch.source ?? existing?.source
  };
  writeTenantRecord(record);
  return record;
}
