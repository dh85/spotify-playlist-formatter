import { describe, expect, it, vi } from "vitest";

async function loadAuth(envOverrides?: Partial<{ APP_PASSWORD: string; SESSION_SECRET: string }>) {
  vi.resetModules();
  vi.doMock("$env/dynamic/private", () => ({
    env: {
      APP_PASSWORD: "test-password",
      SESSION_SECRET: "test-session-secret",
      ...envOverrides
    }
  }));

  return import("./auth");
}

describe("auth token lifecycle", () => {
  it("validates token just before expiry and rejects just after expiry", async () => {
    const auth = await loadAuth();
    const issuedAt = 1_000;
    const token = auth.issueSessionToken(issuedAt);
    const expiresAt = issuedAt + auth.SESSION_MAX_AGE_SECONDS * 1000;

    expect(auth.verifySessionToken(token, expiresAt - 1)).toBe(true);
    expect(auth.verifySessionToken(token, expiresAt)).toBe(false);
  });

  it("rejects malformed token segments", async () => {
    const auth = await loadAuth();

    expect(auth.verifySessionToken("")).toBe(false);
    expect(auth.verifySessionToken("no-dot-token")).toBe(false);
    expect(auth.verifySessionToken(".missing-payload")).toBe(false);
    expect(auth.verifySessionToken("payload-only.")).toBe(false);
    expect(auth.verifySessionToken("payload.signature.extra")).toBe(false);
  });

  it("rejects token with invalid payload encoding", async () => {
    const auth = await loadAuth();
    expect(auth.verifySessionToken("%%%.signature")).toBe(false);
  });

  it("rejects token with non-json payload", async () => {
    const auth = await loadAuth();
    const payload = Buffer.from("not-json", "utf8").toString("base64url");
    expect(auth.verifySessionToken(`${payload}.signature`)).toBe(false);
  });

  it("rejects token payload without numeric exp", async () => {
    const auth = await loadAuth();
    const payload = Buffer.from(JSON.stringify({ iat: 1000, exp: "bad-exp" }), "utf8").toString("base64url");
    expect(auth.verifySessionToken(`${payload}.signature`)).toBe(false);
  });

  it("returns false when SESSION_SECRET is missing during verification", async () => {
    const auth = await loadAuth({ SESSION_SECRET: "" });
    expect(auth.verifySessionToken("any.token")).toBe(false);
  });
});

describe("password verification", () => {
  it("returns false when APP_PASSWORD is missing", async () => {
    const auth = await loadAuth({ APP_PASSWORD: "" });
    expect(auth.verifyPassword("anything")).toBe(false);
  });
});
