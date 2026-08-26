import type { StatPresentation } from "./types.js";

const goals = { key: "goals", label: "Goals", short: "G" };
const gms = { key: "gms", label: "Games Played", short: "GP" };
const gpg = { key: "goalsPerGame", label: "Goals / game", short: "G/G" };
const yellow = { key: "yellowCards", label: "Yellow cards", short: "YC" };
const red = { key: "redCards", label: "Red cards", short: "RC" };

/** Keep in sync with client/src/league/soccer.ts */
export const soccerPresentation: StatPresentation = {
  sortOptions: [goals, gpg, gms, yellow, red],
  playerCardMini: [goals, gms, gpg, yellow, red],
  playerCardFooter: [
    { key: "goals", label: "Goals", short: "goals" },
    { key: "goalsPerGame", label: "Goals / game", short: "G / game" }
  ],
  heroKpis: [
    { key: "goals", label: "GOALS", short: "G" },
    { key: "gms", label: "GP", short: "GP" },
    { key: "goalsPerGame", label: "G/G", short: "G/G" }
  ],
  careerKpis: [
    { key: "goals", label: "CAREER G", short: "G" },
    { key: "gms", label: "GAMES", short: "GP" },
    { key: "yellowCards", label: "YELLOW", short: "YC" }
  ],
  seasonTableColumns: [
    { key: "gms", label: "Games", short: "GP" },
    { key: "goals", label: "Goals", short: "G" },
    { key: "goalsPerGame", label: "G/G", short: "G/G" },
    { key: "yellowCards", label: "YC", short: "YC" }
  ],
  detailGroups: [
    {
      id: "scoring",
      title: "Scoring",
      icon: "zap",
      columns: [goals, gms, gpg]
    },
    {
      id: "discipline",
      title: "Discipline",
      icon: "shield",
      columns: [yellow, red]
    }
  ],
  gameLogColumns: [goals, yellow, red],
  boxScoreColumns: [goals, yellow, red],
  cardDefaults: [goals, gms, gpg, yellow, red],
  cardOptions: [goals, gms, gpg, yellow, red]
};
