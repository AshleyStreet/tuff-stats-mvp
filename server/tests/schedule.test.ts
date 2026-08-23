import { applyTeamLogos, extractPlayerGameLog, hydrateScheduleGames, mapEventLineup, parseBoxScore, parseScheduleEvent, partitionSchedule } from "../src/lib/schedule.js";

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

describe("mapEventLineup", () => {
  it("splits SportsPress 0-delimited lineups onto each team", () => {
    const names = new Map([
      [6258, "Cobras"],
      [118, "Wildcats"]
    ]);
    const rows = mapEventLineup(
      [6258, 118],
      [0, 5511, 4885, 0, 7585, 7593, 7586],
      names
    );
    expect(rows).toEqual([
      { playerId: 5511, team: "Cobras" },
      { playerId: 4885, team: "Cobras" },
      { playerId: 7585, team: "Wildcats" },
      { playerId: 7593, team: "Wildcats" },
      { playerId: 7586, team: "Wildcats" }
    ]);
  });
});

describe("parseBoxScore", () => {
  it("maps performance rows onto each side and sorts by jersey", () => {
    const sides = parseBoxScore(
      {
        "6258": {
          "0": { rec: "Rec" },
          "4131": { number: "82", rec: "0", patd: "4", rectd: "0", int: "0", sack: "0" },
          "5511": { number: "5", rec: "6", patd: "0", rectd: "1", int: "2", sack: "0" }
        },
        "118": {
          "7585": { number: "6", rec: "5", patd: "0", rectd: "1", int: "1", sack: "0", rettd: "1" }
        }
      },
      [
        { id: 6258, name: "Cobras", score: 28, outcome: "win" },
        { id: 118, name: "Wildcats", score: 19, outcome: "loss" }
      ],
      new Map([
        [4131, "Shaun G."],
        [5511, "Kevin R."],
        [7585, "Carsson S."]
      ])
    );

    expect(sides[0]?.players.map((player) => player.name)).toEqual(["Kevin R.", "Shaun G."]);
    expect(sides[0]?.players[0]).toMatchObject({
      sourceId: "5511",
      number: "5",
      stats: { rec: 6, recTD: 1, int: 2 },
      derived: { totalTouchdowns: 1 }
    });
    expect(sides[1]?.players[0]).toMatchObject({
      name: "Carsson S.",
      derived: { totalTouchdowns: 2 }
    });
  });

  it("returns empty lineups when performance is missing", () => {
    const sides = parseBoxScore(undefined, [{ id: 1, name: "Cobras" }, { id: 2, name: "Wildcats" }]);
    expect(sides.every((side) => side.players.length === 0)).toBe(true);
  });
});

describe("applyTeamLogos", () => {
  it("attaches logo URLs by SportsPress team id", () => {
    const games = applyTeamLogos(
      [
        {
          id: 1,
          date: "2026-08-09T13:40:00",
          status: "final",
          title: "Cobras vs Wildcats",
          teams: [
            { id: 6258, name: "Cobras", score: 28 },
            { id: 118, name: "Wildcats", score: 19 }
          ]
        }
      ],
      new Map([
        [6258, "https://example.com/cobras.png"],
        [118, "https://example.com/wildcats.png"]
      ])
    );
    expect(games[0]?.teams.map((side) => side.logoUrl)).toEqual([
      "https://example.com/cobras.png",
      "https://example.com/wildcats.png"
    ]);
  });
});

describe("extractPlayerGameLog", () => {
  it("keeps the matching player's row and opponent", () => {
    const game = {
      id: 7550,
      date: "2026-08-09T13:40:00",
      status: "final" as const,
      title: "Cobras vs Wildcats",
      teams: [
        { id: 6258, name: "Cobras", score: 28, outcome: "win" },
        { id: 118, name: "Wildcats", score: 19, outcome: "loss" }
      ]
    };
    const sides = parseBoxScore(
      {
        "6258": {
          "5511": { number: "5", rec: "6", rectd: "1", patd: "0", int: "2", sack: "0" }
        },
        "118": {
          "7585": { number: "6", rec: "5", rectd: "1", patd: "0", int: "1", sack: "0" }
        }
      },
      game.teams
    );
    const log = extractPlayerGameLog([{ game, sides }], ["5511"]);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      team: "Cobras",
      opponent: "Wildcats",
      outcome: "win",
      score: 28,
      oppScore: 19,
      stats: { rec: 6, recTD: 1, int: 2 }
    });
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
