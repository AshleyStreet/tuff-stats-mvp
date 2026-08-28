import { injectPageSeo, leagueSeo, marketingSeo, renderRobotsTxt, renderSitemapXml } from "../src/lib/pageSeo.js";

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

  it("renders sitemap for marketing host", () => {
    const xml = renderSitemapXml("https://afterwhistle.ca", "afterwhistle.ca");
    expect(xml).toContain("<loc>https://afterwhistle.ca/</loc>");
  });
});
