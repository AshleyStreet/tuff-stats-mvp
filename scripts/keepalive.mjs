const base = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL;

if (!base) {
  console.error("KEEPALIVE_URL or RENDER_EXTERNAL_URL is required");
  process.exit(1);
}

const url = new URL("/api/health", base).href;

const response = await fetch(url, {
  headers: { "User-Agent": "TUFF-Stats-Keepalive/0.1" },
  signal: AbortSignal.timeout(20000)
});

if (!response.ok) {
  console.error(`Keepalive failed: ${response.status} ${url}`);
  process.exit(1);
}

const body = await response.json().catch(() => null);
console.log(`Keepalive ok: ${url}`, body?.warm ? `warm=${body.warm}` : "");
