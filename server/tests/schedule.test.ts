import { hydrateScheduleGames, parseScheduleEvent, partitionSchedule } from "../src/lib/schedule.js";

describe("parseScheduleEvent", () => {
  const teams = new Map([
    [114, "Knights"],
    [120, "Rhinos"]
  ]);
  const venues = new Map([[272, "Cherry Beach West"]]);

  it("parses a final with main_results", () => {
    const game = parseScheduleEvent(
      {
        id: 7501,
        date: "2026-05-24T12:10:00",
        status: "publish",
        title: { rendered: "Knights vs Rhinos" },
        teams: [114, 120],
        venues: [272],
        main_results: ["13", "29"],
        results: {
          "114": { points: "13", outcome: ["loss"] },
          "120": { points: "29", outcome: ["win"] }
        }
      },
      teams,
      venues,
      Date.parse("2026-06-01T00:00:00")
    );

    expect(game).toMatchObject({
      status: "final",
      venue: "Cherry Beach West",
      teams: [
        { name: "Knights", score: 13, outcome: "loss" },
        { name: "Rhinos", score: 29, outcome: "win" }
      ]
    });
  });

  it("marks future games as upcoming", () => {
    const game = parseScheduleEvent(
      {
        id: 1,
        date: "2026-09-13T15:10:00",
        status: "future",
        title: { rendered: "Menace vs Sirens" },
        teams: [5250, 5251],
        main_results: [],
        results: { "5250": [], "5251": [] }
      },
      new Map([
        [5250, "Menace"],
        [5251, "Sirens"]
      ]),
      new Map(),
      Date.parse("2026-06-01T00:00:00")
    );

    expect(game?.status).toBe("upcoming");
    expect(game?.teams[0]?.score).toBeUndefined();
  });
  it("falls back to title when team map is empty", () => {
    const game = parseScheduleEvent(
      {
        id: 7501,
        date: "2026-05-24T12:10:00",
        status: "publish",
        title: { rendered: "Knights vs Rhinos" },
        teams: [114, 120],
        venues: [272],
        main_results: ["13", "29"]
      },
      new Map(),
      venues,
      Date.parse("2026-06-01T00:00:00")
    );

    expect(game?.teams.map((side) => side.name)).toEqual(["Knights", "Rhinos"]);
  });
});

describe("hydrateScheduleGames", () => {
  it("replaces Team ID placeholders from the team map", () => {
    const hydrated = hydrateScheduleGames(
      [
        {
          id: 1,
          date: "2026-05-24T12:00:00",
          status: "final",
          title: "Knights vs Rhinos",
          teams: [
            { id: 114, name: "Team 114", score: 13 },
            { id: 120, name: "Team 120", score: 29 }
          ]
        }
      ],
      new Map([
        [114, "Knights"],
        [120, "Rhinos"]
      ])
    );
    expect(hydrated[0]?.teams.map((side) => side.name)).toEqual(["Knights", "Rhinos"]);
  });
});

describe("partitionSchedule", () => {
  it("splits finals and upcoming", () => {
    const parts = partitionSchedule([
      {
        id: 1,
        date: "2026-05-24T12:00:00",
        status: "final",
        title: "A",
        teams: [
          { id: 1, name: "A", score: 10 },
          { id: 2, name: "B", score: 7 }
        ]
      },
      {
        id: 2,
        date: "2026-09-13T12:00:00",
        status: "upcoming",
        title: "C",
        teams: [
          { id: 3, name: "C" },
          { id: 4, name: "D" }
        ]
      }
    ]);
    expect(parts.finals).toHaveLength(1);
    expect(parts.upcoming).toHaveLength(1);
  });
});
