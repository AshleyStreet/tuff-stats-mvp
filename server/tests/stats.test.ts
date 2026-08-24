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
  });
});

describe("buildPlayer", () => {
  it("builds derived totals and a unique id with sourceId", () => {
    const stats = emptyStats();
    stats.gms = 8;
    stats.rec = 16;
    stats.recTD = 4;
    stats.paTD = 1;
    stats.tpqb = 10;
    stats.tpnqb = 24;

    const player = buildPlayer("Dave S.", stats, { sourceId: "7588", team: "Wildcats" });

    expect(player.id).toBe("dave-s-7588");
    expect(player.team).toBe("Wildcats");
    expect(player.derived.totalTouchdowns).toBe(5);
    expect(player.derived.totalPoints).toBe(34);
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
