import { listFingerprint, cacheFileName, cacheReadCandidates, leagueCacheRelPath, sanitizeLeagueId } from "../src/lib/cache.js";
import path from "node:path";

describe("listFingerprint", () => {
  it("joins id and modified_gmt in sorted order", () => {
    const fingerprint = listFingerprint([
      { id: 2, modified_gmt: "2026-01-02T00:00:00" },
      { id: 1, modified_gmt: "2026-01-01T00:00:00" }
    ]);
    expect(fingerprint).toBe("1:2026-01-01T00:00:00|2:2026-01-02T00:00:00");
  });

  it("prefers modified_gmt over modified", () => {
    expect(
      listFingerprint([{ id: 9, modified: "local", modified_gmt: "gmt" }])
    ).toBe("9:gmt");
  });

  it("falls back to slug when id is missing", () => {
    expect(listFingerprint([{ slug: "2026-tuff-stats", modified: "x" }])).toBe("2026-tuff-stats:x");
  });

  it("changes when any list modification changes", () => {
    const before = listFingerprint([
      { id: 1, modified_gmt: "a" },
      { id: 2, modified_gmt: "b" }
    ]);
    const after = listFingerprint([
      { id: 1, modified_gmt: "a" },
      { id: 2, modified_gmt: "c" }
    ]);
    expect(before).not.toBe(after);
  });
});

describe("tenant-scoped cache paths", () => {
  it("places files under the league id", () => {
    expect(leagueCacheRelPath("tuff", "season-2026.json")).toBe(path.join("tuff", "season-2026.json"));
    expect(sanitizeLeagueId("TUFF")).toBe("tuff");
  });

  it("rejects path-like cache names", () => {
    expect(() => cacheFileName("../secret.json")).toThrow(/Invalid cache name/);
    expect(() => cacheFileName("tuff/season-2026.json")).toThrow(/Invalid cache name/);
  });

  it("falls back to the root file for TUFF only", () => {
    expect(cacheReadCandidates("tuff", "season-2026.json")).toEqual([
      path.join("tuff", "season-2026.json"),
      "season-2026.json"
    ]);
    expect(cacheReadCandidates("demo", "season-2026.json")).toEqual([path.join("demo", "season-2026.json")]);
  });

  it("maps unsafe league ids onto tuff", () => {
    expect(sanitizeLeagueId("../etc")).toBe("tuff");
    expect(sanitizeLeagueId("demo-league")).toBe("demo-league");
  });
});
