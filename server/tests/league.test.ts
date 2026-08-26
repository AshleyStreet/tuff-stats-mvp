import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { tuffLeague } from "../src/leagues/tuff.js";
import { bushLeague } from "../src/leagues/bush.js";
import { getLeagueByHostname, getLeagueBySlug, getPublicLeague, reloadTenants, resolveLeague } from "../src/leagues/registry.js";

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

describe("league registry", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withTempTenants().restore;
  });

  afterEach(() => {
    restore();
  });
  it("resolves the default slug to TUFF", () => {
    const league = resolveLeague();
    expect(league.slug).toBe("tuff");
    expect(league.slug).toBe("tuff");
    expect(league.source.origin).toBe(tuffLeague.source.origin);
  });

  it("looks up TUFF by slug", () => {
    expect(getLeagueBySlug("tuff")?.id).toBe("tuff");
    expect(getLeagueBySlug("TUFF")?.shortName).toBe("TUFF");
  });

  it("falls back to TUFF for unknown slugs", () => {
    expect(resolveLeague("nope").slug).toBe("tuff");
    expect(getLeagueBySlug("nope")).toBeUndefined();
  });

  it("matches TUFF by hostname", () => {
    expect(getLeagueByHostname("stats.playtuff.ca")?.slug).toBe("tuff");
    expect(getLeagueByHostname("STATS.PLAYTUFF.CA:443")?.slug).toBe("tuff");
    expect(getLeagueByHostname("other.example")).toBeUndefined();
  });

  it("matches Harbor by demo hostnames", () => {
    expect(getLeagueByHostname("demo.localhost")?.slug).toBe("harbor");
    expect(getLeagueByHostname("anotherleague.localhost:5173")?.slug).toBe("harbor");
    expect(getLeagueByHostname("localhost")).toBeUndefined();
  });

  it("matches Bush League by production and dev hostnames", () => {
    expect(getLeagueByHostname("bush.localhost")?.slug).toBe("bush");
    expect(getLeagueByHostname("www.bushleaguetoronto.ca")?.slug).toBe("bush");
    expect(getLeagueByHostname("bushleaguetoronto.ca")?.slug).toBe("bush");
    expect(getLeagueByHostname("www.bushleaguetoronto.ca:443")?.slug).toBe("bush");
  });

  it("matches Passion Soccer by production and dev hostnames", () => {
    expect(getLeagueByHostname("passion.localhost")?.slug).toBe("passion");
    expect(getLeagueByHostname("passion-soccer.com")?.slug).toBe("passion");
    expect(getLeagueByHostname("www.passion-soccer.com")?.slug).toBe("passion");
  });

  it("exposes Bush public league with softball presentation", () => {
    const pub = getPublicLeague("bush");
    expect(pub.slug).toBe("bush");
    expect(pub.shortName).toBe("BUSH");
    expect(pub.sport).toBe("softball");
    expect(pub.sportIcon).toBe("softball");
    expect(pub.presentation.sortOptions[0]?.key).toBe("r");
    expect(pub.franchiseTeamNames).toContain("Diamond Dogs");
    expect(bushLeague.source.origin).toContain("bushleaguetoronto.ca");
  });

  it("exposes Passion public league with soccer presentation", () => {
    const pub = getPublicLeague("passion");
    expect(pub.slug).toBe("passion");
    expect(pub.sport).toBe("soccer");
    expect(pub.sportIcon).toBe("soccer");
    expect(pub.presentation.sortOptions[0]?.key).toBe("goals");
    expect(pub.publicSeason).toBe("d2-ete-2026");
  });

  it("exposes a client-safe public league without source internals", () => {
    const pub = getPublicLeague("tuff");
    expect(pub.slug).toBe("tuff");
    expect(pub.shortName).toBe("TUFF");
    expect(pub.name).toBe("Toronto United Flag Football");
    expect(pub.publicSeason).toBe("2026");
    expect(pub.branding.logo).toContain("TUFF_logo");
    expect(pub.branding.primaryColor).toBe("#e31b23");
    expect(pub.branding.secondaryColor).toBe("#d7b56d");
    expect(pub.franchiseTeamNames).toContain("Wildcats");
    expect(pub).not.toHaveProperty("source");
    expect(pub).not.toHaveProperty("adapter");
    expect(pub).not.toHaveProperty("hostnames");
  });
});
