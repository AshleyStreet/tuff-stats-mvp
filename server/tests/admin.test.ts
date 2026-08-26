import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { getAdapter } from "../src/adapters/resolve.js";
import { createApp } from "../src/app.js";
import { createAdminTenant, updateAdminTenant } from "../src/leagues/admin.js";
import { getLeagueBySlug, getPublicLeague, reloadTenants, resolveRequestLeague } from "../src/leagues/registry.js";
import { tuffLeague } from "../src/leagues/tuff.js";

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

async function withServer(adminToken: string, fn: (url: string) => Promise<void>) {
  const app = createApp({ adminToken, clientDist: path.join(os.tmpdir(), "no-client-dist") });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listen address");
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

describe("admin tenant overlays", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withTempTenants().restore;
  });

  afterEach(() => {
    restore();
  });

  it("changes public branding without mutating the baked TUFF source", () => {
    const originalColor = tuffLeague.branding.primaryColor;
    const originalOrigin = tuffLeague.source.origin;

    const updated = updateAdminTenant("tuff", {
      branding: { primaryColor: "#112233" },
      name: "Toronto United Flag Football"
    });

    expect(updated.branding.primaryColor).toBe("#112233");
    expect(getPublicLeague("tuff").branding.primaryColor).toBe("#112233");
    expect(tuffLeague.branding.primaryColor).toBe(originalColor);
    expect(tuffLeague.source.origin).toBe(originalOrigin);
    expect(getLeagueBySlug("tuff")?.source.origin).toBe(originalOrigin);
    expect(getLeagueBySlug("tuff")?.adapter).toBe("tuff");
  });

  it("creates a fixture tenant that routes by hostname and is not TUFF players", async () => {
    const created = await createAdminTenant({
      slug: "river",
      name: "River Flag Football",
      shortName: "RIVER",
      hostnames: ["river.localhost"],
      branding: { primaryColor: "#224466", secondaryColor: "#eedd00" },
      franchiseTeamNames: ["Eagles", "Foxes"]
    });

    expect(created.adapter).toBe("fixture");
    expect(created.builtIn).toBe(false);
    expect(resolveRequestLeague({ host: "river.localhost:5173" }).slug).toBe("river");

    const league = getLeagueBySlug("river");
    expect(league).toBeTruthy();
    const players = await getAdapter(league!).getPlayers({ season: "2026" });
    expect(players.meta.source).toBe("fixture");
    expect(players.players.map((player) => player.name)).not.toContain("Colin H.");
    expect(players.players.map((player) => player.name)).not.toContain("Maya K.");
    expect(players.meta.teams).toEqual(["Eagles", "Foxes"]);
  });

  it("rejects a duplicate hostname and locked adapter changes", async () => {
    await expect(
      createAdminTenant({
        slug: "copycat",
        name: "Copycat",
        shortName: "COPY",
        hostnames: ["demo.localhost"]
      })
    ).rejects.toThrow(/already used/);

    expect(() => updateAdminTenant("tuff", { adapter: "fixture" })).toThrow(/Cannot change adapter/);
  });
});

describe("admin HTTP auth", () => {
  it("returns 401 when the admin token is missing", async () => {
    await withServer("secret-token", async (url) => {
      const response = await fetch(`${url}/api/admin/tenants`);
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body.error).toMatch(/Unauthorized/i);
    });
  });

  it("returns 503 when admin is not configured", async () => {
    await withServer("", async (url) => {
      const response = await fetch(`${url}/api/admin/tenants`);
      expect(response.status).toBe(503);
    });
  });
});
