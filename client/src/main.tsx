import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AdminDashboard } from "./components/AdminDashboard";
import { CaptainTools } from "./components/CaptainTools";
import { MarketingHome } from "./components/MarketingHome";
import { LeagueProvider } from "./league/LeagueProvider";
import { isMarketingHost } from "./lib/marketingHost";
import { applyPageBootstrap } from "./lib/bootstrap";
import { initAnalytics, trackPageView } from "./lib/analytics";
import "./styles.css";

applyPageBootstrap();
initAnalytics();

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
    return <AdminDashboard />;
  }

  if (isMarketingHost()) {
    return <MarketingHome />;
  }

  if (path === "/captain-tools" || path.startsWith("/captain-tools/")) {
    return (
      <LeagueProvider>
        <CaptainTools />
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
