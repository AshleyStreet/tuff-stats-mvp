import { parseStandingsTable, standingsSlugCandidates } from "../src/lib/standings.js";

describe("standingsSlugCandidates", () => {
  it("prefers tuff slugs for modern seasons", () => {
    expect(standingsSlugCandidates("2026")[0]).toBe("2026-tuff-standings");
  });

  it("prefers tgfl slugs for older seasons", () => {
    expect(standingsSlugCandidates("2019")[0]).toBe("2019-tgfl-standings");
  });
});

describe("parseStandingsTable", () => {
  it("parses wins losses ties and strips streak html", () => {
    const rows = parseStandingsTable({
      "0": { name: "Team", w: "W", l: "L" },
      "111": {
        name: "Cobras",
        pos: 1,
        w: "8",
        l: "2",
        t: "0",
        pct: "0.800",
        pf: "263",
        pa: "192",
        netpts: "71",
        sp: "52",
        streak: '<span style="color:#888">W3</span>'
      }
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Cobras",
      wins: 8,
      losses: 2,
      ties: 0,
      streak: "W3",
      standingsPoints: 52
    });
  });
});
