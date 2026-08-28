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
