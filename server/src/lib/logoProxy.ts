/**
 * Same-origin copies of team logos, so the browser can draw them into card PNG/PDF exports.
 * League sites (e.g. SportsPress) don't send CORS headers, which taints the export canvas.
 *
 * Callers never pass a URL in: the route looks up the logo the league's own data names for a
 * team, so this can't be used as an open proxy.
 */

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const MAX_REDIRECTS = 3;

export type LogoImage = { contentType: string; body: Buffer };

export class LogoProxyError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

const PRIVATE_IPV4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./];

/** Logo URLs come from league data, but refuse anything aimed at this machine or a private network. */
export function isFetchableLogoUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
  if (host.startsWith("[")) return false;
  if (PRIVATE_IPV4.some((pattern) => pattern.test(host))) return false;
  return true;
}

export function createLogoProxy(options: { fetchImpl?: typeof fetch; now?: () => number } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const cache = new Map<string, LogoImage & { expires: number }>();
  const inFlight = new Map<string, Promise<LogoImage>>();

  /** Follow redirects by hand so every hop is checked before it's requested. */
  async function fetchFollowingSafeRedirects(url: string): Promise<Response> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      let response: Response;
      try {
        response = await fetchImpl(current, {
          redirect: "manual",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: { accept: "image/*" }
        });
      } catch {
        throw new LogoProxyError("Logo host didn't respond", 502);
      }
      const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
      if (!location) return response;
      const next = new URL(location, current).toString();
      if (!isFetchableLogoUrl(next)) throw new LogoProxyError("Logo redirected somewhere unsafe", 502);
      current = next;
    }
    throw new LogoProxyError("Logo redirected too many times", 502);
  }

  async function download(url: string): Promise<LogoImage> {
    const response = await fetchFollowingSafeRedirects(url);
    if (!response.ok) throw new LogoProxyError(`Logo host answered ${response.status}`, 502);

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    // SVG can carry script; exports only need raster logos.
    if (!contentType.startsWith("image/") || contentType === "image/svg+xml") {
      throw new LogoProxyError("Logo isn't a raster image", 502);
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_LOGO_BYTES) throw new LogoProxyError("Logo is too large", 502);

    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength > MAX_LOGO_BYTES) throw new LogoProxyError("Logo is too large", 502);
    return { contentType, body };
  }

  async function get(url: string): Promise<LogoImage> {
    if (!isFetchableLogoUrl(url)) throw new LogoProxyError("Logo URL isn't allowed", 404);

    const cached = cache.get(url);
    if (cached && cached.expires > now()) return cached;

    const pending = inFlight.get(url);
    if (pending) return pending;

    const request = download(url)
      .then((image) => {
        cache.delete(url);
        cache.set(url, { ...image, expires: now() + CACHE_TTL_MS });
        while (cache.size > MAX_CACHE_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) break;
          cache.delete(oldest);
        }
        return image;
      })
      .finally(() => inFlight.delete(url));
    inFlight.set(url, request);
    return request;
  }

  return { get };
}
