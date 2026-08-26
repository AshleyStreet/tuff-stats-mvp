import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AdminDashboard } from "./components/AdminDashboard";
import { CaptainTools } from "./components/CaptainTools";
import { LeagueProvider } from "./league/LeagueProvider";
import "./styles.css";

function Root() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (path === "/admin" || path.startsWith("/admin/")) {
    return <AdminDashboard />;
  }

  if (path === "/captain-tools" || path.startsWith("/captain-tools/")) {
    return <CaptainTools />;
  }

  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LeagueProvider>
      <Root />
    </LeagueProvider>
  </StrictMode>
);
