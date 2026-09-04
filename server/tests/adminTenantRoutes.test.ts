import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { createAdminTenant, listAdminTenants } from "../src/leagues/admin.js";
import { mergeTenantRecord } from "../src/leagues/store.js";
import { getLeagueBySlug, reloadTenants } from "../src/leagues/registry.js";

const PLATFORM_TOKEN = "platform-secret";

function withTempTenants() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "afterwhistle-tenants-"));
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

async function withServer(fn: (port: number) => Promise<void>) {
  const app = createApp({ adminToken: PLATFORM_TOKEN, clientDist: path.join(os.tmpdir(), "no-client-dist") });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listen address");
  try {
    await fn(address.port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

/** node:http rather than fetch() — lets us set an arbitrary Host header. */
function request(
  port: number,
  method: string,
  urlPath: string,
  opts: { token?: string; host?: string; body?: unknown } = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts.token) headers["x-admin-token"] = opts.token;
    if (opts.host) headers.Host = opts.host;
    const payload = opts.body != null ? JSON.stringify(opts.body) : undefined;
    if (payload) headers["Content-Type"] = "application/json";
    const req = http.request({ host: "127.0.0.1", port, method, path: urlPath, headers }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("slug-scoped admin tenant routes", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withTempTenants().restore;
  });

  afterEach(() => {
    restore();
  });

  describe("GET /api/admin/tenants/:slug/status", () => {
    it("requires the platform token", async () => {
      await withServer(async (port) => {
        const res = await request(port, "GET", "/api/admin/tenants/harbor/status");
        expect(res.status).toBe(401);
      });
    });

    it("404s for an unknown slug", async () => {
      await withServer(async (port) => {
        const res = await request(port, "GET", "/api/admin/tenants/nope/status", { token: PLATFORM_TOKEN });
        expect(res.status).toBe(404);
      });
    });

    it("returns the tenant's adapter status regardless of the request Host", async () => {
      await withServer(async (port) => {
        const res = await request(port, "GET", "/api/admin/tenants/harbor/status", {
          token: PLATFORM_TOKEN,
          host: "stats.playtuff.ca"
        });
        expect(res.status).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.service).toBe("harbor-stats-api");
      });
    });
  });

  describe("POST /api/admin/tenants/:slug/refresh", () => {
    it("targets the tenant by slug, not by the request Host", async () => {
      await withServer(async (port) => {
        // Host says TUFF, but we're asking to refresh Harbor (local fixture, fast) — must not
        // fall back to refreshing whatever the Host resolves to.
        const res = await request(port, "POST", "/api/admin/tenants/harbor/refresh", {
          token: PLATFORM_TOKEN,
          host: "stats.playtuff.ca"
        });
        expect(res.status).not.toBe(401);
        const body = JSON.parse(res.body);
        expect(body.status.service).toBe("harbor-stats-api");
      });
    });

    it("still enforces the per-tenant refresh token", async () => {
      mergeTenantRecord("harbor", "overlay", { refreshToken: "harbor-secret" });
      reloadTenants();

      await withServer(async (port) => {
        const withPlatformToken = await request(port, "POST", "/api/admin/tenants/harbor/refresh", {
          token: PLATFORM_TOKEN
        });
        expect(withPlatformToken.status).toBe(401);

        const withOwnToken = await request(port, "POST", "/api/admin/tenants/harbor/refresh", {
          token: "harbor-secret"
        });
        expect(withOwnToken.status).not.toBe(401);
      });
    });

    it("404s for an unknown slug", async () => {
      await withServer(async (port) => {
        const res = await request(port, "POST", "/api/admin/tenants/nope/refresh", { token: PLATFORM_TOKEN });
        expect(res.status).toBe(404);
      });
    });
  });

  describe("DELETE /api/admin/tenants/:slug", () => {
    it("requires the platform token", async () => {
      await withServer(async (port) => {
        const res = await request(port, "DELETE", "/api/admin/tenants/harbor");
        expect(res.status).toBe(401);
      });
    });

    it("fully removes a created tenant", async () => {
      await createAdminTenant({
        slug: "riverdale",
        name: "Riverdale Flag Football",
        shortName: "RIVERDALE",
        hostnames: ["riverdale.localhost"]
      });
      expect(listAdminTenants().map((t) => t.slug)).toContain("riverdale");

      await withServer(async (port) => {
        const res = await request(port, "DELETE", "/api/admin/tenants/riverdale", { token: PLATFORM_TOKEN });
        expect(res.status).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ deleted: true, reset: false });
      });

      expect(getLeagueBySlug("riverdale")).toBeUndefined();
      expect(listAdminTenants().map((t) => t.slug)).not.toContain("riverdale");
    });

    it("resets a built-in tenant's overlay instead of deleting it", async () => {
      mergeTenantRecord("harbor", "overlay", { whiteLabel: true, refreshToken: "harbor-secret" });
      reloadTenants();
      expect(getLeagueBySlug("harbor")?.whiteLabel).toBe(true);

      await withServer(async (port) => {
        const res = await request(port, "DELETE", "/api/admin/tenants/harbor", { token: PLATFORM_TOKEN });
        expect(res.status).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.deleted).toBe(false);
        expect(body.reset).toBe(true);
        expect(body.tenant.slug).toBe("harbor");
        expect(body.tenant.whiteLabel).toBe(false);
        expect(body.tenant.hasRefreshToken).toBe(false);
      });

      // Harbor is still a tenant — just back to its code-defined defaults.
      expect(getLeagueBySlug("harbor")).toBeTruthy();
      expect(getLeagueBySlug("harbor")?.whiteLabel).toBeFalsy();
      expect(getLeagueBySlug("harbor")?.refreshToken).toBeUndefined();
    });

    it("is a no-op when a built-in tenant has no overlay to reset", async () => {
      await withServer(async (port) => {
        const res = await request(port, "DELETE", "/api/admin/tenants/harbor", { token: PLATFORM_TOKEN });
        expect(res.status).toBe(200);
        expect(JSON.parse(res.body).reset).toBe(false);
      });
    });

    it("404s deleting a slug that doesn't exist", async () => {
      await withServer(async (port) => {
        const res = await request(port, "DELETE", "/api/admin/tenants/nope", { token: PLATFORM_TOKEN });
        expect(res.status).toBe(404);
      });
    });
  });
});
