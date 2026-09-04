import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getAdapter } from "./adapters/resolve.js";
import { toLeagueRef, type StatKey } from "./domain/types.js";
import {
  AdminError,
  createAdminTenant,
  deleteAdminTenant,
  listAdminTenants,
  probeAdminSourceUrl,
  updateAdminTenant
} from "./leagues/admin.js";
import { refreshTokenFor } from "./leagues/adminTokens.js";
import { getLeagueByHostname, getLeagueBySlug, resolveRequestLeague, toPublicLeague } from "./leagues/registry.js";
import type { League } from "./leagues/types.js";
import { filterAndSortPlayers } from "./lib/query.js";
import { isMarketingHost } from "./lib/marketingHosts.js";
import { injectPageBootstrap, type PageBootstrap } from "./lib/pageBootstrap.js";
import {
  injectPageSeo,
  leagueSeo,
  marketingSeo,
  renderRobotsTxt,
  renderSitemapXml,
  requestOrigin
} from "./lib/pageSeo.js";
import { buildSitemapUrls, resolveLeaguePageSeo } from "./lib/resolvePageSeo.js";
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

  /** Warn once per unresolved production host, not once per request. */
  const warnedUnresolvedHosts = new Set<string>();

  function tenant(req: express.Request): { league: League; adapter: LeagueDataAdapter } {
    const host = req.get("host");
    const forwardedHost = req.get("x-forwarded-host");
    const league = resolveRequestLeague({
      host,
      forwardedHost,
      slug: String(req.query.league ?? "")
    });

    if (process.env.NODE_ENV === "production") {
      const primaryHost = (forwardedHost?.split(",")[0] ?? host ?? "").trim();
      if (primaryHost && !getLeagueByHostname(primaryHost) && !warnedUnresolvedHosts.has(primaryHost)) {
        warnedUnresolvedHosts.add(primaryHost);
        console.warn(
          `Unrecognized tenant host "${primaryHost}" — falling back to ${league.slug}. Check DNS/hostname config if this is unexpected.`
        );
      }
    }

    return { league, adapter: getAdapter(league) };
  }

  function providedTokens(req: express.Request): string[] {
    const header = req.get("x-admin-token") ?? "";
    const bearer = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    return [header, bearer];
  }

  /** Platform credential: gates tenant CRUD (/admin, /api/admin/tenants, /api/admin/probe). */
  function isAdmin(req: express.Request) {
    if (!adminToken) return false;
    return providedTokens(req).some((token) => tokensMatch(token, adminToken));
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

  /**
   * Per-tenant credential: gates POST /api/admin/refresh and the refresh=1
   * bypasses for this one tenant. If the tenant has its own token
   * configured (env var or admin-set refreshToken), only that token works —
   * the platform ADMIN_TOKEN no longer refreshes it. Otherwise falls back
   * to the platform token (legacy behavior for tenants with no token set).
   */
  function isRefreshAuthorized(req: express.Request, league: League) {
    const tenantToken = refreshTokenFor(league);
    if (tenantToken) return providedTokens(req).some((token) => tokensMatch(token, tenantToken));
    return isAdmin(req);
  }

  /**
   * Public read endpoints only — never /api/admin/*, /api/health or /api/status.
   * Express already sends an ETag, so repeat reads were cheap on the wire but still
   * cost a round-trip (and a full payload rebuild server-side) every navigation.
   * `private` because a response is resolved from the request's Host: these must not
   * land in a shared cache that might be keyed on path alone and serve one tenant's
   * board to another. A forced refresh is an admin action and is never cached.
   */
  const CACHEABLE_READ_PATH = /^\/api\/(league|seasons|players|schedule|games|leaders)(\/|$)/;

  app.use((req, res, next) => {
    // HEAD must answer with the same headers as GET, so accept both.
    if ((req.method !== "GET" && req.method !== "HEAD") || !CACHEABLE_READ_PATH.test(req.path)) return next();
    res.setHeader(
      "Cache-Control",
      req.query.refresh === "1" ? "no-store" : "private, max-age=60, stale-while-revalidate=300"
    );
    next();
  });

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

  app.delete("/api/admin/tenants/:slug", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = deleteAdminTenant(String(req.params.slug));
      return res.json(result);
    } catch (error) {
      return sendAdminError(res, error);
    }
  });

  // Slug-scoped, unlike /api/status and /api/admin/refresh below — those resolve by
  // Host (dev-only ?league= override), so the admin dashboard needs a way to target
  // an arbitrary tenant regardless of which host is serving /admin.
  app.get("/api/admin/tenants/:slug/status", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const league = getLeagueBySlug(String(req.params.slug));
    if (!league) return res.status(404).json({ error: "Tenant not found" });
    return res.json(getAdapter(league).status());
  });

  app.post("/api/admin/tenants/:slug/refresh", async (req, res) => {
    const league = getLeagueBySlug(String(req.params.slug));
    if (!league) return res.status(404).json({ error: "Tenant not found" });
    if (!isRefreshAuthorized(req, league)) {
      return res.status(401).json({ error: "Unauthorized — this tenant requires its own refresh token" });
    }
    try {
      const season = String(req.body?.season ?? req.query.season ?? "").trim();
      const adapter = getAdapter(league);
      const result = await adapter.refresh(season || undefined);
      return res.json({ ok: true, ...result, status: adapter.status() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(502).json({ error: "Unable to refresh source data", detail: message });
    }
  });

  app.post("/api/admin/refresh", async (req, res) => {
    const { league, adapter } = tenant(req);
    if (!isRefreshAuthorized(req, league)) {
      return res.status(401).json({ error: "Unauthorized — this tenant requires its own refresh token" });
    }

    try {
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
      const { league, adapter } = tenant(req);
      const force = req.query.refresh === "1";
      if (force && !isRefreshAuthorized(req, league)) {
        return res.status(401).json({ error: "Unauthorized — force refresh requires this tenant's admin token" });
      }
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
      const { league, adapter } = tenant(req);
      const season = String(req.query.season ?? "").trim();
      const force = req.query.refresh === "1";
      if (force && !isRefreshAuthorized(req, league)) {
        return res.status(401).json({ error: "Unauthorized — force refresh requires this tenant's admin token" });
      }
      const data = await adapter.getSchedule({ force, season: season || undefined });
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
      const { league, adapter } = tenant(req);
      const force = req.query.refresh === "1";
      if (force && !isRefreshAuthorized(req, league)) {
        return res.status(401).json({ error: "Unauthorized — force refresh requires this tenant's admin token" });
      }
      const season = String(req.query.season ?? "").trim();
      const data = await adapter.getPlayers({ force, season: season || undefined });
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
    const indexPath = path.join(clientDist, "index.html");
    const indexTemplate = fs.readFileSync(indexPath, "utf8");
    const googleSiteVerification = "google-site-verification: googleef181a2027facb7d.html";

    app.get("/googleef181a2027facb7d.html", (_req, res) => {
      res.type("text/html").send(googleSiteVerification);
    });
    // GSC URL-prefix properties that include /sitemap.xml check this path.
    app.get("/sitemap.xml/googleef181a2027facb7d.html", (_req, res) => {
      res.type("text/html").send(googleSiteVerification);
    });

    app.get("/robots.txt", (req, res) => {
      const origin = requestOrigin(req);
      res.type("text/plain").send(renderRobotsTxt(origin));
    });

    app.get("/sitemap.xml", async (req, res) => {
      const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]?.trim() ?? "";
      const origin = requestOrigin(req);
      if (isMarketingHost(host)) {
        return res.type("application/xml").send(await renderSitemapXml(origin, host));
      }
      try {
        const { league, adapter } = tenant(req);
        const urls = await buildSitemapUrls(origin.replace(/\/$/, ""), league, adapter);
        return res.type("application/xml").send(await renderSitemapXml(origin, host, urls));
      } catch {
        return res.type("application/xml").send(await renderSitemapXml(origin, host));
      }
    });

    app.use(
      express.static(clientDist, {
        index: false,
        setHeaders(res, filePath) {
          // Vite fingerprints everything under /assets/, so those URLs can never
          // change meaning — let the browser keep them without revalidating.
          // Everything else (favicons, logos, manifests) keeps the default.
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        }
      })
    );

    async function sendSpa(req: express.Request, res: express.Response) {
      const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]?.trim() ?? "";
      const origin = requestOrigin(req);
      const queryIndex = req.originalUrl.indexOf("?");
      const search = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
      if (isMarketingHost(host)) {
        return res.type("html").send(injectPageSeo(indexTemplate, marketingSeo(origin)));
      }

      try {
        const { league, adapter } = tenant(req);
        const html = await buildBootstrappedHtml(indexTemplate, league, adapter, origin, req.path, search);
        return res.type("html").send(html);
      } catch {
        const { league, adapter } = tenant(req);
        try {
          const seo = await resolveLeaguePageSeo(league, adapter, origin, req.path, search);
          return res.type("html").send(injectPageSeo(indexTemplate, seo));
        } catch {
          const { league } = tenant(req);
          return res
            .type("html")
            .send(injectPageSeo(indexTemplate, leagueSeo(toPublicLeague(league), origin, league.publicSeason)));
        }
      }
    }

    app.get("/", (req, res) => {
      void sendSpa(req, res);
    });

    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path.startsWith("/api")) return next();
      if (req.path.includes(".")) return next();
      void sendSpa(req, res);
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

async function buildBootstrappedHtml(
  indexTemplate: string,
  league: League,
  adapter: LeagueDataAdapter,
  origin: string,
  pathname: string,
  search: string
) {
  const seo = await resolveLeaguePageSeo(league, adapter, origin, pathname, search);
  let html = injectPageSeo(indexTemplate, seo);

  const payload = await Promise.race([
    loadBootstrapPayload(league, adapter),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), BOOTSTRAP_TIMEOUT_MS))
  ]);
  if (!payload) return html;
  return injectPageBootstrap(html, payload);
}

const BOOTSTRAP_TIMEOUT_MS = 300;

async function loadBootstrapPayload(league: League, adapter: LeagueDataAdapter): Promise<PageBootstrap | null> {
  const seasons = await adapter.getSeasons({ cacheOnly: true });
  if (!seasons.length) return null;

  const publicSeason = league.publicSeason;
  const defaultSeason = seasons.some((item) => item.year === publicSeason)
    ? publicSeason
    : (seasons[0]?.year ?? publicSeason);

  try {
    const players = await adapter.getPlayers({ season: defaultSeason, cacheOnly: true });
    if (!players.players.length) return null;
    return {
      league: toPublicLeague(league),
      seasons: { seasons, defaultSeason },
      players
    };
  } catch {
    return null;
  }
}
