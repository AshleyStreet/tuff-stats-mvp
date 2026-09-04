import http from "node:http";
import os from "node:os";
import path from "node:path";
import { jest } from "@jest/globals";
import { createApp } from "../src/app.js";

async function withServer(fn: (port: number) => Promise<void>) {
  const app = createApp({ clientDist: path.join(os.tmpdir(), "no-client-dist") });
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

/** fetch()/undici refuse to let callers override the Host header — use node:http directly. */
function getWithHost(port: number, hostHeader: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: "/api/league", headers: { Host: hostHeader } },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describe("unresolved production host warning", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("warns once per unrecognized host in production but still serves the default tenant", async () => {
    process.env.NODE_ENV = "production";
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await withServer(async (port) => {
      const first = await getWithHost(port, "stray.example.com");
      expect(first.status).toBe(200);
      expect(JSON.parse(first.body).slug).toBe("tuff");

      await getWithHost(port, "stray.example.com");
    });

    const unresolvedWarnings = warn.mock.calls.filter((call) => String(call[0]).includes("stray.example.com"));
    expect(unresolvedWarnings).toHaveLength(1);
    warn.mockRestore();
  });

  it("does not warn for a recognized host", async () => {
    process.env.NODE_ENV = "production";
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await withServer(async (port) => {
      const res = await getWithHost(port, "stats.playtuff.ca");
      expect(res.status).toBe(200);
    });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
