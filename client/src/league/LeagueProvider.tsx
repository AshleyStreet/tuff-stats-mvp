import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getLeague } from "../api";
import { flagFootballPresentation } from "./flagFootball";
import { tuffPublicLeague } from "./tuff";
import type { PublicLeague, StatPresentation } from "./types";

const LeagueContext = createContext<PublicLeague>(tuffPublicLeague);

export function useLeague() {
  return useContext(LeagueContext);
}

export function usePresentation(): StatPresentation {
  return useLeague().presentation ?? flagFootballPresentation;
}

export function applyLeagueBranding(league: PublicLeague) {
  const root = document.documentElement;
  if (league.branding.primaryColor) root.style.setProperty("--red", league.branding.primaryColor);
  if (league.branding.secondaryColor) root.style.setProperty("--gold", league.branding.secondaryColor);
  if (league.copy.documentTitle) document.title = league.copy.documentTitle;
}

function withPresentationDefaults(league: PublicLeague): PublicLeague {
  return {
    ...league,
    sportIcon: league.sportIcon ?? "football",
    presentation: league.presentation ?? flagFootballPresentation
  };
}

/** Static league context for marketing previews — no API fetch. */
export function LeaguePreviewProvider({
  league,
  children
}: {
  league: PublicLeague;
  children: ReactNode;
}) {
  return (
    <LeagueContext.Provider value={withPresentationDefaults(league)}>
      {children}
    </LeagueContext.Provider>
  );
}

export function LeagueProvider({ children }: { children: ReactNode }) {
  const [league, setLeague] = useState<PublicLeague>(tuffPublicLeague);

  useEffect(() => {
    applyLeagueBranding(tuffPublicLeague);
    let cancelled = false;
    getLeague()
      .then((data) => {
        if (cancelled || !data?.slug) return;
        const next = withPresentationDefaults(data);
        setLeague(next);
        applyLeagueBranding(next);
      })
      .catch(() => {
        /* keep baked TUFF fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <LeagueContext.Provider value={league}>{children}</LeagueContext.Provider>;
}
