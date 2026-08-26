import { flagFootballPresentation } from "../src/leagues/sports/flag-football.js";
import { soccerPresentation } from "../src/leagues/sports/soccer.js";
import { softballPresentation } from "../src/leagues/sports/softball.js";
import { getPublicLeague } from "../src/leagues/registry.js";
import { bushLeague } from "../src/leagues/bush.js";
import { passionLeague } from "../src/leagues/passion.js";
import { tuffLeague } from "../src/leagues/tuff.js";

describe("flag-football presentation schema", () => {
  const schema = flagFootballPresentation;

  it("keeps the current TUFF sort keys and labels", () => {
    expect(schema.sortOptions.map((column) => column.key)).toEqual([
      "totalPoints",
      "tpnqb",
      "recTD",
      "rec",
      "int",
      "deflag",
      "sack",
      "paTD",
      "gms"
    ]);
    expect(schema.sortOptions[0]?.label).toBe("Total Points");
    expect(schema.sortOptions.find((column) => column.key === "tpnqb")?.label).toBe("Non-QB Points");
    expect(schema.sortOptions.find((column) => column.key === "deflag")?.label).toBe("Deflags");
  });

  it("keeps player-card mini stats and detail groups", () => {
    expect(schema.playerCardMini.map((column) => column.key)).toEqual([
      "rec",
      "recTD",
      "tpnqb",
      "int",
      "sack"
    ]);
    expect(schema.playerCardFooter.map((column) => column.short)).toEqual(["total TD", "NQ"]);
    expect(schema.detailGroups.map((group) => group.title)).toEqual(["Offense", "Defense", "Conversions"]);
    expect(schema.detailGroups[0]?.columns.map((column) => column.key)).toEqual([
      "paTD",
      "ruTD",
      "recTD",
      "tpnqb",
      "retTD",
      "comp",
      "rec"
    ]);
  });

  it("keeps box score, game log, and card defaults", () => {
    expect(schema.boxScoreColumns.map((column) => column.short)).toEqual(["Rec", "RecTD", "PaTD", "INT", "Sack", "DFL"]);
    expect(schema.gameLogColumns.map((column) => column.short)).toEqual(["Rec", "RecTD", "PaTD", "INT", "Sack", "DFL"]);
    expect(schema.cardDefaults.map((column) => column.short)).toEqual(["PTS", "TD", "REC", "INT", "SACK"]);
  });
});

describe("public league presentation", () => {
  it("sends the TUFF schema and sport icon on the public payload", () => {
    const pub = getPublicLeague("tuff");
    expect(tuffLeague.sportIcon).toBe("football");
    expect(pub.sportIcon).toBe("football");
    expect(pub.presentation).toBe(flagFootballPresentation);
    expect(pub.presentation.sortOptions[0]?.key).toBe("totalPoints");
    expect(pub).not.toHaveProperty("source");
    expect(pub).not.toHaveProperty("adapter");
  });

  it("sends the Bush softball schema on the public payload", () => {
    const pub = getPublicLeague("bush");
    expect(bushLeague.sportIcon).toBe("softball");
    expect(pub.sportIcon).toBe("softball");
    expect(pub.presentation).toBe(softballPresentation);
    expect(pub.presentation.sortOptions[0]?.key).toBe("r");
  });

  it("sends the Passion soccer schema on the public payload", () => {
    const pub = getPublicLeague("passion");
    expect(passionLeague.sportIcon).toBe("soccer");
    expect(pub.sportIcon).toBe("soccer");
    expect(pub.presentation).toBe(soccerPresentation);
    expect(pub.presentation.sortOptions[0]?.key).toBe("goals");
  });
});
