import { injectPageBootstrap } from "../src/lib/pageBootstrap.js";

describe("injectPageBootstrap", () => {
  it("inlines bootstrap JSON before </head>", () => {
    const html = "<!doctype html><html><head><title>x</title></head><body></body></html>";
    const out = injectPageBootstrap(html, {
      league: { slug: "tuff", name: "TUFF" } as never,
      seasons: { seasons: [{ year: "2026", label: "2026 Season", slug: "" }], defaultSeason: "2026" },
      players: { players: [], meta: { season: "2026" } } as never
    });

    expect(out).toContain('id="aw-bootstrap"');
    expect(out).toContain('"slug":"tuff"');
  });
});
