import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { mergeTenantRecord } from "../src/leagues/store.js";
import { reloadTenants } from "../src/leagues/registry.js";

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

function refresh(port: number, slug: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers["x-admin-token"] = token;
  return fetch(`http://127.0.0.1:${port}/api/admin/refresh?league=${slug}`, { method: "POST", headers });
}

function seasons(port: number, slug: string, opts: { refresh?: boolean; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers["x-admin-token"] = opts.token;
  const query = opts.refresh ? "&refresh=1" : "";
  return fetch(`http://127.0.0.1:${port}/api/seasons?league=${slug}${query}`, { headers });
}

describe("per-tenant admin refresh tokens", () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withTempTenants().restore;
  });

  afterEach(() => {
    restore();
  });

  it("lets the platform token refresh a tenant with no refreshToken configured (legacy fallback)", async () => {
    // Harbor (fixture adapter) rather than TUFF — its refresh() is local, not a live network scrape.
    await withServer(async (port) => {
      const res = await refresh(port, "harbor", PLATFORM_TOKEN);
      expect(res.status).not.toBe(401);
    });
  });

  it("rejects an unauthenticated refresh for a tenant with no refreshToken configured", async () => {
    await withServer(async (port) => {
      const res = await refresh(port, "harbor");
      expect(res.status).toBe(401);
    });
  });

  it("rejects the platform token, and accepts only its own token, once a tenant has a refreshToken", async () => {
    mergeTenantRecord("harbor", "overlay", { refreshToken: "harbor-secret" });
    reloadTenants();

    await withServer(async (port) => {
      const withPlatformToken = await refresh(port, "harbor", PLATFORM_TOKEN);
      expect(withPlatformToken.status).toBe(401);

      const withNoToken = await refresh(port, "harbor");
      expect(withNoToken.status).toBe(401);

      const withOwnToken = await refresh(port, "harbor", "harbor-secret");
      expect(withOwnToken.status).not.toBe(401);
    });
  });

  it("applies the same per-tenant rule to the refresh=1 bypass on GET routes", async () => {
    mergeTenantRecord("harbor", "overlay", { refreshToken: "harbor-secret" });
    reloadTenants();

    await withServer(async (port) => {
      const plainRequest = await seasons(port, "harbor");
      expect(plainRequest.status).toBe(200);

      const forcedWithPlatformToken = await seasons(port, "harbor", { refresh: true, token: PLATFORM_TOKEN });
      expect(forcedWithPlatformToken.status).toBe(401);

      const forcedWithOwnToken = await seasons(port, "harbor", { refresh: true, token: "harbor-secret" });
      expect(forcedWithOwnToken.status).not.toBe(401);
    });
  });
});
