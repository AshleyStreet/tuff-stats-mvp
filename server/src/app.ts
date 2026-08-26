import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getAdapter } from "./adapters/resolve.js";
import { toLeagueRef, type StatKey } from "./domain/types.js";
import { AdminError, createAdminTenant, listAdminTenants, probeAdminSourceUrl, updateAdminTenant } from "./leagues/admin.js";
import { resolveRequestLeague, toPublicLeague } from "./leagues/registry.js";
import type { League } from "./leagues/types.js";
import { filterAndSortPlayers } from "./lib/query.js";
import type { LeagueDataAdapter } from "./adapters/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function tokensMatch(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function createApp(options: { adminToken?: string; clientDist?: string } = {}) {
  const adminToken = (options.adminToken ?? process.env.ADMIN_TOKEN ?? "").trim();
  const clientDist = options.clientDist ?? path.resolve(__dirname, "../../client/dist");
  const app = express();

  if (process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }

  app.use(cors());
  app.use(express.json());

  function tenant(req: express.Request): { league: League; adapter: LeagueDataAdapter } {
    const league = resolveRequestLeague({
      host: req.get("host"),
      forwardedHost: req.get("x-forwarded-host"),
      slug: String(req.query.league ?? "")
    });
    return { league, adapter: getAdapter(league) };
  }

  function isAdmin(req: express.Request) {
    if (!adminToken) return false;
    const header = req.get("x-admin-token") ?? "";
    const bearer = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    return tokensMatch(header, adminToken) || tokensMatch(bearer, adminToken);
  }

  function requireAdmin(req: express.Request, res: express.Response) {
    if (!adminToken) {
      res.status(503).json({ error: "Admin is not configured (set ADMIN_TOKEN)" });
      return false;
    }
    if (!isAdmin(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

  app.get("/api/league", (req, res) => {
    res.json(toPublicLeague(tenant(req).league));
  });

  app.get("/api/health", (req, res) => {
    const status = tenant(req).adapter.status();
    res.json({
      ok: true,
      service: status.service,
      uptimeSeconds: status.uptimeSeconds,
      warm: status.warm.status,
      seasonsCached: status.cache.seasonsCached
    });
  });

  app.get("/api/status", (req, res) => {
    res.json(tenant(req).adapter.status());
  });

  app.get("/api/admin/tenants", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ tenants: listAdminTenants() });
  });

  app.post("/api/admin/tenants", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const tenantRecord = await createAdminTenant(req.body ?? {});
      return res.status(201).json({ tenant: tenantRecord });
    } catch (error) {
      return sendAdminError(res, error);
    }
  });

  app.post("/api/admin/probe", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const probe = await probeAdminSourceUrl(String(req.body?.url ?? ""));
      return res.json({ probe });
    } catch (error) {
      return sendAdminError(res, error);
    }
  });

  app.put("/api/admin/tenants/:slug", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const tenantRecord = updateAdminTenant(String(req.params.slug), req.body ?? {});
      return res.json({ tenant: tenantRecord });
    } catch (error) {
      return sendAdminError(res, error);
    }
  });

  app.post("/api/admin/refresh", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    try {
      const { adapter } = tenant(req);
      const season = String(req.body?.season ?? req.query.season ?? "").trim();
      const result = await adapter.refresh(season || undefined);
      return res.json({ ok: true, ...result, status: adapter.status() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(502).json({ error: "Unable to refresh source data", detail: message });
    }
  });

  app.get("/api/seasons", async (req, res) => {
    try {
      const force = req.query.refresh === "1";
      if (force && !isAdmin(req)) {
        return res.status(401).json({ error: "Unauthorized — force refresh requires admin token" });
      }
      const { league, adapter } = tenant(req);
      const seasons = await adapter.getSeasons({ force });
      const publicSeason = league.publicSeason;
      const defaultSeason = seasons.some((season) => season.year === publicSeason)
        ? publicSeason
        : (seasons[0]?.year ?? publicSeason);
      res.json({ seasons, defaultSeason, league: toLeagueRef(league) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(502).json({ error: "Unable to load seasons", detail: message });
    }
  });

  app.get("/api/schedule", async (req, res) => {
    try {
      const season = String(req.query.season ?? "").trim();
      const force = req.query.refresh === "1";
      if (force && !isAdmin(req)) {
        return res.status(401).json({ error: "Unauthorized — force refresh requires admin token" });
      }
      const data = await tenant(req).adapter.getSchedule({ force, season: season || undefined });
      return res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(502).json({ error: "Unable to load schedule", detail: message });
    }
  });

  app.get("/api/games/:id", async (req, res) => {
    try {
      const season = String(req.query.season ?? "").trim();
      const data = await tenant(req).adapter.getGame(String(req.params.id), { season: season || undefined });
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
      const data = await tenant(req).adapter.getPlayers({ force, season: season || undefined });
      const players = filterAndSortPlayers(data.players, {
        search: String(req.query.search ?? ""),
        team: String(req.query.team ?? ""),
        sort: String(req.query.sort ?? "totalPoints") as StatKey | "totalPoints",
        order: req.query.order === "asc" ? "asc" : "desc"
      });

      res.json({ ...data, players, meta: { ...data.meta, total: players.length } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(502).json({ error: "Unable to load stats", detail: message });
    }
  });

  app.get("/api/players/:id/games", async (req, res) => {
    try {
      const season = String(req.query.season ?? "").trim();
      const data = await tenant(req).adapter.getPlayerGameLog(String(req.params.id), { season: season || undefined });
      if (!data) return res.status(404).json({ error: "Player not found" });
      return res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(502).json({ error: "Unable to load game log", detail: message });
    }
  });

  app.get("/api/players/:id", async (req, res) => {
    try {
      const profile = await tenant(req).adapter.getPlayerProfile(String(req.params.id));
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
      const data = await tenant(req).adapter.getPlayers({ season: season || undefined });
      const stat = String(req.query.stat ?? "recTD") as StatKey;
      const limit = Math.min(Math.max(Number(req.query.limit ?? 5), 1), 50);
      const leaders = [...data.players]
        .sort((a, b) => (b.stats[stat] ?? 0) - (a.stats[stat] ?? 0))
        .slice(0, limit);
      res.json({ stat, leaders, meta: data.meta });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(502).json({ error: "Unable to load leaders", detail: message });
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

  return app;
}

function sendAdminError(res: express.Response, error: unknown) {
  if (error instanceof AdminError) {
    return res.status(error.status).json({ error: error.message });
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return res.status(500).json({ error: message });
}
