import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { LeagueProvider } from "./league/LeagueProvider";
import { isMarketingHost } from "./lib/marketingHost";
import { applyPageBootstrap } from "./lib/bootstrap";
import { initAnalytics, trackPageView } from "./lib/analytics";
import "./styles.css";

applyPageBootstrap();
initAnalytics();

// The stats board is what nearly every visitor opens, so it stays in the main bundle.
// These screens (and what only they use: html-to-image, marketing.css, the demo league)
// load on demand. The server preloads the right one per route; see lib/screenPreload.ts.
const AdminDashboard = lazy(() => import("./components/AdminDashboard").then((m) => ({ default: m.AdminDashboard })));
const CaptainTools = lazy(() => import("./components/CaptainTools").then((m) => ({ default: m.CaptainTools })));
const MarketingHome = lazy(() => import("./components/MarketingHome").then((m) => ({ default: m.MarketingHome })));

function Root() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (path === "/admin" || path.startsWith("/admin/")) {
      trackPageView(path);
      return;
    }
    if (path === "/captain-tools" || path.startsWith("/captain-tools/")) {
      trackPageView(path);
    }
  }, [path]);

  if (path === "/admin" || path.startsWith("/admin/")) {
    return (
      <Suspense fallback={null}>
        <AdminDashboard />
      </Suspense>
    );
  }

  if (isMarketingHost()) {
    return (
      <Suspense fallback={null}>
        <MarketingHome />
      </Suspense>
    );
  }

  if (path === "/captain-tools" || path.startsWith("/captain-tools/")) {
    return (
      <LeagueProvider>
        <Suspense fallback={null}>
          <CaptainTools />
        </Suspense>
      </LeagueProvider>
    );
  }

  return (
    <LeagueProvider>
      <App />
    </LeagueProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
