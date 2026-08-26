import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdapter } from "./adapters/resolve.js";
import { createApp } from "./app.js";
import { getDefaultLeague } from "./leagues/registry.js";

const port = Number(process.env.PORT ?? 4000);
/** Loaded from server/.env via dotenv. Empty disables /admin. */
const adminToken = process.env.ADMIN_TOKEN?.trim() ?? "";
const defaultLeague = getDefaultLeague();
const defaultAdapter = getAdapter(defaultLeague);
const app = createApp({ adminToken });
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");

app.listen(port, "0.0.0.0", () => {
  console.log(`${defaultLeague.shortName} API listening on http://localhost:${port}`);
  if (fs.existsSync(clientDist)) {
    console.log(`Serving web app from ${clientDist}`);
  }
  if (!adminToken) {
    console.log("ADMIN_TOKEN not set — /admin and /api/admin/* disabled");
  }
  void defaultAdapter
    .warm()
    .then(({ warmed, failed }) => {
      console.log(`Season cache warm: ${warmed.length} ready${failed.length ? `, ${failed.length} failed` : ""}`);
    })
    .catch((error) => {
      console.warn("Season cache warm failed:", error instanceof Error ? error.message : error);
    });
});
