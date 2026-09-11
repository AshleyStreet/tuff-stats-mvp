import fs from "node:fs";
import path from "node:path";

/** The slice of Vite's build manifest (build.manifest: true) this needs. */
type ManifestChunk = {
  file: string;
  css?: string[];
  imports?: string[];
  isEntry?: boolean;
};

export type ViteManifest = Record<string, ManifestChunk>;

/**
 * The lazily loaded screens in client/src/main.tsx, keyed by their manifest id.
 * Keep the routing here in step with Root() there.
 */
const SCREENS = {
  admin: "src/components/AdminDashboard.tsx",
  marketing: "src/components/MarketingHome.tsx",
  captainTools: "src/components/CaptainTools.tsx"
} as const;

function underPath(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Which lazy screen a request will open, or null for the stats board (main bundle). */
export function screenForRoute(pathname: string, marketingHost: boolean): string | null {
  if (underPath(pathname, "/admin")) return SCREENS.admin;
  if (marketingHost) return SCREENS.marketing;
  if (underPath(pathname, "/captain-tools")) return SCREENS.captainTools;
  return null;
}

export function readViteManifest(clientDist: string): ViteManifest | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(clientDist, ".vite", "manifest.json"), "utf8")) as ViteManifest;
  } catch {
    return null;
  }
}

/**
 * <link> tags that fetch a lazy screen alongside the main bundle, instead of
 * after it has downloaded and run. Vite's loader skips a stylesheet that is
 * already linked, so nothing loads twice.
 */
export function screenPreloadTags(manifest: ViteManifest | null, screen: string | null): string {
  if (!manifest || !screen || !manifest[screen]) return "";
  const scripts = new Set<string>();
  const styles = new Set<string>();
  const visit = (id: string) => {
    const chunk = manifest[id];
    // The entry is already a <script> in index.html.
    if (!chunk || chunk.isEntry || scripts.has(chunk.file)) return;
    scripts.add(chunk.file);
    for (const css of chunk.css ?? []) styles.add(css);
    for (const dep of chunk.imports ?? []) visit(dep);
  };
  visit(screen);
  return [
    ...[...styles].map((file) => `<link rel="stylesheet" href="/${file}">`),
    ...[...scripts].map((file) => `<link rel="modulepreload" crossorigin href="/${file}">`)
  ].join("\n");
}

export function injectHeadTags(html: string, tags: string) {
  if (!tags) return html;
  return html.includes("</head>") ? html.replace("</head>", `${tags}\n</head>`) : html;
}
