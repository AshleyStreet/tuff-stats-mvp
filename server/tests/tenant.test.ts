import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAdapter } from "../src/adapters/resolve.js";
import { CACHE_DIR } from "../src/lib/cache.js";
import { bushLeague } from "../src/leagues/bush.js";
import { harborLeague } from "../src/leagues/harbor.js";
import { passionLeague } from "../src/leagues/passion.js";
import { tuffLeague } from "../src/leagues/tuff.js";
import { getPublicLeague, reloadTenants, resolveRequestLeague } from "../src/leagues/registry.js";

function withTempTenants() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuff-tenants-"));
  const previous = process.env.TENANTS_DIR;
  process.env.TENANTS_DIR = dir;
  reloadTenants();
  return {
    restore() {
      fs.rmSync(dir, { recursive: true, force: true });
      if (previous == null) delete process.env.TENANTS_DIR;
      else process.env.TENANTS_DIR = previous;
      reloadTenants();
    }
  };
}

describe("request tenant routing", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withTempTenants().restore;
  });

  afterEach(() => {
    restore();
  });
  it("serves TUFF on stats.playtuff.ca and unknown hosts", () => {
    expect(resolveRequestLeague({ host: "stats.playtuff.ca" }).slug).toBe("tuff");
    expect(resolveRequestLeague({ host: "localhost:5173" }).slug).toBe("tuff");
    expect(resolveRequestLeague({ host: "other.example" }).slug).toBe("tuff");
  });

  it("serves Harbor on demo hosts", () => {
    expect(resolveRequestLeague({ host: "demo.localhost:5173" }).slug).toBe("harbor");
    expect(resolveRequestLeague({ host: "anotherleague.localhost" }).slug).toBe("harbor");
  });

  it("serves Bush League on bush hosts", () => {
    expect(resolveRequestLeague({ host: "bush.localhost:5173" }).slug).toBe("bush");
    expect(resolveRequestLeague({ host: "www.bushleaguetoronto.ca" }).slug).toBe("bush");
    expect(resolveRequestLeague({ host: "127.0.0.1:4000", forwardedHost: "bush.localhost:5173" }).slug).toBe("bush");
  });

  it("serves Passion Soccer on passion hosts", () => {
    expect(resolveRequestLeague({ host: "passion.localhost:5173" }).slug).toBe("passion");
    expect(resolveRequestLeague({ host: "passion-soccer.com" }).slug).toBe("passion");
    expect(resolveRequestLeague({ host: "www.passion-soccer.com" }).slug).toBe("passion");
    expect(resolveRequestLeague({ host: "passion.afterwhistle.ca" }).slug).toBe("passion");
  });

  it("uses X-Forwarded-Host when the proxy rewrites Host to the local API", () => {
    expect(
      resolveRequestLeague({ host: "127.0.0.1:4000", forwardedHost: "demo.localhost:5173" }).slug
    ).toBe("harbor");
  });

  it("allows a dev-only slug override when the host is unknown", () => {
    expect(resolveRequestLeague({ host: "localhost", slug: "harbor" }).slug).toBe("harbor");
  });

  it("ignores slug overrides in production", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(resolveRequestLeague({ host: "localhost", slug: "harbor" }).slug).toBe("tuff");
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

describe("Harbor fixture adapter", () => {
  it("resolves Harbor to the fixture adapter, not TUFF ingest", () => {
    const adapter = getAdapter(harborLeague);
    expect(adapter.leagueId).toBe("harbor");
    expect(getAdapter(tuffLeague).leagueId).toBe("tuff");
  });

  it("returns Harbor identity rather than TUFF copy", () => {
    const pub = getPublicLeague("harbor");
    expect(pub.slug).toBe("harbor");
    expect(pub.shortName).toBe("HARBOR");
    expect(pub.name).toBe("Harbor Flag Football");
    expect(pub.branding.primaryColor).toBe("#0e7c7b");
    expect(pub.branding.secondaryColor).toBe("#e8c547");
    expect(pub.franchiseTeamNames).toEqual(["Hawks", "Otters"]);
    expect(pub.name).not.toContain("Toronto");
  });

  it("serves fixture players, standings, and a box score", async () => {
    const adapter = getAdapter(harborLeague);
    const players = await adapter.getPlayers({ season: "2026" });
    expect(players.meta.league?.slug).toBe("harbor");
    expect(players.meta.source).toBe("fixture");
    expect(players.players.map((player) => player.name)).toContain("Maya K.");
    expect(players.players.map((player) => player.name)).not.toContain("Colin H.");
    expect(players.meta.standings?.map((row) => row.name)).toEqual(["Hawks", "Otters"]);

    const schedule = await adapter.getSchedule({ season: "2026" });
    expect(schedule.games).toHaveLength(2);
    const game = await adapter.getGame("9001", { season: "2026" });
    expect(game?.game.title).toBe("Hawks vs Otters");
    expect(game?.sides[0]?.players.length).toBeGreaterThan(0);

    const profile = await adapter.getPlayerProfile(players.players[0]!.id);
    expect(profile?.name).toBeTruthy();
    expect(profile?.meta.league?.slug).toBe("harbor");
  });

  it("writes Harbor cache without touching TUFF cache files", async () => {
    const tuffFile = path.join(CACHE_DIR, "tuff", "season-2026.json");
    const harborFile = path.join(CACHE_DIR, "harbor", "season-2026.json");
    const before = fs.existsSync(tuffFile) ? fs.statSync(tuffFile).mtimeMs : 0;

    await getAdapter(harborLeague).refresh("2026");

    expect(fs.existsSync(harborFile)).toBe(true);
    const after = fs.existsSync(tuffFile) ? fs.statSync(tuffFile).mtimeMs : 0;
    expect(after).toBe(before);
  });
});

describe("Bush League sportspress adapter", () => {
  it("resolves Bush to the sportspress adapter, not TUFF ingest", () => {
    const adapter = getAdapter(bushLeague);
    expect(adapter.leagueId).toBe("bush");
    expect(getAdapter(tuffLeague).leagueId).toBe("tuff");
  });

  it("returns Bush identity rather than TUFF copy", () => {
    const pub = getPublicLeague("bush");
    expect(pub.slug).toBe("bush");
    expect(pub.shortName).toBe("BUSH");
    expect(pub.name).toBe("Bush League Toronto");
    expect(pub.sport).toBe("softball");
    expect(pub.franchiseTeamNames).toContain("Honey Badgers");
    expect(pub.name).not.toContain("Toronto United");
  });

  it("ingests live standings, teams, and schedule from bushleaguetoronto.ca", async () => {
    const adapter = getAdapter(bushLeague);
    const players = await adapter.getPlayers({ season: "2026", force: true });
    expect(players.meta.league?.slug).toBe("bush");
    expect(players.meta.source).toBe("sportspress");
    expect(players.players.map((player) => player.name)).not.toContain("Colin H.");
    expect(players.meta.standings?.map((row) => row.name)).toEqual(
      expect.arrayContaining(["Diamond Dogs", "Honey Badgers", "Lobbers"])
    );
    expect(players.meta.teams).toEqual(
      expect.arrayContaining(["Diamond Dogs", "Honey Badgers", "Rhinos"])
    );

    const schedule = await adapter.getSchedule({ season: "2026", force: true });
    expect(schedule.games.length).toBeGreaterThan(0);
    expect(schedule.games[0]?.teams.length).toBeGreaterThanOrEqual(2);
    expect(schedule.games.some((game) => game.title.includes("Diamond Dogs"))).toBe(true);
  }, 45000);

  it("writes Bush cache without touching TUFF cache files", async () => {
    const tuffFile = path.join(CACHE_DIR, "tuff", "season-2026.json");
    const bushFile = path.join(CACHE_DIR, "bush", "season-2026.json");
    const before = fs.existsSync(tuffFile) ? fs.statSync(tuffFile).mtimeMs : 0;

    await getAdapter(bushLeague).refresh("2026");

    expect(fs.existsSync(bushFile)).toBe(true);
    const after = fs.existsSync(tuffFile) ? fs.statSync(tuffFile).mtimeMs : 0;
    expect(after).toBe(before);
  }, 45000);
});

describe("Passion Soccer sportspress adapter", () => {
  it("returns Passion identity with configured division seasons", () => {
    const pub = getPublicLeague("passion");
    expect(pub.slug).toBe("passion");
    expect(pub.sport).toBe("soccer");
    expect(pub.presentation.sortOptions[0]?.key).toBe("goals");
    expect(passionLeague.source.sportspress?.seasonMode).toBe("configured");
    expect(passionLeague.source.sportspress?.seasons?.some((slice) => slice.key === "d2-ete-2026")).toBe(true);
  });

  it("ingests live D2 standings and player goals from passion-soccer.com", async () => {
    const adapter = getAdapter(passionLeague);
    const seasons = await adapter.getSeasons({ force: true });
    expect(seasons.map((season) => season.year)).toEqual(expect.arrayContaining(["d2-ete-2026", "d4-ete-2026"]));

    const players = await adapter.getPlayers({ season: "d2-ete-2026", force: true });
    expect(players.meta.league?.slug).toBe("passion");
    expect(players.meta.source).toBe("sportspress");
    expect(players.meta.seasonLabel).toContain("D2");
    expect(players.meta.standings?.map((row) => row.name)).toEqual(
      expect.arrayContaining(["TITANS FC"])
    );
    expect(players.players.length).toBeGreaterThan(0);
    expect(players.players.some((player) => player.stats.goals > 0)).toBe(true);
    expect(players.players.map((player) => player.name)).not.toContain("Colin H.");
  }, 60000);
});
