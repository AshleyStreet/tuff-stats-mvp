export type AnalyticsProps = Record<string, string | number | boolean>;

type AnalyticsConfig = {
  gaId?: string;
  plausibleDomain?: string;
  plausibleSrc: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    __gtagReady?: Promise<void>;
    plausible?: (event: string, options?: { props?: Record<string, string> }) => void;
  }
}

type Gtag = (...args: unknown[]) => void;

let initialized = false;
let gtagReady: Promise<void> | null = null;

function readConfig(): AnalyticsConfig {
  return {
    gaId: import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || undefined,
    plausibleDomain: import.meta.env.VITE_PLAUSIBLE_DOMAIN?.trim() || undefined,
    plausibleSrc:
      import.meta.env.VITE_PLAUSIBLE_SCRIPT_SRC?.trim() || "https://plausible.io/js/script.js"
  };
}

export function isAnalyticsConfigured() {
  const { gaId, plausibleDomain } = readConfig();
  return Boolean(gaId || plausibleDomain);
}

function analyticsAllowed() {
  if (!isAnalyticsConfigured()) return false;
  if (import.meta.env.DEV && import.meta.env.VITE_ANALYTICS_DEBUG !== "true") return false;
  if (typeof window !== "undefined" && window.navigator.doNotTrack === "1") return false;
  return true;
}

/** Match Google's snippet — gtag.js only replays `arguments` objects, not spread arrays. */
function ensureGtagStub() {
  window.dataLayer = window.dataLayer || [];
  if (window.gtag) return;
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  } as Gtag;
}

function waitForGtag(gaId: string) {
  if (gtagReady) return gtagReady;
  ensureGtagStub();

  gtagReady =
    window.__gtagReady ??
    new Promise((resolve) => {
      const selector = `script[src*="gtag/js?id=${encodeURIComponent(gaId)}"]`;
      const existing = document.querySelector<HTMLScriptElement>(selector);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });

  return gtagReady;
}

function configureGtag(gaId: string) {
  ensureGtagStub();
  window.gtag!("js", new Date());
  window.gtag!("config", gaId, { send_page_view: false });
}

async function sendGtag(...args: unknown[]) {
  if (!analyticsAllowed()) return;
  const { gaId } = readConfig();
  if (!gaId) return;
  configureGtag(gaId);
  await waitForGtag(gaId);
  window.gtag?.(...args);
}

export function initAnalytics() {
  if (initialized || !analyticsAllowed()) return;
  initialized = true;

  const { gaId, plausibleDomain, plausibleSrc } = readConfig();

  if (gaId) {
    configureGtag(gaId);
    void waitForGtag(gaId);
  }

  if (plausibleDomain) {
    const script = document.createElement("script");
    script.defer = true;
    script.dataset.domain = plausibleDomain;
    script.src = plausibleSrc;
    document.head.appendChild(script);
  }
}

export function trackPageView(path: string, title?: string) {
  if (!analyticsAllowed()) return;

  const pagePath = path.startsWith("/") ? path : `/${path}`;
  const pageTitle = title ?? document.title;
  const pageLocation = `${window.location.origin}${pagePath}${window.location.search}`;

  void sendGtag("event", "page_view", {
    page_path: pagePath,
    page_title: pageTitle,
    page_location: pageLocation
  });

  if (window.plausible) {
    window.plausible("pageview");
  }
}

export function trackEvent(name: string, params: AnalyticsProps = {}) {
  if (!analyticsAllowed()) return;

  void sendGtag("event", name, params);

  if (window.plausible) {
    const props = Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)])
    );
    window.plausible(name, Object.keys(props).length ? { props } : undefined);
  }
}

export function trackFilter(filter: string, value: string, context: AnalyticsProps = {}) {
  trackEvent("filter_change", { filter, value, ...context });
}

export function trackClick(target: string, context: AnalyticsProps = {}) {
  trackEvent("ui_click", { target, ...context });
}

export function trackDrawerClose(type: string, context: AnalyticsProps = {}) {
  trackEvent("drawer_close", { type, ...context });
}

export function trackExternalLink(linkType: string, context: AnalyticsProps = {}) {
  trackEvent("external_link_click", { link_type: linkType, ...context });
}
