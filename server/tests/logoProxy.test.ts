import { jest } from "@jest/globals";
import { createLogoProxy, isFetchableLogoUrl, LogoProxyError, MAX_LOGO_BYTES } from "../src/lib/logoProxy.js";

const LOGO_URL = "https://www.playtuff.ca/wp-content/uploads/2024/05/wildcats-128x128.png";
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function imageResponse(body: Buffer = PNG_BYTES, contentType = "image/png", init: ResponseInit = {}) {
  return new Response(new Uint8Array(body), { status: 200, headers: { "content-type": contentType }, ...init });
}

function stubFetch(responder: () => Response | Promise<Response>) {
  return jest.fn(async (..._args: Parameters<typeof fetch>) => responder()) as unknown as jest.Mock<typeof fetch> &
    typeof fetch;
}

describe("isFetchableLogoUrl", () => {
  it("accepts public http(s) image URLs", () => {
    expect(isFetchableLogoUrl(LOGO_URL)).toBe(true);
    expect(isFetchableLogoUrl("http://cdn.example.com/logo.png")).toBe(true);
  });

  it.each([
    "file:///etc/passwd",
    "ftp://example.com/logo.png",
    "http://localhost:4000/api/league",
    "http://app.localhost/logo.png",
    "http://127.0.0.1/logo.png",
    "http://10.0.0.5/logo.png",
    "http://172.16.3.4/logo.png",
    "http://192.168.0.18/logo.png",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/logo.png",
    "https://user:pass@example.com/logo.png",
    "not a url"
  ])("refuses %s", (url) => {
    expect(isFetchableLogoUrl(url)).toBe(false);
  });
});

describe("createLogoProxy", () => {
  it("returns the image bytes and content type", async () => {
    const proxy = createLogoProxy({ fetchImpl: stubFetch(() => imageResponse()) });
    const image = await proxy.get(LOGO_URL);
    expect(image.contentType).toBe("image/png");
    expect(image.body.equals(PNG_BYTES)).toBe(true);
  });

  it("caches a logo instead of refetching it for every card", async () => {
    const fetchImpl = stubFetch(() => imageResponse());
    const proxy = createLogoProxy({ fetchImpl });
    await Promise.all([proxy.get(LOGO_URL), proxy.get(LOGO_URL)]);
    await proxy.get(LOGO_URL);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refetches once the cached copy expires", async () => {
    let clock = 0;
    const fetchImpl = stubFetch(() => imageResponse());
    const proxy = createLogoProxy({ fetchImpl, now: () => clock });
    await proxy.get(LOGO_URL);
    clock += 7 * 60 * 60 * 1000;
    await proxy.get(LOGO_URL);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never fetches a disallowed URL", async () => {
    const fetchImpl = stubFetch(() => imageResponse());
    const proxy = createLogoProxy({ fetchImpl });
    await expect(proxy.get("http://127.0.0.1/secret")).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("follows a redirect to another public host", async () => {
    const fetchImpl = stubFetch(() => imageResponse());
    fetchImpl.mockImplementationOnce(async () => new Response(null, { status: 301, headers: { location: "https://cdn.example.com/w.png" } }));
    const proxy = createLogoProxy({ fetchImpl });
    await expect(proxy.get(LOGO_URL)).resolves.toMatchObject({ contentType: "image/png" });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://cdn.example.com/w.png");
  });

  it("refuses to follow a redirect into a private network", async () => {
    const fetchImpl = stubFetch(() => imageResponse());
    fetchImpl.mockImplementationOnce(
      async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } })
    );
    const proxy = createLogoProxy({ fetchImpl });
    await expect(proxy.get(LOGO_URL)).rejects.toThrow("unsafe");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects non-images and SVG", async () => {
    const html = createLogoProxy({ fetchImpl: stubFetch(() => imageResponse(Buffer.from("<html>"), "text/html")) });
    await expect(html.get(LOGO_URL)).rejects.toBeInstanceOf(LogoProxyError);

    const svg = createLogoProxy({ fetchImpl: stubFetch(() => imageResponse(Buffer.from("<svg/>"), "image/svg+xml")) });
    await expect(svg.get(LOGO_URL)).rejects.toBeInstanceOf(LogoProxyError);
  });

  it("rejects oversized logos", async () => {
    const big = Buffer.alloc(MAX_LOGO_BYTES + 1);
    const proxy = createLogoProxy({ fetchImpl: stubFetch(() => imageResponse(big)) });
    await expect(proxy.get(LOGO_URL)).rejects.toThrow("too large");
  });

  it("reports upstream failures as 502 and doesn't cache them", async () => {
    let fail = true;
    const fetchImpl = stubFetch(() => (fail ? new Response("nope", { status: 500 }) : imageResponse()));
    const proxy = createLogoProxy({ fetchImpl });
    await expect(proxy.get(LOGO_URL)).rejects.toMatchObject({ status: 502 });
    fail = false;
    await expect(proxy.get(LOGO_URL)).resolves.toMatchObject({ contentType: "image/png" });
  });
});
