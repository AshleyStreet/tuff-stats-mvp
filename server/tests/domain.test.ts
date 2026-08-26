import { toLeagueRef, type PlayersResponse } from "../src/domain/types.js";
import { tuffLeague } from "../src/leagues/tuff.js";
import { buildPlayer, emptyStats } from "../src/lib/stats.js";

describe("domain PlayersResponse contract", () => {
  const stats = emptyStats();
  stats.gms = 8;
  stats.rec = 16;
  stats.recTD = 4;
  stats.tpqb = 10;
  stats.tpnqb = 24;

  const player = buildPlayer("Dave S.", stats, { sourceId: "7588", team: "Wildcats" });

  const payload: PlayersResponse = {
    players: [player],
    meta: {
      source: "sportspress",
      fetchedAt: "2026-08-25T00:00:00.000Z",
      total: 1,
      teams: ["Wildcats"],
      season: "2026",
      seasonLabel: "2026 Season",
      standings: [
        {
          name: "Wildcats",
          pos: 4,
          wins: 6,
          losses: 4,
          ties: 0,
          pct: 0.6,
          pointsFor: 225,
          pointsAgainst: 188,
          netPoints: 37,
          standingsPoints: 44,
          streak: "W1"
        }
      ],
      teamLogos: { Wildcats: "https://example.test/wildcats.png" },
      league: toLeagueRef(tuffLeague)
    }
  };

  it("keeps the current TUFF JSON field names", () => {
    expect(payload).toMatchSnapshot();
  });

  it("does not put SportsPress list/performance keys on the player", () => {
    expect(player).not.toHaveProperty("data");
    expect(player).not.toHaveProperty("performance");
    expect(player).not.toHaveProperty("featured_media");
    expect(Object.keys(player).sort()).toEqual(["derived", "id", "name", "profileUrl", "sourceId", "stats", "team"]);
  });
});
