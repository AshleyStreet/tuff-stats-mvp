import type { StatPresentation } from "./types.js";

const td = { key: "td", label: "Touchdowns", short: "TD" };
const conv1 = { key: "conv1", label: "1-Point Converts", short: "C1" };
const conv2 = { key: "conv2", label: "2-Point Converts", short: "C2" };
const pts = { key: "totalPoints", label: "Points", short: "PTS" };
const int = { key: "int", label: "Interceptions", short: "INT" };
const sack = { key: "sack", label: "Sacks", short: "SK" };
const gms = { key: "gms", label: "Games Played", short: "GP" };

/**
 * Touch-football layout for sources that report aggregate scoring (TD/C1/C2)
 * rather than splitting it by pass/run/reception — eSportsDesk leagues. Showing
 * the split columns here would imply detail the source never published.
 */
export const touchFootballPresentation: StatPresentation = {
  sortOptions: [pts, td, conv2, conv1, int, sack, gms],
  playerCardMini: [td, conv1, conv2, int, sack],
  playerCardFooter: [
    { key: "totalTouchdowns", label: "Total TDs", short: "total TD" },
    pts
  ],
  heroKpis: [
    { key: "td", label: "TOUCHDOWNS", short: "TD" },
    { key: "totalPoints", label: "POINTS", short: "PTS" },
    { key: "gms", label: "GAMES", short: "GP" }
  ],
  careerKpis: [
    { key: "totalPoints", label: "CAREER PTS", short: "PTS" },
    { key: "totalTouchdowns", label: "CAREER TDS", short: "TD" },
    { key: "gms", label: "GAMES", short: "G" }
  ],
  seasonTableColumns: [
    { key: "gms", label: "Games", short: "G" },
    { key: "totalPoints", label: "Points", short: "Pts" },
    { key: "td", label: "Touchdowns", short: "TD" },
    { key: "int", label: "Interceptions", short: "INT" }
  ],
  detailGroups: [
    {
      id: "scoring",
      title: "Scoring",
      icon: "zap",
      columns: [td, conv1, conv2, pts]
    },
    {
      id: "defense",
      title: "Defense",
      icon: "shield",
      columns: [int, sack]
    }
  ],
  gameLogColumns: [td, conv1, conv2, int, sack],
  boxScoreColumns: [td, conv1, conv2, int, sack],
  cardDefaults: [pts, { key: "totalTouchdowns", label: "Total TDs", short: "TD" }, int],
  cardOptions: [
    pts,
    { key: "totalTouchdowns", label: "Total TDs", short: "TD" },
    td,
    conv1,
    conv2,
    int,
    sack,
    gms
  ]
};
