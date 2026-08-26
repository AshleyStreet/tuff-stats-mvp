import { filterAndSortPlayers } from "../src/lib/query.js";
import { buildPlayer, emptyStats } from "../src/lib/stats.js";
import type { Player } from "../src/types.js";

function player(name: string, opts: { team?: string; points?: number; recTD?: number; sourceId: string }): Player {
  const stats = emptyStats();
  stats.recTD = opts.recTD ?? 0;
  // buildPlayer derives tpnqb from recTD + conversions; pad with 1-pt receiving to hit `points`
  const fromTd = stats.recTD * 6;
  stats.re1PT = Math.max(0, (opts.points ?? 0) - fromTd);
  return buildPlayer(name, stats, { team: opts.team, sourceId: opts.sourceId });
}

const sample: Player[] = [
  player("Ben L.", { team: "Wolfhounds", points: 50, recTD: 3, sourceId: "1" }),
  player("Eric H.", { team: "Menace", points: 80, recTD: 1, sourceId: "2" }),
  player("Colin H.", { team: "Sirens", points: 65, recTD: 5, sourceId: "3" }),
  player("Ashley S.", { team: "Menace", points: 20, recTD: 2, sourceId: "4" })
];

describe("filterAndSortPlayers", () => {
  it("sorts by total points descending by default", () => {
    const result = filterAndSortPlayers(sample);
    expect(result.map((p) => p.name)).toEqual(["Eric H.", "Colin H.", "Ben L.", "Ashley S."]);
  });

  it("filters by team", () => {
    const result = filterAndSortPlayers(sample, { team: "Menace" });
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.team === "Menace")).toBe(true);
  });

  it("filters by search text", () => {
    const result = filterAndSortPlayers(sample, { search: "colin" });
    expect(result.map((p) => p.name)).toEqual(["Colin H."]);
  });

  it("combines team filter with an alternate sort", () => {
    const result = filterAndSortPlayers(sample, { team: "Menace", sort: "recTD", order: "desc" });
    expect(result.map((p) => p.name)).toEqual(["Ashley S.", "Eric H."]);
  });

  it("supports ascending order", () => {
    const result = filterAndSortPlayers(sample, { sort: "totalPoints", order: "asc" });
    expect(result[0].name).toBe("Ashley S.");
    expect(result.at(-1)?.name).toBe("Eric H.");
  });

  it("does not mutate the original array", () => {
    const original = [...sample];
    filterAndSortPlayers(sample, { team: "Sirens", sort: "recTD" });
    expect(sample).toEqual(original);
  });
});
