/** Hostnames that serve the Afterwhistle product marketing site (not a league tenant). */
const MARKETING_HOSTS = new Set([
  "afterwhistle.ca",
  "www.afterwhistle.ca",
  "afterwhistle.localhost"
]);

export function isMarketingHost(hostname = window.location.hostname): boolean {
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  return MARKETING_HOSTS.has(host);
}
