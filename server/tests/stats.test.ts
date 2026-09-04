import { tuffLeague } from "../src/leagues/tuff.js";
import {
  buildPlayer,
  canonicalTeamName,
  chunk,
  decodeEntities,
  emptyStats,
  hydrateStats,
  isStatsList,
  slugify,
  statsFromRow,
  teamNameFromRosterTitle,
  toNumber,
  yearFromStatsList
} from "../src/lib/stats.js";

describe("toNumber", () => {
  it("parses plain numbers", () => {
    expect(toNumber(12)).toBe(12);
    expect(toNumber("7")).toBe(7);
  });

  it("strips non-numeric characters", () => {
    expect(toNumber("12pts")).toBe(12);
    expect(toNumber(" 3.5 ")).toBe(3.5);
  });

  it("returns 0 for invalid values", () => {
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber("abc")).toBe(0);
  });
});

describe("slugify", () => {
  it("normalizes player names", () => {
    expect(slugify("Dave S.")).toBe("dave-s");
    expect(slugify("José P.")).toBe("jose-p");
  });
});

describe("decodeEntities", () => {
  it("decodes HTML entities", () => {
    expect(decodeEntities("O&#8217;Grady&#8217;s Bears")).toBe("O\u2019Grady\u2019s Bears");
  });
});

describe("chunk", () => {
  it("splits arrays into fixed-size groups", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("isStatsList", () => {
  it("accepts TUFF and TGFL season stats lists", () => {
    expect(isStatsList({ slug: "2025-tuff-stats" })).toBe(true);
    expect(isStatsList({ slug: "2021-tgfl-stats" })).toBe(true);
    expect(isStatsList({ slug: "misc", title: { rendered: "2024 TUFF Stats" } })).toBe(true);
  });

  it("rejects roster lists and the old catch-all list", () => {
    expect(isStatsList({ slug: "2025-sirens" })).toBe(false);
    expect(isStatsList({ slug: "tuff-stats-old" })).toBe(false);
  });

  it("uses source config tokens when provided", () => {
    const source = {
      ...tuffLeague.source,
      statsListTokens: ["demo"],
      excludeStatsSlugs: ["demo-stats-old"]
    };
    expect(isStatsList({ slug: "2026-demo-stats" }, source)).toBe(true);
    expect(isStatsList({ slug: "2026-tuff-stats" }, source)).toBe(false);
    expect(isStatsList({ slug: "demo-stats-old" }, source)).toBe(false);
  });
});

describe("yearFromStatsList", () => {
  it("reads the year from the slug first", () => {
    expect(yearFromStatsList({ slug: "2023-tuff-stats" })).toBe("2023");
  });

  it("falls back to the title when needed", () => {
    expect(yearFromStatsList({ slug: "legacy-stats", title: { rendered: "2019 TGFL Stats" } })).toBe("2019");
  });
});

describe("statsFromRow", () => {
  it("maps SportsPress abbreviations into normalized stats", () => {
    const stats = statsFromRow({
      gp: "10",
      rectd: "4",
      rec: "22",
      tpqb: "12",
      tpnqb: "30",
      paonept: "1",
      sty: "2"
    });

    expect(stats.gms).toBe(10);
    expect(stats.recTD).toBe(4);
    expect(stats.rec).toBe(22);
    expect(stats.tpqb).toBe(12);
    expect(stats.tpnqb).toBe(30);
    expect(stats.pa1PT).toBe(1);
    expect(stats.safety).toBe(2);
  });

  it("maps SportsPress attempts onto deflags", () => {
    expect(statsFromRow({ att: "11" }).deflag).toBe(11);
    expect(statsFromRow({ attempts: "7" }).deflag).toBe(7);
    expect(hydrateStats({ att: 4 } as never).deflag).toBe(4);
  });

  it("starts from empty stats for missing fields", () => {
    expect(statsFromRow({}).gms).toBe(0);
    expect(emptyStats().recTD).toBe(0);
    expect(emptyStats().hr).toBe(0);
  });

  it("maps softball batting abbreviations", () => {
    expect(statsFromRow({ ab: "12", r: "3", h: "5", hr: "1", rbi: "4", bb: "2", so: "1", sb: "1" })).toMatchObject({
      ab: 12,
      r: 3,
      h: 5,
      hr: 1,
      rbi: 4,
      bb: 2,
      so: 1,
      sb: 1
    });
  });

  it("maps soccer goal and card abbreviations", () => {
    expect(
      statsFromRow({ appearances: "9", buts: "13", cartonsjaunes: "1", cartonsrouges: "0" })
    ).toMatchObject({
      gms: 9,
      goals: 13,
      yellowCards: 1,
      redCards: 0
    });
  });

  it("ignores a tenant statMap when a row has no matching fields", () => {
    const source = { ...tuffLeague.source, statMap: { xyz: "goals" as const } };
    expect(statsFromRow({ gp: "5" }, source).gms).toBe(5);
  });

  it("lets a tenant statMap add a raw field the shared default doesn't know", () => {
    const source = { ...tuffLeague.source, statMap: { marques: "goals" as const } };
    expect(statsFromRow({ marques: "3" }, source).goals).toBe(3);
    expect(statsFromRow({ marques: "3" }).goals).toBe(0);
  });

  it("lets a tenant statMap override where the shared default sends a field", () => {
    const source = { ...tuffLeague.source, statMap: { rec: "goals" as const } };
    expect(statsFromRow({ rec: "9" }, source)).toMatchObject({ rec: 0, goals: 9 });
    expect(statsFromRow({ rec: "9" })).toMatchObject({ rec: 9, goals: 0 });
  });
});

describe("buildPlayer", () => {
  it("derives non-QB points from receiving TDs and receiving conversions", () => {
    const stats = emptyStats();
    stats.gms = 8;
    stats.rec = 16;
    stats.recTD = 4;
    stats.re1PT = 2;
    stats.re2PT = 1;
    stats.paTD = 1;
    stats.tpqb = 10;
    stats.tpnqb = 999; // ignored — recalculated

    const player = buildPlayer("Dave S.", stats, { sourceId: "7588", team: "Wildcats" });

    expect(player.id).toBe("dave-s-7588");
    expect(player.team).toBe("Wildcats");
    expect(player.stats.tpnqb).toBe(4 * 6 + 2 + 1 * 2); // 28
    expect(player.derived.totalTouchdowns).toBe(5);
    expect(player.derived.totalPoints).toBe(28 + 10);
    expect(player.derived.receptionsPerGame).toBe(2);
    expect(player.derived.receivingTouchdownsPerGame).toBe(0.5);
  });

  it("keeps two identically named players distinct", () => {
    const stats = emptyStats();
    const a = buildPlayer("Dave S.", stats, { sourceId: "7588" });
    const b = buildPlayer("Dave S.", stats, { sourceId: "7598" });
    expect(a.id).not.toBe(b.id);
  });
});

describe("teamNameFromRosterTitle", () => {
  it("strips the season year from roster titles", () => {
    expect(teamNameFromRosterTitle("2025 Sirens", "2025")).toBe("Sirens");
    expect(teamNameFromRosterTitle("2019 Woody&#8217;s Wildcats", "2019")).toBe("Woody\u2019s Wildcats");
  });

  it("title-cases slug-style names", () => {
    expect(teamNameFromRosterTitle("2024-wolfhounds", "2024")).toBe("Wolfhounds");
  });
});

describe("canonicalTeamName", () => {
  it("maps sponsor-prefixed roster titles onto standings nicknames", () => {
    expect(canonicalTeamName("Woody’s Wildcats")).toBe("Wildcats");
    expect(canonicalTeamName("The Drink Wolfhounds")).toBe("Wolfhounds");
    expect(canonicalTeamName("The Storm Crows")).toBe("Storm Crows");
    expect(canonicalTeamName("Blake House Brawlers")).toBe("Brawlers");
    expect(canonicalTeamName("Fox & Fiddle Menace")).toBe("Menace");
    expect(canonicalTeamName("Pegasus Stallions")).toBe("Stallions");
  });

  it("keeps names that already match standings", () => {
    expect(canonicalTeamName("Cobras")).toBe("Cobras");
    expect(canonicalTeamName("  sirens  ")).toBe("Sirens");
  });

  it("prefers the longest alias and leaves unknown names alone", () => {
    expect(canonicalTeamName("Hair of The Dog Terriers")).toBe("Hair of The Dog Terriers");
    expect(
      canonicalTeamName("The Storm Crows", ["Crows", "Storm Crows", "Wildcats"])
    ).toBe("Storm Crows");
  });
});
