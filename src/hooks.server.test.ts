import { describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: {
    APP_PASSWORD: "test-secret",
    SESSION_SECRET: "test-session-secret"
  }
}));

import { issueSessionToken } from "$lib/server/auth";
import { handle } from "./hooks.server";

function createArgs(pathname: string, search = "", token?: string) {
  const event = {
    url: new URL(`https://example.com${pathname}${search}`),
    cookies: {
      get: vi.fn().mockReturnValue(token)
    }
  };

  const resolve = vi.fn().mockResolvedValue("resolved");

  return { event, resolve };
}

describe("handle auth guard", () => {
  it.each(["/login", "/api/login", "/api/logout", "/_app/immutable/start.js", "/favicon.ico", "/favicon.png"])(
    "allows public path %s without auth cookie",
    async (pathname) => {
      const { event, resolve } = createArgs(pathname);

      await expect(handle({ event, resolve } as never)).resolves.toBe("resolved");
      expect(resolve).toHaveBeenCalledOnce();
    }
  );

  it("redirects unauthenticated users from protected paths", async () => {
    const { event, resolve } = createArgs("/dashboard", "?tab=1");

    await expect(handle({ event, resolve } as never)).rejects.toMatchObject({
      status: 303,
      location: "/login?next=%2Fdashboard%3Ftab%3D1"
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("redirects when cookie is malformed", async () => {
    const { event, resolve } = createArgs("/", "", "short");

    await expect(handle({ event, resolve } as never)).rejects.toMatchObject({
      status: 303,
      location: "/login?next=%2F"
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("redirects when cookie signature is invalid", async () => {
    const { event, resolve } = createArgs("/protected", "", "a.b");

    await expect(handle({ event, resolve } as never)).rejects.toMatchObject({
      status: 303,
      location: "/login?next=%2Fprotected"
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("allows protected paths with valid signed session cookie", async () => {
    const token = issueSessionToken();
    const { event, resolve } = createArgs("/protected", "", token);

    await expect(handle({ event, resolve } as never)).resolves.toBe("resolved");
    expect(resolve).toHaveBeenCalledWith(event);
  });
});
