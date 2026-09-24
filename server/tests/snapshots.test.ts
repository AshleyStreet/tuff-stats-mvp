import { jest } from "@jest/globals";
import type { CacheEnvelope } from "../src/lib/cache.js";
import { createSnapshotCache, type SnapshotLoader, type SnapshotPersistence } from "../src/lib/snapshots.js";

function memoryPersistence<V>(initial: Record<string, CacheEnvelope<V>> = {}) {
  const files = new Map(Object.entries(initial));
  const writes: string[] = [];
  const persist: SnapshotPersistence<V> = {
    read: (key) => files.get(key) ?? null,
    write(key, fingerprint, value) {
      writes.push(key);
      files.set(key, { fingerprint, savedAt: new Date().toISOString(), payload: value });
    }
  };
  return { persist, writes };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets a background revalidation started by get() run to completion. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("createSnapshotCache", () => {
  it("shares one upstream load between concurrent cold reads", async () => {
    const gate = deferred<{ value: string; fingerprint: string }>();
    const load = jest.fn<SnapshotLoader<string>>(() => gate.promise);
    const cache = createSnapshotCache<string>({ load });

    const reads = Promise.all([cache.get("2026"), cache.get("2026"), cache.get("2026")]);
    gate.resolve({ value: "board", fingerprint: "v1" });

    expect(await reads).toEqual(["board", "board", "board"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("serves a fresh snapshot without asking upstream", async () => {
    const load = jest.fn(async () => ({ value: "board", fingerprint: "v1" }));
    const cache = createSnapshotCache<string>({ load, ttlMs: 60_000 });

    await cache.get("2026");
    await cache.get("2026");
    await cache.get("2026");

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("answers a stale read from the snapshot and revalidates once behind it", async () => {
    let version = 1;
    const load = jest.fn(async () => ({ value: `board-v${version}`, fingerprint: `v${version}` }));
    const cache = createSnapshotCache<string>({ load, ttlMs: 0 });

    expect(await cache.get("2026")).toBe("board-v1");
    version = 2;

    // Stale: both reads answer immediately with v1, and share one background load.
    expect(await Promise.all([cache.get("2026"), cache.get("2026")])).toEqual(["board-v1", "board-v1"]);
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.peek("2026")?.value).toBe("board-v2");
  });

  it("keeps the last good snapshot when upstream fails or returns nothing", async () => {
    const load = jest
      .fn<SnapshotLoader<string>>()
      .mockResolvedValueOnce({ value: "board", fingerprint: "v1" })
      .mockRejectedValueOnce(new Error("upstream down"))
      .mockResolvedValueOnce(null);
    const cache = createSnapshotCache<string>({ load });

    await cache.get("2026");
    expect(await cache.get("2026", { force: true })).toBe("board");
    expect(await cache.get("2026", { force: true })).toBe("board");
  });

  it("reports whether a revalidation produced new data", async () => {
    const load = jest
      .fn<SnapshotLoader<string>>()
      .mockResolvedValueOnce({ value: "board", fingerprint: "v1" })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("upstream down"));
    const cache = createSnapshotCache<string>({ load });

    expect(await cache.revalidate("2026")).toEqual({ value: "board", fresh: true });
    expect(await cache.revalidate("2026", { force: true })).toEqual({ value: "board", fresh: false });
    expect(await cache.revalidate("2026", { force: true })).toEqual({ value: "board", fresh: false });
  });

  it("surfaces the upstream error when there is no snapshot to fall back to", async () => {
    const cache = createSnapshotCache<string>({
      load: async () => {
        throw new Error("upstream down");
      }
    });
    await expect(cache.get("2026")).rejects.toThrow("upstream down");
  });

  it("treats unusable results as absent", async () => {
    const cache = createSnapshotCache<string[]>({
      load: async () => ({ value: [], fingerprint: "empty" }),
      usable: (rows) => rows.length > 0
    });
    expect(await cache.get("2026")).toBeUndefined();
    expect(cache.peek("2026")).toBeUndefined();
  });

  it("does not rewrite the file when upstream confirms the snapshot is unchanged", async () => {
    const { persist, writes } = memoryPersistence<string>();
    const cache = createSnapshotCache<string>({
      persist,
      ttlMs: 0,
      load: async (_key, { previous }) =>
        previous ? { value: previous.value, fingerprint: previous.fingerprint } : { value: "board", fingerprint: "v1" }
    });

    await cache.get("2026");
    const firstCheck = cache.peek("2026")!.at;
    await cache.revalidate("2026");

    expect(writes).toEqual(["2026"]);
    expect(cache.peek("2026")!.at).toBeGreaterThanOrEqual(firstCheck);
  });

  it("hydrates from disk and judges freshness by when the file was saved", async () => {
    const { persist } = memoryPersistence<string>({
      recent: { fingerprint: "d1", savedAt: new Date().toISOString(), payload: "recent board" },
      old: { fingerprint: "d2", savedAt: "2020-01-01T00:00:00.000Z", payload: "old board" }
    });
    const load = jest.fn(async () => ({ value: "live board", fingerprint: "v1" }));
    const cache = createSnapshotCache<string>({ persist, load, ttlMs: 60_000 });

    expect(await cache.get("recent")).toBe("recent board");
    await settle();
    expect(load).not.toHaveBeenCalled();

    expect(await cache.get("old")).toBe("old board");
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.peek("old")?.value).toBe("live board");
  });

  it("never touches upstream for cacheOnly, and preferCache skips revalidation", async () => {
    const { persist } = memoryPersistence<string>({
      old: { fingerprint: "d1", savedAt: "2020-01-01T00:00:00.000Z", payload: "old board" }
    });
    const load = jest.fn(async () => ({ value: "live board", fingerprint: "v1" }));
    const cache = createSnapshotCache<string>({ persist, load });

    expect(await cache.get("missing", { cacheOnly: true })).toBeUndefined();
    expect(await cache.get("old", { cacheOnly: true })).toBe("old board");
    expect(await cache.get("old", { preferCache: true })).toBe("old board");
    await settle();
    expect(load).not.toHaveBeenCalled();
  });

  it("force waits for a real load even when the snapshot is fresh", async () => {
    let version = 1;
    const load = jest.fn(async (_key: string, { force }: { force: boolean }) => ({
      value: `board-v${version}`,
      fingerprint: force ? "forced" : `v${version}`
    }));
    const cache = createSnapshotCache<string>({ load, ttlMs: 60_000 });

    await cache.get("2026");
    version = 2;
    expect(await cache.get("2026", { force: true })).toBe("board-v2");
    expect(load).toHaveBeenLastCalledWith("2026", expect.objectContaining({ force: true }));
  });
});
