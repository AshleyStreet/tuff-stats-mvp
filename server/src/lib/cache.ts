import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = path.resolve(process.env.CACHE_DIR || path.join(__dirname, "../../.cache"));

const LEAGUE_ID_RE = /^[a-z0-9-]+$/;

export type CacheEnvelope<T> = {
  fingerprint: string;
  savedAt: string;
  payload: T;
};

export function listFingerprint(
  lists: Array<{ id?: number; slug?: string; modified?: string; modified_gmt?: string }>
): string {
  return lists
    .map((list) => `${list.id ?? list.slug ?? ""}:${list.modified_gmt ?? list.modified ?? ""}`)
    .sort()
    .join("|");
}

/** Cache file names are basename-only so a league id cannot escape CACHE_DIR. */
export function cacheFileName(name: string): string {
  const base = path.basename(name);
  if (!base || base !== name) {
    throw new Error(`Invalid cache name: ${name}`);
  }
  return base;
}

export function sanitizeLeagueId(leagueId: string): string {
  const id = leagueId.trim().toLowerCase();
  return LEAGUE_ID_RE.test(id) ? id : "tuff";
}

export function leagueCacheRelPath(leagueId: string, name: string): string {
  return path.join(sanitizeLeagueId(leagueId), cacheFileName(name));
}

/**
 * Tenant-scoped file first. For TUFF only, also try the pre-namespaced
 * root file so production does not cold-scrape on first boot after this change.
 */
export function cacheReadCandidates(leagueId: string, name: string): string[] {
  const file = cacheFileName(name);
  const scoped = leagueCacheRelPath(leagueId, file);
  if (sanitizeLeagueId(leagueId) === "tuff") return [scoped, file];
  return [scoped];
}

export function ensureCacheDir(leagueId?: string) {
  const dir = leagueId ? path.join(CACHE_DIR, sanitizeLeagueId(leagueId)) : CACHE_DIR;
  fs.mkdirSync(dir, { recursive: true });
}

export function readCacheFile<T>(name: string): CacheEnvelope<T> | null {
  try {
    const file = path.join(CACHE_DIR, cacheFileName(name));
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

export function writeCacheFile<T>(name: string, fingerprint: string, payload: T) {
  ensureCacheDir();
  const envelope: CacheEnvelope<T> = {
    fingerprint,
    savedAt: new Date().toISOString(),
    payload
  };
  fs.writeFileSync(path.join(CACHE_DIR, cacheFileName(name)), JSON.stringify(envelope));
}

export function readLeagueCache<T>(leagueId: string, name: string): CacheEnvelope<T> | null {
  for (const rel of cacheReadCandidates(leagueId, name)) {
    try {
      const file = path.join(CACHE_DIR, rel);
      if (!fs.existsSync(file)) continue;
      return JSON.parse(fs.readFileSync(file, "utf8")) as CacheEnvelope<T>;
    } catch {
      continue;
    }
  }
  return null;
}

export function writeLeagueCache<T>(leagueId: string, name: string, fingerprint: string, payload: T) {
  const id = sanitizeLeagueId(leagueId);
  ensureCacheDir(id);
  const envelope: CacheEnvelope<T> = {
    fingerprint,
    savedAt: new Date().toISOString(),
    payload
  };
  fs.writeFileSync(path.join(CACHE_DIR, leagueCacheRelPath(id, name)), JSON.stringify(envelope));
}
