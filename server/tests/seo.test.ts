import {
  canonicalUrl,
  gameSeo,
  injectPageSeo,
  leagueSeo,
  leagueTabSeo,
  marketingSeo,
  playerSeo,
  renderRobotsTxt,
  renderSitemapXml,
  teamSeo
} from "../src/lib/pageSeo.js";
import { resolveLeaguePageSeo } from "../src/lib/resolvePageSeo.js";
import type { League } from "../src/leagues/types.js";
import type { LeagueDataAdapter } from "../src/adapters/types.js";

const html = `<!doctype html><html><head><title>Old</title></head><body></body></html>`;

describe("pageSeo", () => {
  it("inlines title, description, and Open Graph tags", () => {
    const out = injectPageSeo(
      html,
      marketingSeo("https://afterwhistle.ca")
    );
    expect(out).not.toContain("<title>Old</title>");
    expect(out).toContain("<title>Afterwhistle · League stats boards</title>");
    expect(out).toContain('property="og:title"');
    expect(out).toContain('name="description"');
    expect(out).toContain('rel="canonical"');
    expect(out).toContain("application/ld+json");
  });

  it("uses league branding for og:image when absolute", () => {
    const out = injectPageSeo(
      html,
      leagueSeo(
        {
          slug: "tuff",
          name: "Toronto United Flag Football",
          shortName: "TUFF",
          copy: { documentTitle: "TUFF Stats · Toronto Flag Football" }
        } as never,
        "https://tuff.afterwhistle.ca",
        "2026"
      )
    );
    expect(out).toContain("TUFF Stats");
    expect(out).toContain("2026 season");
  });

  it("renders robots.txt with sitemap", () => {
    const body = renderRobotsTxt("https://tuff.afterwhistle.ca");
    expect(body).toContain("Sitemap: https://tuff.afterwhistle.ca/sitemap.xml");
    expect(body).toContain("Disallow: /admin");
  });

  it("renders sitemap for marketing host", async () => {
    const xml = await renderSitemapXml("https://afterwhistle.ca", "afterwhistle.ca");
    expect(xml).toContain("<loc>https://afterwhistle.ca/</loc>");
  });

  it("builds canonical URLs with season query", () => {
    expect(canonicalUrl("https://tuff.afterwhistle.ca", "/players/dave-s-7588", "2026")).toBe(
      "https://tuff.afterwhistle.ca/players/dave-s-7588?season=2026"
    );
  });

  it("builds player and game SEO tags", () => {
    const league = {
      slug: "tuff",
      name: "Toronto United Flag Football",
      shortName: "TUFF",
      copy: { documentTitle: "TUFF Stats · Toronto Flag Football" },
      branding: { logo: "https://example.test/logo.png", logoAlt: "TUFF" }
    } as never;

    const player = playerSeo(
      league,
      {
        id: "dave-s-7588",
        sourceId: "7588",
        name: "Dave S.",
        currentTeam: "Wildcats",
        teams: ["Wildcats"],
        seasons: [
          {
            season: "2026",
            team: "Wildcats",
            stats: {} as never,
            derived: { totalPoints: 13, totalTouchdowns: 2, receptionsPerGame: 0, receivingTouchdownsPerGame: 0 }
          }
        ],
        career: {
          seasonsPlayed: 1,
          stats: {} as never,
          derived: { totalPoints: 13, totalTouchdowns: 2, receptionsPerGame: 0, receivingTouchdownsPerGame: 0 }
        },
        meta: { fetchedAt: "2026-01-01T00:00:00.000Z" }
      },
      "https://tuff.afterwhistle.ca",
      "/players/dave-s-7588",
      "2026",
      "https://example.test/wildcats.png"
    );
    expect(player.title).toContain("Dave S.");
    expect(player.canonical).toContain("season=2026");

    const game = gameSeo(
      league,
      {
        id: 7550,
        date: "2026-08-09T13:40:00",
        status: "final",
        title: "Cobras vs Wildcats",
        teams: [
          { id: 1, name: "Cobras", score: 28, logoUrl: "https://example.test/cobras.png" },
          { id: 2, name: "Wildcats", score: 19 }
        ]
      },
      "https://tuff.afterwhistle.ca",
      "/schedule/7550",
      "2026"
    );
    expect(game.title).toContain("Cobras 28, Wildcats 19");

    const team = teamSeo(
      league,
      "Wildcats",
      "https://tuff.afterwhistle.ca",
      "/teams/wildcats",
      "2026",
      { name: "Wildcats", wins: 8, losses: 2, ties: 0, pct: 0.8, pointsFor: 100, pointsAgainst: 80, netPoints: 20, standingsPoints: 0 },
      "https://example.test/wildcats.png"
    );
    expect(team.title).toContain("Wildcats");

    const tab = leagueTabSeo(league, "schedule", "https://tuff.afterwhistle.ca", "/schedule", "2026");
    expect(tab.title).toContain("Schedule");
  });
});

describe("resolveLeaguePageSeo", () => {
  it("canonicalizes team names against the requesting tenant's own aliases, not TUFF's", async () => {
    // Neither "Sea Rhinos" nor "Bay Rhinos" is this tenant's alias for the other — they're
    // two distinct franchises that both happen to end in "Rhinos", a TUFF team name. If team
    // SEO ever falls back to TUFF's alias list, both collapse onto "Rhinos" and the standings
    // lookup silently returns whichever team happens to come first.
    const league = {
      id: "riverdale",
      slug: "riverdale",
      name: "Riverdale Flag Football",
      shortName: "RIVERDALE",
      sport: "flag-football",
      hostnames: ["riverdale.localhost"],
      serviceName: "riverdale-stats-api",
      branding: { logo: "", logoAlt: "Riverdale", primaryColor: "#000000", secondaryColor: "#ffffff" },
      publicSeason: "2026",
      copy: {
        documentTitle: "Riverdale Stats",
        tagline: "RIVERDALE",
        loadErrorTitle: "Couldn’t load Riverdale.",
        profileLinkLabel: "Open original Riverdale profile",
        recapLinkLabel: "Open original Riverdale recap",
        htmlSourceLabel: "Riverdale table"
      },
      sportIcon: "football",
      presentation: {} as never,
      adapter: "fixture",
      source: { franchiseTeamNames: ["Sea Rhinos", "Bay Rhinos"] } as never
    } as League;

    const adapter: LeagueDataAdapter = {
      leagueId: "riverdale",
      getSeasons: async () => [],
      getPlayers: async () => ({
        players: [],
        meta: {
          source: "fixture",
          fetchedAt: "2026-01-01T00:00:00.000Z",
          total: 0,
          teams: ["Sea Rhinos", "Bay Rhinos"],
          season: "2026",
          seasonLabel: "2026 Season",
          standings: [
            { name: "Sea Rhinos", wins: 10, losses: 0, ties: 0, pct: 1, pointsFor: 0, pointsAgainst: 0, netPoints: 0, standingsPoints: 0 },
            { name: "Bay Rhinos", wins: 0, losses: 10, ties: 0, pct: 0, pointsFor: 0, pointsAgainst: 0, netPoints: 0, standingsPoints: 0 }
          ]
        }
      }),
      getStandings: async () => [],
      getSchedule: async () => ({ season: "2026", games: [], meta: { fetchedAt: "", total: 0 } }),
      getGame: async () => null,
      getPlayerProfile: async () => null,
      getPlayerGameLog: async () => null,
      refresh: async () => ({ refreshed: [] }) as never,
      warm: async () => ({ warmed: [], failed: [] }),
      status: () => ({}) as never
    };

    const seo = await resolveLeaguePageSeo(league, adapter, "https://riverdale.afterwhistle.ca", "/teams/bay-rhinos");
    expect(seo.description).toContain("0-10");
    expect(seo.description).not.toContain("10-0");
  });
});
