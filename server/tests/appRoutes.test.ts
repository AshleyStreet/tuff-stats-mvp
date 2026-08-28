import { buildAppPath, parseAppRoute, resolveTeamName, slugifyTeam } from "../src/lib/appRoutes.js";

describe("appRoutes", () => {
  it("parses tab and season from path and query", () => {
    expect(parseAppRoute("/players", "?season=2026")).toEqual({ tab: "players", season: "2026" });
    expect(parseAppRoute("/teams/wildcats", "?season=2025")).toEqual({
      tab: "teams",
      teamSlug: "wildcats",
      season: "2025"
    });
    expect(parseAppRoute("/players/dave-s-7588", "")).toEqual({
      tab: "players",
      playerId: "dave-s-7588"
    });
    expect(parseAppRoute("/schedule/7550", "?season=2026")).toEqual({
      tab: "schedule",
      gameId: 7550,
      season: "2026"
    });
  });

  it("builds shareable paths", () => {
    expect(buildAppPath({ tab: "players", season: "2026" })).toBe("/players?season=2026");
    expect(buildAppPath({ tab: "teams", teamSlug: "wildcats", season: "2026" })).toBe(
      "/teams/wildcats?season=2026"
    );
    expect(buildAppPath({ tab: "schedule", gameId: 7550, season: "2026" })).toBe(
      "/schedule/7550?season=2026"
    );
  });

  it("resolves team slugs to display names", () => {
    expect(resolveTeamName("wildcats", ["Wildcats", "Cobras"])).toBe("Wildcats");
    expect(slugifyTeam("Storm Crows")).toBe("storm-crows");
  });
});
