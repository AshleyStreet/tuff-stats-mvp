import { careerFromSeasons, extractSourceId, sumStats } from "../src/lib/profile.js";
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
    expect(career.derived.totalPoints).toBe(50);
  });
});
