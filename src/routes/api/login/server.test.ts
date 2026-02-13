import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: {
    APP_PASSWORD: "test-secret",
    SESSION_SECRET: "test-session-secret"
  }
}));

import { env } from "$env/dynamic/private";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "$lib/server/auth";
import { LOGIN_MAX_FAILED_ATTEMPTS, resetLoginRateLimitForTests } from "$lib/server/login-rate-limit";
import { POST } from "./+server";

function createEvent(options?: {
  protocol?: "http:" | "https:";
  body?: unknown;
  jsonRejects?: boolean;
  headers?: Record<string, string>;
  clientAddress?: string;
}) {
  const protocol = options?.protocol ?? "https:";
  const cookies = { set: vi.fn() };
  const defaultHeaders = { origin: `${protocol}//example.com` };
  const mergedHeaders = { ...defaultHeaders, ...(options?.headers ?? {}) };
  const headerMap = new Map(Object.entries(mergedHeaders).map(([k, v]) => [k.toLowerCase(), v]));
  const request = {
    json: options?.jsonRejects
      ? vi.fn().mockRejectedValue(new Error("bad json"))
      : vi.fn().mockResolvedValue(options?.body ?? {}),
    headers: {
      get: (key: string) => headerMap.get(key.toLowerCase()) ?? null
    }
  };
  const url = new URL(`${protocol}//example.com/login`);
  const getClientAddress = vi.fn().mockReturnValue(options?.clientAddress ?? "127.0.0.1");

  return { request, cookies, url, getClientAddress };
}

describe("POST /api/login", () => {
  beforeEach(() => {
    resetLoginRateLimitForTests();
    env.APP_PASSWORD = "test-secret";
    env.SESSION_SECRET = "test-session-secret";
  });

  it("returns 401 when request body cannot be parsed", async () => {
    const event = createEvent({ jsonRejects: true });

    const response = await POST(event as never);

    await expect(response.text()).resolves.toBe("Invalid password");
    expect(response.status).toBe(401);
    expect(event.cookies.set).not.toHaveBeenCalled();
  });

  it("returns 403 for cross-origin requests", async () => {
    const event = createEvent({
      headers: { origin: "https://evil.example" },
      body: { password: "test-secret", next: "/" }
    });

    const response = await POST(event as never);

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("Invalid request origin.");
    expect(event.cookies.set).not.toHaveBeenCalled();
  });

  it("returns 401 for wrong password with different length", async () => {
    const event = createEvent({ body: { password: "short", next: "/home" } });

    const response = await POST(event as never);

    expect(response.status).toBe(401);
    expect(event.cookies.set).not.toHaveBeenCalled();
  });

  it("returns 401 for wrong password with same length", async () => {
    const event = createEvent({
      body: { password: "x".repeat("test-secret".length), next: "/home" }
    });

    const response = await POST(event as never);

    expect(response.status).toBe(401);
    expect(event.cookies.set).not.toHaveBeenCalled();
  });

  it("sets auth cookie for 30 days and returns sanitized redirect for invalid next", async () => {
    const event = createEvent({
      protocol: "http:",
      body: { password: "test-secret", next: "https://malicious.site" }
    });

    const response = await POST(event as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ redirectTo: "/" });
    expect(event.cookies.set).toHaveBeenCalledOnce();
    const [cookieName, cookieValue, cookieOptions] = event.cookies.set.mock.calls[0]!;
    expect(cookieName).toBe(SESSION_COOKIE_NAME);
    expect(typeof cookieValue).toBe("string");
    expect(cookieValue).not.toBe("test-secret");
    expect(verifySessionToken(cookieValue)).toBe(true);
    expect(cookieOptions).toStrictEqual({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: SESSION_MAX_AGE_SECONDS
    });
  });

  it("uses secure cookie and preserves valid relative next path", async () => {
    const event = createEvent({
      protocol: "https:",
      body: { password: "test-secret", next: "/playlist/123?from=login" }
    });

    const response = await POST(event as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ redirectTo: "/playlist/123?from=login" });
    const [cookieName, cookieValue, cookieOptions] = event.cookies.set.mock.calls[0]!;
    expect(cookieName).toBe(SESSION_COOKIE_NAME);
    expect(typeof cookieValue).toBe("string");
    expect(verifySessionToken(cookieValue)).toBe(true);
    expect(cookieOptions).toStrictEqual({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: SESSION_MAX_AGE_SECONDS
    });
  });

  it("returns 429 after repeated failed attempts from the same client", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_ATTEMPTS - 1; i += 1) {
      const response = await POST(
        createEvent({
          body: { password: "wrong-pass", next: "/" },
          clientAddress: "10.0.0.1"
        }) as never
      );
      expect(response.status).toBe(401);
    }

    const blockedResponse = await POST(
      createEvent({
        body: { password: "wrong-pass", next: "/" },
        clientAddress: "10.0.0.1"
      }) as never
    );

    expect(blockedResponse.status).toBe(429);
    await expect(blockedResponse.text()).resolves.toBe("Too many login attempts. Please try again later.");
  });

  it("clears failed-attempt state after a successful login", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_ATTEMPTS - 1; i += 1) {
      await POST(
        createEvent({
          body: { password: "wrong-pass", next: "/" },
          clientAddress: "10.0.0.2"
        }) as never
      );
    }

    const successResponse = await POST(
      createEvent({
        body: { password: "test-secret", next: "/" },
        clientAddress: "10.0.0.2"
      }) as never
    );
    expect(successResponse.status).toBe(200);

    const nextFailureResponse = await POST(
      createEvent({
        body: { password: "wrong-pass", next: "/" },
        clientAddress: "10.0.0.2"
      }) as never
    );
    expect(nextFailureResponse.status).toBe(401);
  });

  it("ignores spoofed x-forwarded-for for rate-limit identity", async () => {
    for (let i = 0; i < LOGIN_MAX_FAILED_ATTEMPTS - 1; i += 1) {
      const response = await POST(
        createEvent({
          body: { password: "wrong-pass", next: "/" },
          clientAddress: "10.0.0.3",
          headers: { "x-forwarded-for": `203.0.113.${i}` }
        }) as never
      );
      expect(response.status).toBe(401);
    }

    const blockedResponse = await POST(
      createEvent({
        body: { password: "wrong-pass", next: "/" },
        clientAddress: "10.0.0.3",
        headers: { "x-forwarded-for": "198.51.100.99" }
      }) as never
    );

    expect(blockedResponse.status).toBe(429);
    await expect(blockedResponse.text()).resolves.toBe("Too many login attempts. Please try again later.");
  });

  it("returns 500 when SESSION_SECRET is missing on the server", async () => {
    env.SESSION_SECRET = "";
    const event = createEvent({
      body: { password: "test-secret", next: "/" }
    });

    const response = await POST(event as never);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("Missing SESSION_SECRET on the server.");
    expect(event.cookies.set).not.toHaveBeenCalled();
  });
});
