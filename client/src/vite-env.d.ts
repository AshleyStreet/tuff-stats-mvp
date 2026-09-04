/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_PLAUSIBLE_DOMAIN?: string;
  readonly VITE_PLAUSIBLE_SCRIPT_SRC?: string;
  readonly VITE_ANALYTICS_DEBUG?: string;
  readonly VITE_STRIPE_LEAGUE_LINK?: string;
  readonly VITE_STRIPE_CLUB_LINK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
