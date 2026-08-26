import {
  canSoftLink,
  careerFromSeasons,
  collectCareerAppearances,
  extractSourceId,
  normalizePlayerName,
  sumStats
} from "../src/lib/profile.js";
import { buildPlayer, emptyStats } from "../src/lib/stats.js";

describe("extractSourceId", () => {
  it("reads the SportsPress id suffix", () => {
    expect(extractSourceId("skyler-d-7043")).toBe("7043");
    expect(extractSourceId("7043")).toBe("7043");
  });

  it("returns null when no id is present", () => {
    expect(extractSourceId("dave-s")).toBeNull();
  });
});

describe("normalizePlayerName", () => {
  it("ignores punctuation and case", () => {
    expect(normalizePlayerName("Colin H.")).toBe("colin h");
    expect(normalizePlayerName("  COLIN  H ")).toBe("colin h");
  });
});

describe("sumStats", () => {
  it("adds matching stat fields", () => {
    const a = emptyStats();
    const b = emptyStats();
    a.recTD = 4;
    a.gms = 8;
    b.recTD = 2;
    b.gms = 10;
    expect(sumStats(a, b)).toMatchObject({ recTD: 6, gms: 18 });
  });
});

describe("careerFromSeasons", () => {
  it("aggregates career totals across seasons", () => {
    const first = emptyStats();
    first.gms = 10;
    first.rec = 20;
    first.recTD = 5;
    first.tpnqb = 30;

    const second = emptyStats();
    second.gms = 8;
    second.rec = 12;
    second.recTD = 3;
    second.tpqb = 20;

    const career = careerFromSeasons("Skyler D.", [
      {
        season: "2026",
        team: "Menace",
        stats: first,
        derived: buildPlayer("Skyler D.", first).derived
      },
      {
        season: "2025",
        team: "Wildcats",
        stats: second,
        derived: buildPlayer("Skyler D.", second).derived
      }
    ], "7043");

    expect(career.id).toBe("skyler-d-7043");
    expect(career.stats.gms).toBe(18);
    expect(career.stats.rec).toBe(32);
    expect(career.derived.totalTouchdowns).toBe(8);
    // Non-QB = (5+3) recTD × 6; QB pts still summed from seasons → 48 + 20
    expect(career.stats.tpnqb).toBe(48);
    expect(career.derived.totalPoints).toBe(68);
  });
});

describe("canSoftLink", () => {
  it("links adjacent seasons on the same team", () => {
    expect(
      canSoftLink(
        { season: "2025", team: "Menace" },
        [{ season: "2026", team: "Menace" }]
      )
    ).toBe(true);
  });

  it("does not link different teams without jersey match", () => {
    expect(
      canSoftLink(
        { season: "2025", team: "Sirens" },
        [{ season: "2026", team: "Rhinos" }]
      )
    ).toBe(false);
  });

  it("links on matching jersey numbers", () => {
    expect(
      canSoftLink(
        { season: "2024", team: "Yetis", number: 7 },
        [{ season: "2026", team: "Rhinos" }],
        7
      )
    ).toBe(true);
  });
});

describe("collectCareerAppearances", () => {
  const stats = emptyStats();
  const derived = buildPlayer("Colin H.", stats).derived;

  it("keeps separate same-name players without continuity", () => {
    const { appearances, linkedSourceIds } = collectCareerAppearances(
      "4133",
      "Colin H.",
      [
        {
          season: "2026",
          sourceId: "4133",
          name: "Colin H.",
          team: "Rhinos",
          stats,
          derived
        },
        {
          season: "2025",
          sourceId: "7006",
          name: "Colin H.",
          team: "Sirens",
          stats,
          derived
        }
      ]
    );

    expect(appearances).toHaveLength(1);
    expect(appearances[0]?.season).toBe("2026");
    expect(linkedSourceIds).toEqual([]);
  });

  it("soft-links a reissued SportsPress id on the same team", () => {
    const { appearances, linkedSourceIds } = collectCareerAppearances(
      "100",
      "Alex R.",
      [
        {
          season: "2026",
          sourceId: "100",
          name: "Alex R.",
          team: "Menace",
          stats,
          derived
        },
        {
          season: "2025",
          sourceId: "99",
          name: "Alex R.",
          team: "Menace",
          stats,
          derived
        }
      ]
    );

    expect(appearances).toHaveLength(2);
    expect(linkedSourceIds).toEqual(["99"]);
    expect(appearances.find((row) => row.season === "2025")?.linked).toBe(true);
  });
});
