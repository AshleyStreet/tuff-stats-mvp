/** Hostnames that serve the Afterwhistle marketing site (not a league tenant). */
export const MARKETING_HOSTS = new Set([
  "afterwhistle.ca",
  "www.afterwhistle.ca",
  "afterwhistle.localhost"
]);

export function isMarketingHost(host?: string | null) {
  const hostname = host?.trim().toLowerCase().split(":")[0] ?? "";
  return MARKETING_HOSTS.has(hostname);
}
