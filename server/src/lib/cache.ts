import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = path.resolve(__dirname, "../../.cache");

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

export function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function readCacheFile<T>(name: string): CacheEnvelope<T> | null {
  try {
    const file = path.join(CACHE_DIR, name);
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
  fs.writeFileSync(path.join(CACHE_DIR, name), JSON.stringify(envelope));
}
