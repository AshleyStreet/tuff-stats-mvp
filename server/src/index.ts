import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filterAndSortPlayers } from "./lib/query.js";
import { getPlayerProfile, getPlayers, getSeasons, warmSeasonCaches } from "./source.js";
import type { StatKey } from "./types.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "tuff-stats-api" });
});

app.get("/api/seasons", async (req, res) => {
  try {
    const seasons = await getSeasons(req.query.refresh === "1");
    res.json({ seasons, defaultSeason: seasons[0]?.year ?? "2026" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: "Unable to load TUFF seasons", detail: message });
  }
});

app.get("/api/players", async (req, res) => {
  try {
    const season = String(req.query.season ?? "").trim();
    const data = await getPlayers(req.query.refresh === "1", season || undefined);
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
  void warmSeasonCaches()
    .then(({ warmed, failed }) => {
      console.log(`Season cache warm: ${warmed.length} ready${failed.length ? `, ${failed.length} failed` : ""}`);
    })
    .catch((error) => {
      console.warn("Season cache warm failed:", error instanceof Error ? error.message : error);
    });
});