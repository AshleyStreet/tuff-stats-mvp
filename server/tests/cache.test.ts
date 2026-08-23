import { listFingerprint } from "../src/lib/cache.js";

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
