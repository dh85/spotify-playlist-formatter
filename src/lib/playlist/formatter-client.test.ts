import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTracklist } from "$lib/format/format";
import {
  copyToClipboard,
  downloadAsTextFile,
  requestFormattedPlaylist,
  requestLogout,
  toFormattedOutput
} from "./formatter-client";

function okJson(payload: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(payload)
  } as unknown as Response;
}

function badJson(error: string) {
  return {
    ok: false,
    json: vi.fn().mockResolvedValue({ error })
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requestFormattedPlaylist", () => {
  it("returns parse error and skips fetch for invalid input", async () => {
    const fetchMock = vi.fn();
    const result = await requestFormattedPlaylist("bad input", fetchMock as never);

    expect(result).toStrictEqual({ ok: false, error: "Enter a valid URL or Spotify playlist URI." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns API error message when request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(badJson("Spotify API error. Please try again."));
    const result = await requestFormattedPlaylist(
      "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t",
      fetchMock as never
    );

    expect(result).toStrictEqual({ ok: false, error: "Spotify API error. Please try again." });
  });

  it("returns default error for malformed success payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ playlistName: "Broken", trackCount: 2, tracks: "bad" }));
    const result = await requestFormattedPlaylist(
      "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t",
      fetchMock as never
    );

    expect(result).toStrictEqual({ ok: false, error: "Failed to format playlist." });
  });

  it("returns success payload when response is valid", async () => {
    const tracks = [{ artist: "Artist A", title: "Song 1" }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ playlistName: "My Playlist", trackCount: tracks.length, tracks }));
    const result = await requestFormattedPlaylist(
      "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t",
      fetchMock as never
    );

    expect(result).toStrictEqual({ ok: true, playlistName: "My Playlist", trackCount: 1, tracks });
  });

  it("returns network error when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await requestFormattedPlaylist(
      "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t",
      fetchMock as never
    );

    expect(result).toStrictEqual({ ok: false, error: "Network error while formatting playlist. Please try again." });
  });
});

describe("toFormattedOutput", () => {
  it("formats tracks using selected style", () => {
    const tracks = [{ artist: "Artist A", title: "Song 1" }];
    expect(toFormattedOutput(tracks, "plain")).toBe(formatTracklist(tracks, "plain"));
  });
});

describe("copyToClipboard", () => {
  it("returns failure message when clipboard API is unavailable", async () => {
    await expect(copyToClipboard("hello", undefined)).resolves.toBe("Clipboard access failed.");
  });

  it("returns success message on write success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyToClipboard("hello", { writeText })).resolves.toBe("Copied to clipboard.");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("returns failure message on write failure", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    await expect(copyToClipboard("hello", { writeText })).resolves.toBe("Clipboard access failed.");
  });
});

describe("downloadAsTextFile", () => {
  it("creates and clicks anchor with sanitized filename", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const remove = vi.fn();
    const anchor: { href: string; download: string; click: () => void; remove: () => void } = {
      href: "",
      download: "",
      click,
      remove
    };
    const appendChild = vi.fn();
    const documentRef = {
      createElement: vi.fn().mockReturnValue(anchor),
      body: { appendChild }
    } as unknown as Document;

    downloadAsTextFile("content", "My Playlist", documentRef, { createObjectURL, revokeObjectURL });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(anchor.download).toBe("My_Playlist.txt");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

describe("requestLogout", () => {
  it("posts to logout endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({}));

    await requestLogout(fetchMock as never);

    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
  });
});
