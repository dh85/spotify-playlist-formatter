import { afterEach, describe, expect, it, vi } from "vitest";
import { getNextFromLocation, parseLoginSuccess, postLogin } from "./login-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getNextFromLocation", () => {
  it("returns next path from query string", () => {
    expect(getNextFromLocation("?next=%2Fplaylist%2F123")).toBe("/playlist/123");
  });

  it("falls back to root when next is absent", () => {
    expect(getNextFromLocation("?foo=bar")).toBe("/");
  });
});

describe("postLogin", () => {
  it("posts to /api/login with JSON payload", async () => {
    const response = new Response(JSON.stringify({ redirectTo: "/" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const payload = { password: "secret", next: "/playlist/123" };
    const out = await postLogin(payload);

    expect(out).toBe(response);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  });
});

describe("parseLoginSuccess", () => {
  it("parses login success response JSON", async () => {
    const response = new Response(JSON.stringify({ redirectTo: "/dashboard" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

    await expect(parseLoginSuccess(response)).resolves.toStrictEqual({ redirectTo: "/dashboard" });
  });
});
