import { getAdapter } from "../src/adapters/resolve.js";
import { bushLeague } from "../src/leagues/bush.js";
import { harborLeague } from "../src/leagues/harbor.js";
import { passionLeague } from "../src/leagues/passion.js";
import { tuffLeague } from "../src/leagues/tuff.js";

describe("adapter registry", () => {
  it("resolves the TUFF league to the tuff adapter", () => {
    const adapter = getAdapter(tuffLeague);
    expect(adapter.leagueId).toBe("tuff");
    expect(adapter.status().service).toBe(tuffLeague.serviceName);
  });

  it("uses the default league when none is passed", () => {
    expect(getAdapter().leagueId).toBe("tuff");
  });

  it("resolves Harbor to the fixture adapter", () => {
    expect(getAdapter(harborLeague).leagueId).toBe("harbor");
  });

  it("resolves Bush and Passion to the sportspress adapter", () => {
    expect(getAdapter(bushLeague).leagueId).toBe("bush");
    expect(getAdapter(passionLeague).leagueId).toBe("passion");
    expect(getAdapter(passionLeague).status().service).toBe(passionLeague.serviceName);
  });
});
