import { refreshTokenFor } from "../src/leagues/adminTokens.js";

describe("refreshTokenFor", () => {
  const envKey = "ADMIN_TOKEN_DEMO";
  const originalEnv = process.env[envKey];

  afterEach(() => {
    if (originalEnv == null) delete process.env[envKey];
    else process.env[envKey] = originalEnv;
  });

  it("returns undefined when neither an env var nor a stored token is set", () => {
    delete process.env[envKey];
    expect(refreshTokenFor({ slug: "demo", refreshToken: undefined })).toBeUndefined();
  });

  it("falls back to the stored refreshToken when no env var is set", () => {
    delete process.env[envKey];
    expect(refreshTokenFor({ slug: "demo", refreshToken: "stored-secret" })).toBe("stored-secret");
  });

  it("prefers the ADMIN_TOKEN_<SLUG> env var over the stored token", () => {
    process.env[envKey] = "env-secret";
    expect(refreshTokenFor({ slug: "demo", refreshToken: "stored-secret" })).toBe("env-secret");
  });

  it("uppercases and dash-to-underscore normalizes the slug for the env key", () => {
    process.env.ADMIN_TOKEN_MULTI_WORD_SLUG = "env-secret";
    expect(refreshTokenFor({ slug: "multi-word-slug", refreshToken: undefined })).toBe("env-secret");
    delete process.env.ADMIN_TOKEN_MULTI_WORD_SLUG;
  });

  it("treats a blank stored token the same as unset", () => {
    delete process.env[envKey];
    expect(refreshTokenFor({ slug: "demo", refreshToken: "   " })).toBeUndefined();
  });
});
