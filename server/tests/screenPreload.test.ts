import { injectHeadTags, screenForRoute, screenPreloadTags, type ViteManifest } from "../src/lib/screenPreload.js";

const manifest: ViteManifest = {
  "index.html": { file: "assets/index-abc.js", css: ["assets/index-abc.css"], isEntry: true },
  "src/components/MarketingHome.tsx": {
    file: "assets/MarketingHome-m1.js",
    css: ["assets/MarketingHome-m1.css"],
    imports: ["index.html", "_shared-s1.js"]
  },
  "_shared-s1.js": { file: "assets/shared-s1.js", css: ["assets/shared-s1.css"], imports: ["index.html"] },
  "src/components/AdminDashboard.tsx": { file: "assets/AdminDashboard-a1.js", imports: ["index.html"] }
};

describe("screenForRoute", () => {
  it("matches main.tsx: admin first, then the marketing host, then captain tools", () => {
    expect(screenForRoute("/admin", true)).toBe("src/components/AdminDashboard.tsx");
    expect(screenForRoute("/admin/leads", false)).toBe("src/components/AdminDashboard.tsx");
    expect(screenForRoute("/", true)).toBe("src/components/MarketingHome.tsx");
    expect(screenForRoute("/captain-tools", false)).toBe("src/components/CaptainTools.tsx");
    expect(screenForRoute("/captain-tools", true)).toBe("src/components/MarketingHome.tsx");
  });

  it("leaves the stats board to the main bundle", () => {
    expect(screenForRoute("/", false)).toBeNull();
    expect(screenForRoute("/players/some-player", false)).toBeNull();
    expect(screenForRoute("/administrator", false)).toBeNull();
  });
});

describe("screenPreloadTags", () => {
  it("preloads a screen's chunk, its shared chunks, and their styles — never the entry", () => {
    const tags = screenPreloadTags(manifest, "src/components/MarketingHome.tsx");
    expect(tags).toContain('<link rel="modulepreload" crossorigin href="/assets/MarketingHome-m1.js">');
    expect(tags).toContain('<link rel="modulepreload" crossorigin href="/assets/shared-s1.js">');
    expect(tags).toContain('<link rel="stylesheet" href="/assets/MarketingHome-m1.css">');
    expect(tags).toContain('<link rel="stylesheet" href="/assets/shared-s1.css">');
    expect(tags).not.toContain("index-abc");
  });

  it("adds nothing without a manifest, a screen, or a matching chunk", () => {
    expect(screenPreloadTags(null, "src/components/MarketingHome.tsx")).toBe("");
    expect(screenPreloadTags(manifest, null)).toBe("");
    expect(screenPreloadTags(manifest, "src/components/CaptainTools.tsx")).toBe("");
  });
});

describe("injectHeadTags", () => {
  it("places tags before </head> and leaves the page alone when there are none", () => {
    const html = "<html><head><title>x</title></head><body></body></html>";
    expect(injectHeadTags(html, "<link>")).toBe("<html><head><title>x</title><link>\n</head><body></body></html>");
    expect(injectHeadTags(html, "")).toBe(html);
  });
});
