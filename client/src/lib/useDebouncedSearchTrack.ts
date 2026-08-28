import { useEffect } from "react";
import { trackEvent } from "./analytics";

/** Fire a search event after the user pauses typing (min 2 chars). */
export function useDebouncedSearchTrack(
  query: string,
  league: string,
  tab: string,
  season: string,
  enabled = true,
  delayMs = 700
) {
  useEffect(() => {
    if (!enabled) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const timer = window.setTimeout(() => {
      trackEvent("search", { league, tab, season, query_length: trimmed.length });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [query, league, tab, season, enabled, delayMs]);
}
