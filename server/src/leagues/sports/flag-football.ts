import type { StatPresentation } from "./types.js";

const rec = { key: "rec", label: "Receptions", short: "REC" };
const recTD = { key: "recTD", label: "Receiving TDs", short: "REC TD" };
const int = { key: "int", label: "Interceptions", short: "INT" };
const sack = { key: "sack", label: "Sacks", short: "SACK" };
const deflag = { key: "deflag", label: "Deflags", short: "DFL" };
const paTD = { key: "paTD", label: "Passing TDs", short: "PaTD" };

/** TUFF / flag-football layout — matches the current board, profile, box score, and cards. */
export const flagFootballPresentation: StatPresentation = {
  sortOptions: [
    { key: "totalPoints", label: "Total Points", short: "PTS" },
    recTD,
    rec,
    int,
    deflag,
    sack,
    paTD,
    { key: "gms", label: "Games Played", short: "GP" }
  ],
  playerCardMini: [rec, recTD, int, sack, deflag],
  playerCardFooter: [
    { key: "totalTouchdowns", label: "Total TDs", short: "total TD" },
    { key: "recPerGame", label: "Receptions / game", short: "REC / game" }
  ],
  heroKpis: [
    { key: "rec", label: "RECEPTIONS", short: "REC" },
    { key: "recTD", label: "REC TD", short: "REC TD" },
    { key: "int", label: "INT", short: "INT" }
  ],
  careerKpis: [
    { key: "totalPoints", label: "CAREER PTS", short: "PTS" },
    { key: "totalTouchdowns", label: "CAREER TD", short: "TD" },
    { key: "gms", label: "GAMES", short: "G" }
  ],
  seasonTableColumns: [
    { key: "gms", label: "Games", short: "G" },
    { key: "totalPoints", label: "Points", short: "Pts" },
    { key: "totalTouchdowns", label: "Touchdowns", short: "TD" }
  ],
  detailGroups: [
    {
      id: "offense",
      title: "Offense",
      icon: "zap",
      columns: [
        { key: "paTD", label: "Passing TDs", short: "PTD" },
        { key: "ruTD", label: "Rushing TDs", short: "RUSH" },
        { key: "recTD", label: "Receiving TDs", short: "RTD" },
        { key: "retTD", label: "Return TDs", short: "RET" },
        { key: "comp", label: "Completions", short: "CMP" },
        { key: "rec", label: "Receptions", short: "REC" }
      ]
    },
    {
      id: "defense",
      title: "Defense",
      icon: "shield",
      columns: [
        { key: "int", label: "Interceptions", short: "INT" },
        { key: "deflag", label: "Deflags", short: "DFL" },
        { key: "sack", label: "Sacks", short: "SACK" },
        { key: "safety", label: "Safeties", short: "SFT" }
      ]
    },
    {
      id: "conversions",
      title: "Conversions",
      icon: "trophy",
      columns: [
        { key: "pa1PT", label: "1PT Passing", short: "P1" },
        { key: "ru1PT", label: "1PT Rushing", short: "R1" },
        { key: "re1PT", label: "1PT Receiving", short: "C1" },
        { key: "pa2PT", label: "2PT Passing", short: "P2" },
        { key: "ru2PT", label: "2PT Rushing", short: "R2" },
        { key: "re2PT", label: "2PT Receiving", short: "C2" },
        { key: "ret2PT", label: "2PT Return", short: "T2" }
      ]
    }
  ],
  gameLogColumns: [
    { key: "rec", label: "Receptions", short: "Rec" },
    { key: "recTD", label: "Receiving TDs", short: "RecTD" },
    { key: "paTD", label: "Passing TDs", short: "PaTD" },
    int,
    { key: "sack", label: "Sacks", short: "Sack" },
    deflag
  ],
  boxScoreColumns: [
    { key: "rec", label: "Rec", short: "Rec" },
    { key: "recTD", label: "RecTD", short: "RecTD" },
    { key: "paTD", label: "PaTD", short: "PaTD" },
    { key: "int", label: "INT", short: "INT" },
    { key: "sack", label: "Sack", short: "Sack" },
    { key: "deflag", label: "DFL", short: "DFL" }
  ],
  cardDefaults: [
    { key: "totalPoints", label: "Total points", short: "PTS" },
    { key: "totalTouchdowns", label: "Total TDs", short: "TD" },
    rec,
    int,
    sack
  ],
  cardOptions: [
    { key: "totalPoints", label: "Total points", short: "PTS" },
    { key: "totalTouchdowns", label: "Total TDs", short: "TD" },
    rec,
    { key: "recTD", label: "Receiving TDs", short: "RTD" },
    int,
    sack,
    { key: "comp", label: "Completions", short: "CMP" },
    { key: "deflag", label: "Deflags", short: "DFL" },
    { key: "paTD", label: "Passing TDs", short: "PTD" },
    { key: "ruTD", label: "Rushing TDs", short: "RUSH" },
    { key: "retTD", label: "Return TDs", short: "RET" },
    { key: "gms", label: "Games played", short: "GP" },
    { key: "tpqb", label: "Points as QB", short: "QB" },
    { key: "tpnqb", label: "Points as non-QB", short: "NQ" },
    { key: "pa1PT", label: "Passing 1-pt", short: "P1" },
    { key: "ru1PT", label: "Rushing 1-pt", short: "R1" },
    { key: "re1PT", label: "Receiving 1-pt", short: "C1" },
    { key: "pa2PT", label: "Passing 2-pt", short: "P2" },
    { key: "ru2PT", label: "Rushing 2-pt", short: "R2" },
    { key: "re2PT", label: "Receiving 2-pt", short: "C2" },
    { key: "ret2PT", label: "Return 2-pt", short: "T2" },
    { key: "safety", label: "Safeties", short: "SFT" },
    { key: "recPerGame", label: "Receptions / game", short: "R/G" },
    { key: "recTdPerGame", label: "Rec TDs / game", short: "TD/G" }
  ]
};
