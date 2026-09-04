import { flagFootballPresentation } from "../league/flagFootball";
import type { PublicLeague } from "../league/types";
import type { Player, StatKey, Stats, TeamStanding } from "../types";

/**
 * Self-contained league behind the marketing homepage demo.
 *
 * Deliberately not fetched from /api: afterwhistle.ca resolves to the default
 * tenant (see the server's resolveRequestLeague — the `?league=` override is
 * dev-only on purpose), so there is no way to ask the marketing host for
 * Harbor's data without weakening tenant isolation for a marketing feature.
 * Baking the roster in also means the demo paints instantly and still works
 * when the API is cold, which matters more here than live numbers do.
 *
 * Typed as the real Player/Stats so drift in those contracts breaks the build
 * rather than the homepage.
 */

const TEAMS = ["Hawks", "Otters", "Dockers", "Ironsides", "Kestrels", "Narwhals"] as const;

type Archetype = "qb" | "receiver" | "defender" | "utility";

const ROSTER: Array<{ name: string; team: string; archetype: Archetype }> = [
  { name: "Maya Kowalski", team: "Hawks", archetype: "receiver" },
  { name: "Jonah Pereira", team: "Hawks", archetype: "qb" },
  { name: "Priya Sandhu", team: "Hawks", archetype: "defender" },
  { name: "Desmond Clarke", team: "Hawks", archetype: "receiver" },
  { name: "Ruth Adeyemi", team: "Hawks", archetype: "utility" },
  { name: "Tobias Lund", team: "Hawks", archetype: "defender" },
  { name: "Nadia Haddad", team: "Hawks", archetype: "receiver" },
  { name: "Cal Brennan", team: "Hawks", archetype: "utility" },

  { name: "Chris Delacroix", team: "Otters", archetype: "qb" },
  { name: "Lena Moreau", team: "Otters", archetype: "receiver" },
  { name: "Omar Tannous", team: "Otters", archetype: "defender" },
  { name: "Sasha Ivanova", team: "Otters", archetype: "receiver" },
  { name: "Wes Okafor", team: "Otters", archetype: "utility" },
  { name: "Bianca Rossi", team: "Otters", archetype: "defender" },
  { name: "Theo Gagnon", team: "Otters", archetype: "receiver" },
  { name: "Marcus Whitfield", team: "Otters", archetype: "utility" },

  { name: "Aisha Bramble", team: "Dockers", archetype: "qb" },
  { name: "Niko Petrakis", team: "Dockers", archetype: "receiver" },
  { name: "Farah Nasser", team: "Dockers", archetype: "defender" },
  { name: "Elliot Chan", team: "Dockers", archetype: "receiver" },
  { name: "Rosa Villalobos", team: "Dockers", archetype: "utility" },
  { name: "Gus Halvorsen", team: "Dockers", archetype: "defender" },
  { name: "Ivy Sutherland", team: "Dockers", archetype: "receiver" },
  { name: "Dre Mbeki", team: "Dockers", archetype: "utility" },

  { name: "Rowan Fitzgerald", team: "Ironsides", archetype: "qb" },
  { name: "Simone Beauchamp", team: "Ironsides", archetype: "receiver" },
  { name: "Hassan Yilmaz", team: "Ironsides", archetype: "defender" },
  { name: "Greta Lindqvist", team: "Ironsides", archetype: "receiver" },
  { name: "Malik Osei", team: "Ironsides", archetype: "utility" },
  { name: "Camila Duarte", team: "Ironsides", archetype: "defender" },
  { name: "Vince Marchetti", team: "Ironsides", archetype: "receiver" },
  { name: "Jo Tremblay", team: "Ironsides", archetype: "utility" },

  { name: "Kenji Nakamura", team: "Kestrels", archetype: "qb" },
  { name: "Adaeze Nwosu", team: "Kestrels", archetype: "receiver" },
  { name: "Piotr Kaminski", team: "Kestrels", archetype: "defender" },
  { name: "Yara Mansour", team: "Kestrels", archetype: "receiver" },
  { name: "Sean Doherty", team: "Kestrels", archetype: "utility" },
  { name: "Leila Farooq", team: "Kestrels", archetype: "defender" },
  { name: "Andre Bouchard", team: "Kestrels", archetype: "receiver" },
  { name: "Tess Kirkland", team: "Kestrels", archetype: "utility" },

  { name: "Dmitri Volkov", team: "Narwhals", archetype: "qb" },
  { name: "Kaia Thorne", team: "Narwhals", archetype: "receiver" },
  { name: "Emeka Balogun", team: "Narwhals", archetype: "defender" },
  { name: "Noor Rahimi", team: "Narwhals", archetype: "receiver" },
  { name: "Jasper Quinn", team: "Narwhals", archetype: "utility" },
  { name: "Sofia Castellanos", team: "Narwhals", archetype: "defender" },
  { name: "Linus Aberg", team: "Narwhals", archetype: "receiver" },
  { name: "Robin Achebe", team: "Narwhals", archetype: "utility" }
];

const GAMES_PLAYED = 9;

/** Mulberry32 — deterministic, so the demo roster never shifts between builds. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAT_KEYS: StatKey[] = [
  "gms", "tpqb", "tpnqb", "paTD", "ruTD", "recTD", "retTD",
  "comp", "int", "sack", "deflag", "pa1PT", "ru1PT", "re1PT",
  "pa2PT", "rec", "ru2PT", "re2PT", "ret2PT", "safety",
  "ab", "r", "h", "doubles", "triples", "hr", "rbi", "bb", "so", "sb",
  "goals", "yellowCards", "redCards"
];

function emptyStats(): Stats {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 0])) as Stats;
}

/** Mirrors the server's buildPlayer/nonQbPointsFromStats for the keys the client models. */
function derive(stats: Stats): Player["derived"] {
  const games = Math.max(stats.gms, 1);
  return {
    totalTouchdowns: stats.paTD + stats.ruTD + stats.recTD + stats.retTD,
    totalPoints: stats.tpnqb + stats.tpqb,
    receptionsPerGame: Number((stats.rec / games).toFixed(2)),
    receivingTouchdownsPerGame: Number((stats.recTD / games).toFixed(2))
  };
}

function buildStats(archetype: Archetype, next: () => number): Stats {
  const stats = emptyStats();
  const span = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  stats.gms = span(GAMES_PLAYED - 2, GAMES_PLAYED);

  if (archetype === "qb") {
    stats.paTD = span(9, 22);
    stats.comp = span(48, 96);
    stats.pa1PT = span(3, 9);
    stats.pa2PT = span(1, 5);
    stats.rec = span(0, 4);
    stats.recTD = span(0, 1);
    stats.int = span(0, 2);
    stats.deflag = span(2, 9);
  } else if (archetype === "receiver") {
    stats.rec = span(18, 44);
    stats.recTD = span(4, 12);
    stats.re1PT = span(2, 8);
    stats.re2PT = span(0, 4);
    stats.ruTD = span(0, 2);
    stats.int = span(0, 3);
    stats.deflag = span(3, 12);
    stats.sack = span(0, 2);
  } else if (archetype === "defender") {
    stats.int = span(3, 9);
    stats.sack = span(2, 8);
    stats.deflag = span(12, 30);
    stats.safety = span(0, 2);
    stats.rec = span(2, 11);
    stats.recTD = span(0, 3);
    stats.re1PT = span(0, 2);
    stats.retTD = span(0, 2);
  } else {
    stats.rec = span(8, 22);
    stats.recTD = span(2, 6);
    stats.re1PT = span(1, 5);
    stats.re2PT = span(0, 2);
    stats.ruTD = span(0, 3);
    stats.int = span(1, 4);
    stats.sack = span(0, 3);
    stats.deflag = span(6, 16);
  }

  stats.tpnqb = stats.recTD * 6 + stats.re1PT + stats.re2PT * 2;
  stats.tpqb = stats.paTD * 6 + stats.pa1PT + stats.pa2PT * 2;
  return stats;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const demoPlayers: Player[] = ROSTER.map((seed, index) => {
  const stats = buildStats(seed.archetype, rng(index * 7919 + 104729));
  return {
    id: `${slugify(seed.name)}-${index + 100}`,
    name: seed.name,
    team: seed.team,
    sourceId: String(index + 100),
    stats,
    derived: derive(stats)
  };
});

export const demoTeams: string[] = [...TEAMS];

/** Built from the roster so the standings table and the player cards never disagree. */
export const demoStandings: TeamStanding[] = TEAMS.map((team) => {
  const roster = demoPlayers.filter((player) => player.team === team);
  return {
    team,
    pointsFor: roster.reduce((total, player) => total + player.derived.totalPoints, 0)
  };
})
  .sort((a, b) => b.pointsFor - a.pointsFor)
  .map((entry, index) => {
    const wins = Math.max(0, GAMES_PLAYED - 1 - index * 2 + (index % 2));
    const losses = GAMES_PLAYED - 1 - wins;
    const against = Math.round(entry.pointsFor * (0.72 + index * 0.11));
    return {
      name: entry.team,
      pos: index + 1,
      wins,
      losses,
      ties: 0,
      pct: Number((wins / Math.max(wins + losses, 1)).toFixed(3)),
      pointsFor: entry.pointsFor,
      pointsAgainst: against,
      netPoints: entry.pointsFor - against,
      standingsPoints: wins * 2,
      streak: wins > losses ? `W${1 + (index % 3)}` : `L${1 + (index % 2)}`
    };
  });

/** Harbor branding, so the demo reads as a real tenant rather than as TUFF. */
export const demoPublicLeague: PublicLeague = {
  slug: "harbor",
  name: "Harbor Flag Football",
  shortName: "HARBOR",
  sport: "flag-football",
  branding: {
    logo: "/harbor-logo.svg",
    logoAlt: "Harbor Flag Football",
    primaryColor: "#0e7c7b",
    secondaryColor: "#e8c547"
  },
  publicSeason: "2026",
  copy: {
    documentTitle: "Harbor Stats · Flag Football",
    tagline: "HARBOR FLAG FOOTBALL",
    loadErrorTitle: "Couldn’t load Harbor.",
    profileLinkLabel: "Open original Harbor profile",
    recapLinkLabel: "Open original Harbor recap",
    htmlSourceLabel: "Harbor table"
  },
  sportIcon: "football",
  presentation: flagFootballPresentation,
  franchiseTeamNames: [...TEAMS],
  features: []
};
