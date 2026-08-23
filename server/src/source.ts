import * as cheerio from "cheerio";
import type { Player, PlayersResponse, StatKey, Stats } from "./types.js";

const DEFAULT_STATS_URL = "https://www.playtuff.ca/list/2026-tuff-stats/";
const DEFAULT_LIST_SLUG = "2026-tuff-stats";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 300_000);

let cache: { expiresAt: number; data: PlayersResponse } | null = null;

const headerMap: Record<string, StatKey> = {
  gms: "gms",
  games: "gms",
  tpqb: "tpqb",
  tpnqb: "tpnqb",
  patd: "paTD",
  rutd: "ruTD",
  rectd: "recTD",
  rettd: "retTD",
  comp: "comp",
  int: "int",
  sack: "sack",
  att: "att",
  pa1pt: "pa1PT",
  ru1pt: "ru1PT",
  re1pt: "re1PT",
  pa2pt: "pa2PT",
  rec: "rec",
  ru2pt: "ru2PT",
  re2pt: "re2PT",
  ret2pt: "ret2PT",
  safety: "safety"
};

const emptyStats = (): Stats => ({
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
  att: 0,
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

const toNumber = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function buildPlayer(name: string, stats: Stats, profileUrl?: string): Player {
  const games = Math.max(stats.gms, 1);
  const totalTouchdowns = stats.paTD + stats.ruTD + stats.recTD + stats.retTD;
  // SportsPress/TUFF already exposes total points split by QB and non-QB.
  // Keep that as the canonical total rather than re-counting individual scoring fields.
  const totalPoints = stats.tpnqb + stats.tpqb;

  return {
    id: slugify(name),
    name,
    profileUrl,
    stats,
    derived: {
      totalTouchdowns,
      totalPoints,
      receptionsPerGame: Number((stats.rec / games).toFixed(2)),
      receivingTouchdownsPerGame: Number((stats.recTD / games).toFixed(2))
    }
  };
}

function findSportsPressRows(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    const objectRows = value.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
    if (objectRows.length > 5) {
      const hasStats = objectRows.some((row) =>
        Object.keys(row).some((key) => headerMap[key.toLowerCase()])
      );
      if (hasStats) return objectRows;
    }
    for (const item of value) {
      const nested = findSportsPressRows(item);
      if (nested.length) return nested;
    }
    return [];
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    const rows = findSportsPressRows(nested);
    if (rows.length) return rows;
  }
  return [];
}

async function fromSportsPress(): Promise<Player[] | null> {
  const statsUrl = new URL(process.env.TUFF_STATS_URL ?? DEFAULT_STATS_URL);
  const listSlug = process.env.TUFF_LIST_SLUG ?? DEFAULT_LIST_SLUG;
  const endpoint = `${statsUrl.origin}/wp-json/sportspress/v2/lists?slug=${encodeURIComponent(listSlug)}&per_page=10`;

  const response = await fetch(endpoint, {
    headers: { "User-Agent": "TUFF-Stats-MVP/0.1" },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) return null;

  const json = (await response.json()) as unknown;
  const rows = findSportsPressRows(json);
  if (!rows.length) return null;

  const players = rows
    .map((row) => {
      const rawName = row.name ?? row.player ?? row.title;
      const name =
        typeof rawName === "string"
          ? rawName
          : rawName && typeof rawName === "object" && "rendered" in rawName
            ? String((rawName as { rendered: unknown }).rendered)
            : "";
      if (!name) return null;

      const stats = emptyStats();
      for (const [key, value] of Object.entries(row)) {
        const mapped = headerMap[key.toLowerCase()];
        if (mapped) stats[mapped] = toNumber(value);
      }
      return buildPlayer(name, stats);
    })
    .filter((player): player is Player => Boolean(player));

  return players.length ? players : null;
}

async function fromHtml(): Promise<Player[]> {
  const statsUrl = process.env.TUFF_STATS_URL ?? DEFAULT_STATS_URL;
  const response = await fetch(statsUrl, {
    headers: { "User-Agent": "TUFF-Stats-MVP/0.1" },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`TUFF stats page returned ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  const table = $("table").filter((_, element) => {
    const headings = $(element).find("thead th, tr:first-child th").map((_, th) => $(th).text().trim()).get();
    return headings.some((heading) => heading.toLowerCase() === "player") && headings.some((heading) => heading.toLowerCase() === "rectd");
  }).first();

  if (!table.length) throw new Error("Could not find the 2026 TUFF stats table");

  const headers = table.find("thead th, tr:first-child th").map((_, th) => $(th).text().trim()).get();
  const playerColumn = headers.findIndex((header) => header.toLowerCase() === "player");

  const players: Player[] = [];
  table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (!cells.length) return;

    const playerCell = cells.eq(playerColumn >= 0 ? playerColumn : 0);
    const name = playerCell.text().replace(/\s+/g, " ").trim();
    if (!name || name.toLowerCase() === "player") return;

    const href = playerCell.find("a").attr("href");
    const stats = emptyStats();

    headers.forEach((header, index) => {
      const key = headerMap[header.toLowerCase()];
      if (key) stats[key] = toNumber(cells.eq(index).text());
    });

    players.push(buildPlayer(name, stats, href));
  });

  if (!players.length) throw new Error("Stats table was found but no player rows could be parsed");
  return players;
}

export async function getPlayers(force = false): Promise<PlayersResponse> {
  if (!force && cache && Date.now() < cache.expiresAt) return cache.data;

  let players: Player[] | null = null;
  let source: PlayersResponse["meta"]["source"] = "html";

  try {
    players = await fromSportsPress();
    if (players?.length) source = "sportspress";
  } catch {
    players = null;
  }

  if (!players?.length) {
    players = await fromHtml();
    source = "html";
  }

  const data: PlayersResponse = {
    players,
    meta: {
      source,
      fetchedAt: new Date().toISOString(),
      total: players.length
    }
  };

  cache = { expiresAt: Date.now() + CACHE_TTL_MS, data };
  return data;
}
