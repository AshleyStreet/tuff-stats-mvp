import type { League } from "./types.js";

function envKeyFor(slug: string): string {
  return `ADMIN_TOKEN_${slug.toUpperCase().replace(/-/g, "_")}`;
}

/**
 * Resolves the secret that gates POST /api/admin/refresh (and the refresh=1
 * bypasses) for one tenant: an `ADMIN_TOKEN_<SLUG>` env var wins, then the
 * tenant's stored `refreshToken`, else undefined (legacy fallback to the
 * platform ADMIN_TOKEN — see app.ts).
 */
export function refreshTokenFor(league: Pick<League, "slug" | "refreshToken">): string | undefined {
  const fromEnv = process.env[envKeyFor(league.slug)]?.trim();
  if (fromEnv) return fromEnv;
  const stored = league.refreshToken?.trim();
  return stored || undefined;
}
