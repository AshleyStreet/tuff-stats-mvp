import { readLeagueCache, writeLeagueCache, type CacheEnvelope } from "./cache.js";

/**
 * How long a snapshot is served before upstream is asked again. Past this a
 * read still answers from the snapshot immediately and revalidates behind it,
 * so a visitor never waits on a league's website unless there is no snapshot
 * at all. CACHE_TTL_MS overrides it (the TUFF adapter reads the same variable).
 */
export const REVALIDATE_TTL_MS = Math.max(0, Number(process.env.CACHE_TTL_MS ?? 300_000));

export type Snapshot<V> = {
  value: V;
  fingerprint: string;
  /** Epoch ms the value was last confirmed against upstream. */
  at: number;
};

export type SnapshotReadOpts = {
  /** Bypass the snapshot and wait for a fresh load. Admin refresh only. */
  force?: boolean;
  /** Answer from any snapshot without scheduling a revalidation. */
  preferCache?: boolean;
  /** Never touch upstream — undefined on a miss. For the HTML bootstrap. */
  cacheOnly?: boolean;
};

export type SnapshotLoadContext<V> = {
  previous: Snapshot<V> | undefined;
  force: boolean;
};

/**
 * Return `previous.value` (same reference) to confirm an unchanged snapshot
 * without rewriting it; return null when upstream had nothing usable, which
 * keeps the previous snapshot.
 */
export type SnapshotLoader<V> = (
  key: string,
  context: SnapshotLoadContext<V>
) => Promise<{ value: V; fingerprint: string } | null>;

export type SnapshotPersistence<V> = {
  read(key: string): CacheEnvelope<V> | null;
  write(key: string, fingerprint: string, value: V): void;
};

/** Stores each key as one tenant-scoped file under CACHE_DIR/<leagueId>/. */
export function leagueFilePersistence<V>(leagueId: string, fileName: (key: string) => string): SnapshotPersistence<V> {
  return {
    read: (key) => readLeagueCache<V>(leagueId, fileName(key)),
    write: (key, fingerprint, value) => writeLeagueCache(leagueId, fileName(key), fingerprint, value)
  };
}

export type SnapshotRevalidation<V> = {
  value: V | undefined;
  /** False when upstream gave nothing usable and the previous snapshot stands. */
  fresh: boolean;
};

export type SnapshotCache<V> = {
  get(key: string, opts?: SnapshotReadOpts): Promise<V | undefined>;
  /**
   * Load now and report whether it produced new data. Shares a load already
   * running for this key unless `force` is set.
   */
  revalidate(key: string, opts?: { force?: boolean }): Promise<SnapshotRevalidation<V>>;
  /** Memory, then disk. Synchronous and never touches upstream. */
  peek(key: string): Snapshot<V> | undefined;
  snapshots(): Array<[string, Snapshot<V>]>;
};

/**
 * Memory + disk snapshots for one adapter resource (a season's players, its
 * standings, …), with stale-while-revalidate reads and one in-flight load per
 * key, so a burst of visitors to a cold or stale page costs one upstream fetch.
 */
export function createSnapshotCache<V>(options: {
  load: SnapshotLoader<V>;
  persist?: SnapshotPersistence<V>;
  /** Snapshots failing this are treated as absent (e.g. an empty table). */
  usable?: (value: V) => boolean;
  ttlMs?: number;
}): SnapshotCache<V> {
  const { load, persist } = options;
  const usable = options.usable ?? (() => true);
  const ttlMs = options.ttlMs ?? REVALIDATE_TTL_MS;
  const entries = new Map<string, Snapshot<V>>();
  const inflight = new Map<string, Promise<{ snapshot: Snapshot<V> | undefined; fresh: boolean }>>();

  function peek(key: string): Snapshot<V> | undefined {
    const memory = entries.get(key);
    if (memory) return memory;
    const disk = persist?.read(key);
    if (!disk?.payload || !usable(disk.payload)) return undefined;
    const savedAt = Date.parse(disk.savedAt);
    const entry = { value: disk.payload, fingerprint: disk.fingerprint, at: Number.isFinite(savedAt) ? savedAt : 0 };
    entries.set(key, entry);
    return entry;
  }

  function refresh(key: string, force: boolean) {
    const pending = inflight.get(key);
    if (pending && !force) return pending;

    const run = (async () => {
      const previous = peek(key);
      let result: Awaited<ReturnType<SnapshotLoader<V>>>;
      try {
        result = await load(key, { previous, force });
      } catch (error) {
        // Upstream is down: the last good snapshot beats an error page.
        if (previous) return { snapshot: previous, fresh: false };
        throw error;
      }
      if (!result || !usable(result.value)) return { snapshot: previous, fresh: false };

      const entry = { value: result.value, fingerprint: result.fingerprint, at: Date.now() };
      entries.set(key, entry);
      if (result.value !== previous?.value) persist?.write(key, result.fingerprint, result.value);
      return { snapshot: entry, fresh: true };
    })().finally(() => {
      if (inflight.get(key) === run) inflight.delete(key);
    });

    inflight.set(key, run);
    return run;
  }

  return {
    async get(key, opts = {}) {
      if (opts.force) return (await refresh(key, true)).snapshot?.value;
      const cached = peek(key);
      if (cached) {
        if (!opts.preferCache && !opts.cacheOnly && Date.now() - cached.at >= ttlMs) {
          void refresh(key, false).catch(() => undefined);
        }
        return cached.value;
      }
      if (opts.cacheOnly) return undefined;
      return (await refresh(key, false)).snapshot?.value;
    },
    async revalidate(key, opts = {}) {
      const { snapshot, fresh } = await refresh(key, Boolean(opts.force));
      return { value: snapshot?.value, fresh };
    },
    peek,
    snapshots() {
      return [...entries.entries()];
    }
  };
}
