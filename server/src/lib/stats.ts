import * as cheerio from "cheerio";
import type { Player, StatKey, Stats } from "../types.js";

export const headerMap: Record<string, StatKey> = {
  gms: "gms",
  games: "gms",
  gp: "gms",
  g: "gms",
  tpqb: "tpqb",
  tpnqb: "tpnqb",
  patd: "paTD",
  rutd: "ruTD",
  rectd: "recTD",
  rettd: "retTD",
  comp: "comp",
  int: "int",
  sack: "sack",
  att: "deflag",
  attempt: "deflag",
  attempts: "deflag",
  deflag: "deflag",
  deflags: "deflag",
  dfl: "deflag",
  pa1pt: "pa1PT",
  paonept: "pa1PT",
  ru1pt: "ru1PT",
  ruonept: "ru1PT",
  re1pt: "re1PT",
  reonept: "re1PT",
  pa2pt: "pa2PT",
  patwopt: "pa2PT",
  rec: "rec",
  ru2pt: "ru2PT",
  rutwopt: "ru2PT",
  re2pt: "re2PT",
  retwopt: "re2PT",
  ret2pt: "ret2PT",
  rettwopt: "ret2PT",
  safety: "safety",
  sty: "safety"
};

export const emptyStats = (): Stats => ({
  gms: 0,
  tpqb: 0,
  tpnqb: 0,
  paTD: 0,
  ruTD: 0,
  recTD: 0,
  retTD: 0,
  comp: 0,
  int: 0,
  sack: 0,
  deflag: 0,
  pa1PT: 0,
  ru1PT: 0,
  re1PT: 0,
  pa2PT: 0,
  rec: 0,
  ru2PT: 0,
  re2PT: 0,
  ret2PT: 0,
  safety: 0
});

export const toNumber = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const decodeEntities = (value: string) =>
  cheerio.load(`<textarea>${value}</textarea>`)("textarea").text();

export function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

export function isStatsList(list: { slug: string; title?: { rendered?: string } }) {
  const slug = list.slug.toLowerCase();
  const title = (list.title?.rendered ?? "").toLowerCase();
  if (slug === "tuff-stats-old") return false;
  return /(tuff|tgfl)-stats$/.test(slug) || /\b(tuff|tgfl)\s+stats\b/.test(title);
}

export function yearFromStatsList(list: { slug: string; title?: { rendered?: string } }): string | null {
  const slugMatch = list.slug.match(/^(\d{4})-/);
  if (slugMatch) return slugMatch[1];
  const titleMatch = decodeEntities(list.title?.rendered ?? "").match(/\b(20\d{2}|19\d{2})\b/);
  return titleMatch?.[1] ?? null;
}

export function statsFromRow(row: Record<string, unknown>): Stats {
  const stats = emptyStats();
  for (const [key, value] of Object.entries(row)) {
    const mapped = headerMap[key.toLowerCase()];
    if (mapped) stats[mapped] = toNumber(value);
  }
  return stats;
}

/** Copy SportsPress `att` onto `deflag` for snapshots saved before the rename. */
export function hydrateStats(raw: Partial<Stats> & { att?: number } | null | undefined): Stats {
  const stats = emptyStats();
  if (!raw) return stats;
  for (const key of Object.keys(stats) as StatKey[]) {
    if (raw[key] != null) stats[key] = toNumber(raw[key]);
  }
  if (!stats.deflag && raw.att != null) stats.deflag = toNumber(raw.att);
  return stats;
}

export function buildPlayer(
  name: string,
  stats: Stats,
  extras: { profileUrl?: string; team?: string; sourceId?: string } = {}
): Player {
  const games = Math.max(stats.gms, 1);
  const totalTouchdowns = stats.paTD + stats.ruTD + stats.recTD + stats.retTD;
  const totalPoints = stats.tpnqb + stats.tpqb;
  const id = extras.sourceId ? `${slugify(name)}-${extras.sourceId}` : slugify(name);

  return {
    id,
    name,
    profileUrl: extras.profileUrl,
    team: extras.team,
    sourceId: extras.sourceId,
    stats,
    derived: {
      totalTouchdowns,
      totalPoints,
      receptionsPerGame: Number((stats.rec / games).toFixed(2)),
      receivingTouchdownsPerGame: Number((stats.recTD / games).toFixed(2))
    }
  };
}

export const FRANCHISE_TEAM_NAMES = [
  "Brawlers",
  "Bulldogs",
  "Cobras",
  "Knights",
  "Lumberjacks",
  "Menace",
  "Rhinos",
  "Sirens",
  "Stallions",
  "Storm Crows",
  "Wildcats",
  "Wolfhounds",
  "Yetis"
];

export function uniqueTeamAliases(...groups: Array<Iterable<string>>): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const group of groups) {
    for (const name of group) {
      const trimmed = name.replace(/\s+/g, " ").trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      aliases.push(trimmed);
    }
  }
  return aliases;
}

/** Collapse sponsor prefixes ("Woody's Wildcats") onto standings nicknames ("Wildcats"). */
export function canonicalTeamName(raw: string, aliases: string[] = FRANCHISE_TEAM_NAMES): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return name;
  const lower = name.toLowerCase();

  const exact = aliases.find((alias) => alias.toLowerCase() === lower);
  if (exact) return exact;

  const suffixHits = aliases
    .filter((alias) => {
      const a = alias.toLowerCase();
      if (a.length < 4) return false;
      return lower.endsWith(` ${a}`) || lower === `the ${a}`;
    })
    .sort((a, b) => b.length - a.length);
  return suffixHits[0] ?? name;
}

export function teamNameFromRosterTitle(title: string, year: string) {
  const decoded = decodeEntities(title).trim();
  const withoutYear = decoded.replace(new RegExp(`^${year}[\\s-]+`, "i"), "").trim();
  if (/^[a-z0-9-]+$/i.test(withoutYear) && !withoutYear.includes(" ")) {
    return withoutYear
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return withoutYear;
}
