import { describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME } from "$lib/server/auth";
import { POST } from "./+server";

function createEvent(options?: { origin?: string }) {
  const cookies = {
    delete: vi.fn()
  };
  const url = new URL("https://example.com/api/logout");
  const origin = options?.origin ?? "https://example.com";
  const request = {
    headers: {
      get: (key: string) => (key.toLowerCase() === "origin" ? origin : null)
    }
  };

  return { request, cookies, url };
}

describe("POST /api/logout", () => {
  it("deletes auth cookie and returns 204", async () => {
    const event = createEvent();

    const response = await POST(event as never);

    expect(event.cookies.delete).toHaveBeenCalledOnce();
    expect(event.cookies.delete).toHaveBeenCalledWith(SESSION_COOKIE_NAME, { path: "/" });
    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });

  it("returns 403 for cross-origin requests", async () => {
    const event = createEvent({ origin: "https://evil.example" });

    const response = await POST(event as never);

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe("Invalid request origin.");
    expect(event.cookies.delete).not.toHaveBeenCalled();
  });
});
