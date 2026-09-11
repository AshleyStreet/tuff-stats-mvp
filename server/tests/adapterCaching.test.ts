import { jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { createCsvAdapter } from "../src/adapters/csv/index.js";
import { createSportspressAdapter } from "../src/adapters/sportspress/index.js";
import { CACHE_DIR } from "../src/lib/cache.js";
import { bushLeague } from "../src/leagues/bush.js";
import { cloneLeague } from "../src/leagues/store.js";
import type { League } from "../src/leagues/types.js";

/**
 * Stubs upstream so these run offline: the point is how often an adapter goes
 * to the league's website, not what the website says.
 */
function stubFetch(route: (url: string) => unknown) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    const body = route(url);
    return typeof body === "string"
      ? new Response(body, { status: 200 })
      : new Response(JSON.stringify(body ?? []), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    }
  };
}

function testLeague(id: string, patch: (league: League) => void): League {
  const league = cloneLeague(bushLeague);
  league.id = id;
  league.slug = id;
  league.source.origin = "https://sp.test";
  if (league.source.sportspress) league.source.sportspress.originEnv = undefined;
  patch(league);
  return league;
}

function clearCache(id: string) {
  fs.rmSync(path.join(CACHE_DIR, id), { recursive: true, force: true });
}

describe("sportspress adapter caching", () => {
  const id = "cache-test-sportspress";
  const league = testLeague(id, () => undefined);
  let upstream: ReturnType<typeof stubFetch>;
  let siteDown = false;

  beforeEach(() => {
    clearCache(id);
    siteDown = false;
    upstream = stubFetch((url) => {
      if (siteDown) return null;
      if (url.includes("/tables?slug=")) {
        return [
          {
            slug: "bush-league-2026",
            modified_gmt: "2026-06-01T00:00:00",
            data: {
              "0": { name: "Team" },
              "5": { name: "Rhinos", pos: 1, w: 3, l: 0 },
              "6": { name: "Lobbers", pos: 2, w: 1, l: 2 }
            }
          }
        ];
      }
      if (url.includes("/seasons?")) return [{ id: 11, slug: "2026", name: "2026" }];
      if (url.includes("/teams?")) return [{ id: 5, title: { rendered: "Rhinos" } }];
      return [];
    });
  });

  afterEach(() => {
    upstream.restore();
    clearCache(id);
  });

  it("serves repeat board reads from its snapshot instead of re-scraping the site", async () => {
    const adapter = createSportspressAdapter(league);

    const first = await adapter.getPlayers({ season: "2026" });
    expect(first.meta.standings?.map((row) => row.name)).toEqual(["Rhinos", "Lobbers"]);
    const afterFirst = upstream.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await adapter.getPlayers({ season: "2026" });
    await adapter.getPlayers({ season: "2026" });
    expect(upstream.calls.length).toBe(afterFirst);
  });

  it("turns a burst of cold reads into one scrape", async () => {
    const adapter = createSportspressAdapter(league);

    await Promise.all(Array.from({ length: 5 }, () => adapter.getPlayers({ season: "2026" })));

    expect(upstream.calls.filter((url) => url.includes("/tables?slug=")).length).toBe(1);
  });

  it("survives a restart on its disk snapshot", async () => {
    await createSportspressAdapter(league).getPlayers({ season: "2026" });
    const afterFirst = upstream.calls.length;

    const restarted = createSportspressAdapter(league);
    const board = await restarted.getPlayers({ season: "2026" });

    expect(board.meta.standings?.[0]?.name).toBe("Rhinos");
    expect(upstream.calls.length).toBe(afterFirst);
  });

  it("still goes to the site when an admin forces a refresh", async () => {
    const adapter = createSportspressAdapter(league);
    await adapter.getPlayers({ season: "2026" });
    const afterFirst = upstream.calls.length;

    await adapter.getPlayers({ season: "2026", force: true });
    expect(upstream.calls.length).toBeGreaterThan(afterFirst);
  });

  it("keeps the old board and its timestamp when a refresh gets nothing back", async () => {
    const adapter = createSportspressAdapter(league);
    const before = await adapter.getPlayers({ season: "2026" });

    siteDown = true;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await adapter.refresh("2026");
    const after = await adapter.getPlayers({ season: "2026" });

    // Standings still served, but not re-stamped as if they had just been fetched.
    expect(after.meta.standings?.map((row) => row.name)).toEqual(["Rhinos", "Lobbers"]);
    expect(after.meta.fetchedAt).toBe(before.meta.fetchedAt);
    expect(result).toEqual({ refreshed: [], failed: ["2026"] });
  });
});

describe("csv adapter caching", () => {
  const id = "cache-test-csv";
  const league = testLeague(id, (next) => {
    next.adapter = "csv";
    next.source.csv = { playersUrl: "https://sheet.test/players.csv" };
  });
  let upstream: ReturnType<typeof stubFetch>;

  beforeEach(() => {
    clearCache(id);
    upstream = stubFetch(() => "name,team,season,goals\nAlex,Rhinos,2026,4\n");
  });

  afterEach(() => {
    upstream.restore();
    clearCache(id);
  });

  it("downloads the sheet once for concurrent and repeat reads", async () => {
    const adapter = createCsvAdapter(league);

    const [board] = await Promise.all([
      adapter.getPlayers({ season: "2026" }),
      adapter.getSeasons(),
      adapter.getStandings({ season: "2026" })
    ]);
    await adapter.getPlayers({ season: "2026" });

    expect(board.players.map((player) => player.name)).toEqual(["Alex"]);
    expect(upstream.calls).toEqual(["https://sheet.test/players.csv"]);
  });
});
