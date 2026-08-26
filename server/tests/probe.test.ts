import { buildSportspressSource, probeSourceUrl, type ProbeFetch } from "../src/leagues/probe.js";
import { createAdminTenant } from "../src/leagues/admin.js";
import { getLeagueBySlug, reloadTenants, resolveRequestLeague } from "../src/leagues/registry.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function withTempTenants() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tuff-tenants-"));
  const previous = process.env.TENANTS_DIR;
  process.env.TENANTS_DIR = dir;
  reloadTenants();
  return {
    dir,
    restore() {
      fs.rmSync(dir, { recursive: true, force: true });
      if (previous == null) delete process.env.TENANTS_DIR;
      else process.env.TENANTS_DIR = previous;
      reloadTenants();
    }
  };
}

function mockFetch(routes: Record<string, unknown>): ProbeFetch {
  const patterns = Object.entries(routes).sort(([a], [b]) => b.length - a.length);
  return async (url) => {
    const path = new URL(url).pathname + new URL(url).search;
    for (const [pattern, payload] of patterns) {
      if (path.includes(pattern)) {
        return new Response(JSON.stringify(payload), { status: 200 });
      }
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
}

describe("source probe", () => {
  it("detects year-based SportsPress and builds source config", async () => {
    const fetchImpl = mockFetch({
      "/wp-json/": { name: "Bush League Toronto", namespaces: ["sportspress/v2"] },
      "/sportspress/v2/seasons": [{ id: 1, name: "2026", slug: "2026" }],
      "/sportspress/v2/tables": [{ id: 2, slug: "bush-league-2026", data: { t1: { name: "Rhinos", w: 3 } } }],
      "/sportspress/v2/lists": [{ id: 3, slug: "bush-stats-2026", data: { p1: { ab: 10, hr: 2 } } }],
      "/sportspress/v2/teams": [{ id: 4, title: { rendered: "Rhinos" } }],
      "/sportspress/v2/events": [{ id: 5 }]
    });

    const probe = await probeSourceUrl("https://www.bushleaguetoronto.ca", fetchImpl);
    expect(probe.sportspressLive).toBe(true);
    expect(probe.adapter).toBe("sportspress");
    expect(probe.sport).toBe("softball");
    expect(probe.publicSeason).toBe("2026");
    expect(probe.source?.origin).toBe("https://www.bushleaguetoronto.ca");
    expect(probe.source?.sportspress?.seasonMode).toBe("year");
    expect(probe.source?.sportspress?.playerSource).toBe("lists");
  });

  it("falls back to fixture when SportsPress is empty", async () => {
    const fetchImpl = mockFetch({
      "/wp-json/": { name: "Burnaby Eagles", namespaces: ["sportspress/v2"] },
      "/wp-json/wp/v2/types": { sp_event: {}, sp_table: {} },
      "/sportspress/v2/seasons": [],
      "/sportspress/v2/tables": [],
      "/sportspress/v2/lists": [],
      "/sportspress/v2/teams": [],
      "/sportspress/v2/events": []
    });

    const probe = await probeSourceUrl("https://burnabyeagles.com", fetchImpl);
    expect(probe.sportspress).toBe(true);
    expect(probe.sportspressLive).toBe(false);
    expect(probe.adapter).toBe("fixture");
    expect(probe.warnings.some((warning) => /no seasons/i.test(warning))).toBe(true);
  });

  it("builds configured slices for non-year tables", () => {
    const source = buildSportspressSource({
      slug: "passion",
      origin: "https://passion-soccer.com",
      sport: "soccer",
      tables: ["d2-saison-reguliere-ete", "d3-saison-reguliere-ete"],
      lists: [{ id: 1, slug: "statistiques-d2", data: { p1: { goals: 2 } } }],
      seasons: [{ id: 1, slug: "saison-reguliere-ete", name: "Été" }],
      franchiseTeamNames: ["Team A"]
    });
    expect(source.sportspress?.seasonMode).toBe("configured");
    expect(source.sportspress?.seasons?.length).toBe(2);
  });
});

describe("admin sportspress tenant creation", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withTempTenants().restore;
  });

  afterEach(() => {
    restore();
  });

  it("persists a sportspress tenant from probe source config", async () => {
    const source = buildSportspressSource({
      slug: "demo-softball",
      origin: "https://example-softball.test",
      sport: "softball",
      tables: ["league-2026"],
      lists: [],
      seasons: [{ id: 1, slug: "2026", name: "2026" }],
      franchiseTeamNames: ["Eagles", "Foxes"]
    });

    const created = await createAdminTenant({
      slug: "demo-softball",
      name: "Demo Softball",
      shortName: "DEMO",
      hostnames: ["demo-softball.localhost"],
      adapter: "sportspress",
      sport: "softball",
      source
    });

    expect(created.adapter).toBe("sportspress");
    expect(created.sourceOrigin).toBe("https://example-softball.test");
    expect(resolveRequestLeague({ host: "demo-softball.localhost" }).slug).toBe("demo-softball");
    expect(getLeagueBySlug("demo-softball")?.source.origin).toBe("https://example-softball.test");
  });
});
