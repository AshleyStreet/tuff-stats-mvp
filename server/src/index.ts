import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { filterAndSortPlayers } from "./lib/query.js";
import {
  getPlayerProfile,
  getPlayers,
  getGame,
  getPlayerGameLog,
  getSchedule,
  getSeasons,
  getServiceStatus,
  refreshSeasonData,
  warmSeasonCaches
} from "./source.js";
import type { StatKey } from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
const adminToken = process.env.ADMIN_TOKEN?.trim() ?? "";

app.use(cors());
app.use(express.json());

function tokensMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function isAdmin(req: express.Request) {
  if (!adminToken) return false;
  const header = req.get("x-admin-token") ?? "";
  const bearer = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return tokensMatch(header, adminToken) || tokensMatch(bearer, adminToken);
}

app.get("/api/health", (_req, res) => {
  const status = getServiceStatus();
  res.json({
    ok: true,
    service: status.service,
    uptimeSeconds: status.uptimeSeconds,
    warm: status.warm.status,
    seasonsCached: status.cache.seasonsCached
  });
});

app.get("/api/status", (_req, res) => {
  res.json(getServiceStatus());
});

app.post("/api/admin/refresh", async (req, res) => {
  if (!adminToken) {
    return res.status(503).json({ error: "Admin refresh is not configured (set ADMIN_TOKEN)" });
  }
  if (!isAdmin(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const season = String(req.body?.season ?? req.query.season ?? "").trim();
    const result = await refreshSeasonData(season || undefined);
    return res.json({ ok: true, ...result, status: getServiceStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(502).json({ error: "Unable to refresh TUFF data", detail: message });
  }
});

app.get("/api/seasons", async (req, res) => {
  try {
    const force = req.query.refresh === "1";
    if (force && !isAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized — force refresh requires admin token" });
    }
    const seasons = await getSeasons(force);
    res.json({ seasons, defaultSeason: seasons[0]?.year ?? "2026" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: "Unable to load TUFF seasons", detail: message });
  }
});

app.get("/api/schedule", async (req, res) => {
  try {
    const season = String(req.query.season ?? "").trim();
    const force = req.query.refresh === "1";
    if (force && !isAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized — force refresh requires admin token" });
    }
    const data = await getSchedule(force, season || undefined);
    return res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(502).json({ error: "Unable to load TUFF schedule", detail: message });
  }
});

app.get("/api/games/:id", async (req, res) => {
  try {
    const season = String(req.query.season ?? "").trim();
    const data = await getGame(String(req.params.id), season || undefined);
    if (!data) return res.status(404).json({ error: "Game not found" });
    return res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(502).json({ error: "Unable to load box score", detail: message });
  }
});

app.get("/api/players", async (req, res) => {
  try {
    const force = req.query.refresh === "1";
    if (force && !isAdmin(req)) {
      return res.status(401).json({ error: "Unauthorized — force refresh requires admin token" });
    }
    const season = String(req.query.season ?? "").trim();
    const data = await getPlayers(force, season || undefined);
    const players = filterAndSortPlayers(data.players, {
      search: String(req.query.search ?? ""),
      team: String(req.query.team ?? ""),
      sort: String(req.query.sort ?? "totalPoints") as StatKey | "totalPoints",
      order: req.query.order === "asc" ? "asc" : "desc"
    });

    res.json({ ...data, players, meta: { ...data.meta, total: players.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: "Unable to load TUFF stats", detail: message });
  }
});

app.get("/api/players/:id/games", async (req, res) => {
  try {
    const season = String(req.query.season ?? "").trim();
    const data = await getPlayerGameLog(String(req.params.id), season || undefined);
    if (!data) return res.status(404).json({ error: "Player not found" });
    return res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(502).json({ error: "Unable to load game log", detail: message });
  }
});

app.get("/api/players/:id", async (req, res) => {
  try {
    const profile = await getPlayerProfile(String(req.params.id));
    if (!profile) return res.status(404).json({ error: "Player not found" });
    return res.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(502).json({ error: "Unable to load player profile", detail: message });
  }
});

app.get("/api/leaders", async (req, res) => {
  try {
    const season = String(req.query.season ?? "").trim();
    const data = await getPlayers(false, season || undefined);
    const stat = String(req.query.stat ?? "recTD") as StatKey;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 5), 1), 50);
    const leaders = [...data.players]
      .sort((a, b) => (b.stats[stat] ?? 0) - (a.stats[stat] ?? 0))
      .slice(0, limit);
    res.json({ stat, leaders, meta: data.meta });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: "Unable to load TUFF leaders", detail: message });
  }
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    return res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`TUFF API listening on http://localhost:${port}`);
  if (fs.existsSync(clientDist)) {
    console.log(`Serving web app from ${clientDist}`);
  }
  if (!adminToken) {
    console.log("ADMIN_TOKEN not set — /api/admin/refresh disabled");
  }
  void warmSeasonCaches()
    .then(({ warmed, failed }) => {
      console.log(`Season cache warm: ${warmed.length} ready${failed.length ? `, ${failed.length} failed` : ""}`);
    })
    .catch((error) => {
      console.warn("Season cache warm failed:", error instanceof Error ? error.message : error);
    });
});
