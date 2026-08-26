import type { StatPresentation } from "./types.js";

const ab = { key: "ab", label: "At Bats", short: "AB" };
const r = { key: "r", label: "Runs", short: "R" };
const h = { key: "h", label: "Hits", short: "H" };
const doubles = { key: "doubles", label: "Doubles", short: "2B" };
const triples = { key: "triples", label: "Triples", short: "3B" };
const hr = { key: "hr", label: "Home Runs", short: "HR" };
const rbi = { key: "rbi", label: "Runs Batted In", short: "RBI" };
const bb = { key: "bb", label: "Walks", short: "BB" };
const so = { key: "so", label: "Strikeouts", short: "SO" };
const sb = { key: "sb", label: "Stolen Bases", short: "SB" };
const gms = { key: "gms", label: "Games Played", short: "GP" };

/** Baked fallback — keep in sync with client/src/league/softball.ts */
export const softballPresentation: StatPresentation = {
  sortOptions: [r, h, hr, rbi, bb, so, gms],
  playerCardMini: [ab, r, h, hr, rbi],
  playerCardFooter: [
    { key: "h", label: "Hits", short: "hits" },
    { key: "rbi", label: "RBI", short: "RBI" }
  ],
  heroKpis: [
    { key: "h", label: "HITS", short: "H" },
    { key: "hr", label: "HR", short: "HR" },
    { key: "rbi", label: "RBI", short: "RBI" }
  ],
  careerKpis: [
    { key: "r", label: "CAREER R", short: "R" },
    { key: "hr", label: "CAREER HR", short: "HR" },
    { key: "gms", label: "GAMES", short: "G" }
  ],
  seasonTableColumns: [
    { key: "gms", label: "Games", short: "G" },
    { key: "h", label: "Hits", short: "H" },
    { key: "hr", label: "Home Runs", short: "HR" },
    { key: "rbi", label: "RBI", short: "RBI" }
  ],
  detailGroups: [
    {
      id: "batting",
      title: "Batting",
      icon: "zap",
      columns: [ab, r, h, doubles, triples, hr, rbi]
    },
    {
      id: "patience",
      title: "Patience & speed",
      icon: "trophy",
      columns: [bb, so, sb]
    }
  ],
  gameLogColumns: [ab, r, h, hr, rbi, so],
  boxScoreColumns: [ab, r, h, hr, rbi, so],
  cardDefaults: [r, h, hr, rbi, so],
  cardOptions: [r, h, hr, rbi, ab, doubles, triples, bb, so, sb, gms]
};
