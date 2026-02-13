import { describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function textResponse(body: string, status: number): Response {
  return new Response(body, { status });
}

async function loadClient(env?: { id?: string; secret?: string }) {
  vi.resetModules();
  const id = env && "id" in env ? (env.id ?? "") : "client-id";
  const secret = env && "secret" in env ? (env.secret ?? "") : "client-secret";
  vi.doMock("$env/dynamic/private", () => ({
    env: {
      SPOTIFY_CLIENT_ID: id,
      SPOTIFY_CLIENT_SECRET: secret
    }
  }));
  return import("./client");
}

describe("spotify client", () => {
  it("fetches and paginates public playlist tracks", async () => {
    const spotify = await loadClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-1",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          name: "Road Trip",
          tracks: {
            items: [
              { track: { name: "First Song", artists: [{ name: "Artist A" }] } },
              { track: { name: "Second Song", artists: [{ name: "Artist B" }, { name: "Artist C" }] } }
            ],
            next: "https://api.spotify.com/v1/next-page"
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ track: { name: "Instrumental", artists: [] } }],
          next: null
        })
      );

    const result = await spotify.getPublicPlaylist("playlist-id", fetchMock as unknown as typeof fetch);

    expect(result).toStrictEqual({
      id: "playlist-id",
      name: "Road Trip",
      tracks: [
        { artist: "Artist A", title: "First Song" },
        { artist: "Artist B, Artist C", title: "Second Song" },
        { artist: "Unknown Artist", title: "Instrumental" }
      ]
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reuses cached token across calls", async () => {
    const spotify = await loadClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-1",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          name: "Single Page",
          tracks: { items: [], next: null }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          name: "Single Page",
          tracks: { items: [], next: null }
        })
      );

    await spotify.getPublicPlaylist("id-1", fetchMock as unknown as typeof fetch);
    await spotify.getPublicPlaylist("id-2", fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://accounts.spotify.com/api/token",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("refreshes token and retries once on 401 playlist response", async () => {
    const spotify = await loadClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-1",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(textResponse("expired", 401))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-2",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          name: "Recovered",
          tracks: { items: [], next: null }
        })
      );

    const result = await spotify.getPublicPlaylist("playlist-id", fetchMock as unknown as typeof fetch);

    expect(result.name).toBe("Recovered");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("throws when playlist stays unauthorized after a retry", async () => {
    const spotify = await loadClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-1",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(textResponse("expired", 401))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-2",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(textResponse("still unauthorized", 401));

    await expect(spotify.getPublicPlaylist("playlist-id", fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      name: "SpotifyApiError",
      status: 401,
      message: "still unauthorized"
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("throws upstream status when token endpoint fails", async () => {
    const spotify = await loadClient();
    const fetchMock = vi.fn().mockResolvedValueOnce(textResponse("token fail", 429));

    await expect(spotify.getPublicPlaylist("playlist-id", fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      name: "SpotifyApiError",
      status: 429,
      message: "token fail"
    });
  });

  it.each([
    [null, "not an object"],
    [{}, "missing access token"],
    [{ access_token: "abc", token_type: "Bearer" }, "missing expires"],
    [{ access_token: "abc", token_type: "Basic", expires_in: 3600 }, "wrong token type"],
    [{ access_token: "", token_type: "Bearer", expires_in: 3600 }, "empty token"]
  ])("rejects invalid token payload (%s)", async (...[invalidPayload]) => {
    const spotify = await loadClient();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(invalidPayload));

    await expect(spotify.getPublicPlaylist("playlist-id", fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      name: "SpotifyApiError",
      status: 502,
      message: "Spotify token response was invalid."
    });
  });

  it("rejects invalid playlist payload shape", async () => {
    const spotify = await loadClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-1",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(jsonResponse({ tracks: { items: [], next: null } }));

    await expect(spotify.getPublicPlaylist("playlist-id", fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      name: "SpotifyApiError",
      status: 502,
      message: "Spotify playlist response was invalid."
    });
  });

  it("rejects non-object playlist payload", async () => {
    const spotify = await loadClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-1",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(jsonResponse(null));

    await expect(spotify.getPublicPlaylist("playlist-id", fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      name: "SpotifyApiError",
      status: 502,
      message: "Spotify playlist response was invalid."
    });
  });

  it("rejects invalid pagination page payload shape", async () => {
    const spotify = await loadClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-1",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          name: "Needs Next Page",
          tracks: { items: [], next: "https://api.spotify.com/v1/next-page" }
        })
      )
      .mockResolvedValueOnce(jsonResponse({ items: "bad", next: null }));

    await expect(spotify.getPublicPlaylist("playlist-id", fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      name: "SpotifyApiError",
      status: 502,
      message: "Spotify playlist response was invalid."
    });
  });

  it("propagates playlist API error with fallback message when body is empty", async () => {
    const spotify = await loadClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-1",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(new Response("", { status: 503 }));

    await expect(spotify.getPublicPlaylist("playlist-id", fetchMock as unknown as typeof fetch)).rejects.toMatchObject({
      name: "SpotifyApiError",
      status: 503,
      message: "Spotify API request failed (503)"
    });
  });

  it("ignores malformed track items while keeping valid tracks", async () => {
    const spotify = await loadClient();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-1",
          token_type: "Bearer",
          expires_in: 3600
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          name: "Mixed Data",
          tracks: {
            items: [
              null,
              {},
              { track: null },
              { track: { name: "", artists: [] } },
              { track: { name: "No Array", artists: "oops" } },
              { track: { name: "Good", artists: [null, { name: "Artist X" }] } }
            ],
            next: null
          }
        })
      );

    const result = await spotify.getPublicPlaylist("playlist-id", fetchMock as unknown as typeof fetch);

    expect(result.tracks).toStrictEqual([
      { artist: "Unknown Artist", title: "No Array" },
      { artist: "Artist X", title: "Good" }
    ]);
  });
});
