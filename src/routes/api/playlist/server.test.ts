import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./+server";
import * as spotifyClient from "$lib/spotify/client";

function createEvent(body: unknown, jsonRejects = false, options?: { origin?: string; referer?: string }) {
  const origin = options?.origin ?? "https://example.com";
  const referer = options?.referer;
  const request = {
    json: jsonRejects ? vi.fn().mockRejectedValue(new Error("bad json")) : vi.fn().mockResolvedValue(body),
    headers: {
      get: (key: string) => {
        const normalized = key.toLowerCase();
        if (normalized === "origin") return origin;
        if (normalized === "referer") return referer ?? null;
        return null;
      }
    }
  };

  return {
    request,
    fetch: vi.fn(),
    url: new URL("https://example.com/api/playlist")
  };
}

describe("POST /api/playlist", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for invalid playlist input", async () => {
    const event = createEvent({ input: "not-a-spotify-url" });

    const response = await POST(event as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual({
      error: "Enter a valid URL or Spotify playlist URI."
    });
  });

  it("returns 403 for cross-origin requests", async () => {
    const event = createEvent({ input: "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t" }, false, {
      origin: "https://evil.example"
    });

    const response = await POST(event as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toStrictEqual({ error: "Invalid request origin." });
  });

  it("returns 400 when request JSON is malformed", async () => {
    const event = createEvent({}, true);

    const response = await POST(event as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual({
      error: "Enter a Spotify playlist URL."
    });
  });

  it("returns canonical playlist data for valid playlist", async () => {
    const getPlaylistSpy = vi.spyOn(spotifyClient, "getPublicPlaylist").mockResolvedValue({
      id: "5gtG8dWukpPrFqF4zKG58t",
      name: "My Playlist",
      tracks: [
        { artist: "Artist A", title: "Song 1" },
        { artist: "Artist B", title: "Song 2" }
      ]
    });
    const event = createEvent({
      input: "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t?si=123",
      style: "current"
    });

    const response = await POST(event as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      playlistId: "5gtG8dWukpPrFqF4zKG58t",
      playlistName: "My Playlist",
      trackCount: 2,
      tracks: [
        { artist: "Artist A", title: "Song 1" },
        { artist: "Artist B", title: "Song 2" }
      ]
    });
    expect(getPlaylistSpy).toHaveBeenCalledOnce();
  });

  it("ignores style in request and still returns canonical tracks", async () => {
    vi.spyOn(spotifyClient, "getPublicPlaylist").mockResolvedValue({
      id: "5gtG8dWukpPrFqF4zKG58t",
      name: "My Playlist",
      tracks: [{ artist: "Artist A", title: "Song 1" }]
    });
    const event = createEvent({
      input: "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t?si=123",
      style: "plain"
    });

    const response = await POST(event as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tracks: [{ artist: "Artist A", title: "Song 1" }]
    });
  });

  it("returns tracks when style is omitted", async () => {
    vi.spyOn(spotifyClient, "getPublicPlaylist").mockResolvedValue({
      id: "5gtG8dWukpPrFqF4zKG58t",
      name: "My Playlist",
      tracks: [{ artist: "Artist A", title: "Song 1" }]
    });
    const event = createEvent({
      input: "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t?si=123"
    });

    const response = await POST(event as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tracks: [{ artist: "Artist A", title: "Song 1" }]
    });
  });

  it.each([
    [500, "Missing Spotify API credentials.", 500, "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET on the server."],
    [
      400,
      '{"error":"invalid_client","error_description":"Invalid client"}',
      502,
      "Spotify client credentials are invalid. Check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET."
    ],
    [
      401,
      '{"error":"invalid_client","error_description":"Invalid client"}',
      502,
      "Spotify client credentials are invalid. Check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET."
    ],
    [404, "Spotify failed", 404, "Playlist not found or not publicly accessible."],
    [429, "Spotify failed", 429, "Spotify rate limit reached. Please wait and try again."],
    [
      400,
      "Spotify bad request",
      502,
      "Spotify rejected this request. Check that the playlist URL is valid and public."
    ],
    [401, "Spotify failed", 502, "Spotify authorization failed."],
    [403, "Spotify failed", 502, "Spotify authorization failed."],
    [500, "Spotify failed", 502, "Spotify API error. Please try again."]
  ])(
    "maps SpotifyApiError status %i to response %i",
    async (spotifyStatus, spotifyMessage, expectedStatus, expectedError) => {
      vi.spyOn(spotifyClient, "getPublicPlaylist").mockRejectedValue(
        new spotifyClient.SpotifyApiError(spotifyStatus, String(spotifyMessage))
      );
      const event = createEvent({
        input: "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t"
      });

      const response = await POST(event as never);

      expect(response.status).toBe(expectedStatus);
      await expect(response.json()).resolves.toStrictEqual({ error: expectedError });
    }
  );
});
