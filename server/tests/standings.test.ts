import { parseStandingsTable, standingsSlugCandidates, standingsTableSlugs } from "../src/lib/standings.js";
import { bushLeague } from "../src/leagues/bush.js";

describe("standingsSlugCandidates", () => {
  it("prefers tuff slugs for modern seasons", () => {
    expect(standingsSlugCandidates("2026")[0]).toBe("2026-tuff-standings");
  });

  it("prefers tgfl slugs for older seasons", () => {
    expect(standingsSlugCandidates("2019")[0]).toBe("2019-tgfl-standings");
  });
});

describe("standingsTableSlugs", () => {
  it("uses the bush template slug", () => {
    expect(standingsTableSlugs("2026", bushLeague.source)).toEqual(["bush-league-2026", "2026"]);
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

  it("parses softball aliases tie rs ra diff points strk", () => {
    const rows = parseStandingsTable({
      "0": { name: "Team", w: "W", l: "L", tie: "T" },
      "63": {
        name: "Diamond Dogs",
        pos: 1,
        w: "12",
        l: "2",
        tie: "0",
        points: "24",
        pct: "0.857",
        rs: "246",
        ra: "169",
        diff: "77",
        strk: " W2</span>"
      }
    });

    expect(rows[0]).toMatchObject({
      name: "Diamond Dogs",
      wins: 12,
      losses: 2,
      ties: 0,
      pointsFor: 246,
      pointsAgainst: 169,
      netPoints: 77,
      standingsPoints: 24,
      streak: "W2"
    });
  });

  it("parses soccer aliases d f a gd pts", () => {
    const rows = parseStandingsTable({
      "0": { name: "Équipe", w: "V", d: "N", l: "D" },
      "27416": {
        name: "TITANS FC",
        pos: 1,
        w: "6",
        d: "1",
        l: "2",
        f: "54",
        a: "40",
        gd: "14",
        pts: "31"
      }
    });

    expect(rows[0]).toMatchObject({
      name: "TITANS FC",
      wins: 6,
      ties: 1,
      losses: 2,
      pointsFor: 54,
      pointsAgainst: 40,
      netPoints: 14,
      standingsPoints: 31
    });
  });
});
