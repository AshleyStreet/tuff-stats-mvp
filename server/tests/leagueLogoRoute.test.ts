import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";

async function withServer(logoFetch: typeof fetch, fn: (port: number) => Promise<void>) {
  const app = createApp({ clientDist: path.join(os.tmpdir(), "no-client-dist"), logoFetch });
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

describe("GET /api/league-logo", () => {
  it("serves the league's own logo same-origin", async () => {
    const requested: string[] = [];
    const logoFetch = (async (input: string | URL | Request) => {
      requested.push(String(input));
      return new Response(Buffer.from([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
    }) as typeof fetch;

    await withServer(logoFetch, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/league-logo`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("image/png");
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    });
    expect(requested).toEqual(["https://www.playtuff.ca/wp-content/uploads/2022/03/TUFF_logo_v2.png"]);
  });

  it("reports a failed upstream fetch as a bad gateway", async () => {
    const logoFetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;

    await withServer(logoFetch, async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/league-logo`);
      expect(response.status).toBe(502);
    });
  });
});
