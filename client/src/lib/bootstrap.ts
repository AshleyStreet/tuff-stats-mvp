import { seedBootstrap } from "../api";
import type { PlayersResponse, SeasonInfo } from "../types";
import type { PublicLeague } from "../league/types";

export type PageBootstrap = {
  league: PublicLeague;
  seasons: {
    seasons: SeasonInfo[];
    defaultSeason: string;
  };
  players?: PlayersResponse;
};

export function readPageBootstrap(): PageBootstrap | null {
  const node = document.getElementById("aw-bootstrap");
  if (!node?.textContent?.trim()) return null;
  try {
    return JSON.parse(node.textContent) as PageBootstrap;
  } catch {
    return null;
  }
}

/** Hydrate client caches from server-inlined JSON before React mounts. */
export function applyPageBootstrap() {
  const bootstrap = readPageBootstrap();
  if (!bootstrap?.league?.slug) return;
  seedBootstrap(bootstrap);
}
