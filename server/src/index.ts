import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPlayers } from "./source.js";
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

app.get("/api/players", async (req, res) => {
  try {
    const data = await getPlayers(req.query.refresh === "1");
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const sort = String(req.query.sort ?? "totalPoints") as StatKey | "totalPoints";
    const order = req.query.order === "asc" ? 1 : -1;

    let players = search
      ? data.players.filter((player) => player.name.toLowerCase().includes(search))
      : [...data.players];

    players.sort((a, b) => {
      const aValue = sort === "totalPoints" ? a.derived.totalPoints : a.stats[sort] ?? 0;
      const bValue = sort === "totalPoints" ? b.derived.totalPoints : b.stats[sort] ?? 0;
      return (aValue - bValue) * order || a.name.localeCompare(b.name);
    });

    res.json({ ...data, players, meta: { ...data.meta, total: players.length } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: "Unable to load TUFF stats", detail: message });
  }
});

app.get("/api/players/:id", async (req, res) => {
  try {
    const data = await getPlayers();
    const player = data.players.find((candidate) => candidate.id === req.params.id);
    if (!player) return res.status(404).json({ error: "Player not found" });
    return res.json(player);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(502).json({ error: "Unable to load TUFF stats", detail: message });
  }
});

app.get("/api/leaders", async (req, res) => {
  try {
    const data = await getPlayers();
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
});
