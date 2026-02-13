import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { formatTracklist } from "$lib/format/format";
import Page from "./+page.svelte";

const { navigateToMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn()
}));

vi.mock("$lib/browser/navigation", () => ({
  navigateTo: navigateToMock
}));

type PlaylistPayload = {
  playlistName: string;
  trackCount: number;
  tracks: Array<{ artist: string; title: string }>;
};

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

async function submitPlaylist(url: string) {
  await page.getByLabelText("Spotify Playlist URL").fill(url);
  await page.getByRole("button", { name: "Format" }).click();
}

async function switchSourceToMixxx() {
  await page.getByLabelText("Source").selectOptions("mixxx");
}

async function switchSourceToDjay() {
  await page.getByLabelText("Source").selectOptions("djay");
}

async function setCsvFile(label: string, fileName: string, content: string) {
  const input = page.getByLabelText(label).element() as HTMLInputElement;
  const file = new File([content], fileName, { type: "text/csv" });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  Object.defineProperty(input, "files", {
    value: dataTransfer.files,
    configurable: true
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

const validPlaylistUrl = "https://open.spotify.com/playlist/5gtG8dWukpPrFqF4zKG58t?si=abc";
const playlistTracks = [
  { artist: "Artist A", title: "Song 1" },
  { artist: "Artist B", title: "Song 2" }
];

beforeEach(() => {
  navigateToMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/+page.svelte", () => {
  it("renders formatter controls", async () => {
    render(Page);

    await expect.element(page.getByRole("heading", { name: "Format Playlist" })).toBeInTheDocument();
    await expect.element(page.getByLabelText("Source")).toBeInTheDocument();
    await expect.element(page.getByLabelText("Spotify Playlist URL")).toBeInTheDocument();
    await expect.element(page.getByLabelText("Format style")).toBeInTheDocument();
    await expect.element(page.getByRole("option", { name: /full emojis/i })).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Format" })).toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Logout" })).toBeInTheDocument();
    await expect.element(page.getByRole("option", { name: "Djay Pro" })).toBeInTheDocument();
  });

  it("renders all format style options", async () => {
    render(Page);

    const select = page.getByLabelText("Format style");
    await expect.element(select).toBeInTheDocument();
    await expect.element(page.getByRole("option", { name: /full emojis/i })).toBeInTheDocument();
    await expect.element(page.getByRole("option", { name: /basic \(\/me now playing/i })).toBeInTheDocument();
    await expect.element(page.getByRole("option", { name: /plain \(\{artist\} - \{title\}\)/i })).toBeInTheDocument();
  });

  it("shows parse error for invalid input without calling API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist("not a spotify link");

    await expect.element(page.getByRole("alert")).toHaveTextContent("Enter a valid URL or Spotify playlist URI.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switches to Mixxx mode and requires CSV upload", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await switchSourceToMixxx();
    await expect.element(page.getByLabelText("Mixxx CSV")).toBeInTheDocument();
    await expect.element(page.getByText("Upload a Mixxx CSV export to format track output.")).toBeInTheDocument();

    await page.getByRole("button", { name: "Format" }).click();

    await expect.element(page.getByRole("alert")).toHaveTextContent("Upload a Mixxx CSV export first.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles Mixxx file input change and formats from uploaded CSV", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await switchSourceToMixxx();
    await setCsvFile(
      "Mixxx CSV",
      "mixxx-export.csv",
      `"Artist","Title"
"4 Non Blondes","Spaceman"
"50 Year Storm","Grace"`
    );
    await page.getByRole("button", { name: "Format" }).click();

    await expect.element(page.getByText("Playlist: mixxx-export (2 tracks)")).toBeInTheDocument();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("switches to Djay mode and requires CSV upload", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await switchSourceToDjay();
    await expect.element(page.getByLabelText("Djay Pro CSV")).toBeInTheDocument();
    await expect.element(page.getByText("Upload a Djay Pro CSV export to format track output.")).toBeInTheDocument();

    await page.getByRole("button", { name: "Format" }).click();

    await expect.element(page.getByRole("alert")).toHaveTextContent("Upload a Djay Pro CSV export first.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles Djay file input change and formats from uploaded CSV", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await switchSourceToDjay();
    await setCsvFile(
      "Djay Pro CSV",
      "djay-export.csv",
      `"Title","Artist","Album"
"Faint","LINKIN PARK","Meteora"
"Dangerous","Roxette","Look Sharp!"`
    );
    await page.getByRole("button", { name: "Format" }).click();

    await expect.element(page.getByText("Playlist: djay-export (2 tracks)")).toBeInTheDocument();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows API error when formatting fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(badJson("Spotify API error. Please try again."));
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist(validPlaylistUrl);

    await expect.element(page.getByRole("alert")).toHaveTextContent("Spotify API error. Please try again.");
    expect(fetchMock).toHaveBeenCalledWith("/api/playlist", expect.any(Object));
  });

  it("shows network error and resets submit state when fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist(validPlaylistUrl);

    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("Network error while formatting playlist. Please try again.");
    await expect.element(page.getByRole("button", { name: "Format" })).toBeEnabled();
  });

  it("renders formatted result and updates style locally without refetch", async () => {
    const payload: PlaylistPayload = {
      playlistName: "My Playlist",
      trackCount: playlistTracks.length,
      tracks: playlistTracks
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson(payload));
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist(validPlaylistUrl);

    await expect.element(page.getByText("Playlist: My Playlist (2 tracks)")).toBeInTheDocument();
    await expect
      .element(page.getByLabelText("Formatted output"))
      .toHaveValue(formatTracklist(playlistTracks, "current"));

    await page.getByLabelText("Format style").selectOptions("plain");

    await expect.element(page.getByLabelText("Formatted output")).toHaveValue(formatTracklist(playlistTracks, "plain"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows default error when response payload is malformed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ playlistName: "Broken", trackCount: 2, tracks: "bad" }));
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist(validPlaylistUrl);

    await expect.element(page.getByRole("alert")).toHaveTextContent("Failed to format playlist.");
  });

  it("shows default error when response JSON parsing fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error("invalid json"))
    });
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist(validPlaylistUrl);

    await expect.element(page.getByRole("alert")).toHaveTextContent("Failed to format playlist.");
  });

  it("shows default error when tracks array contains invalid entries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ playlistName: "Broken", trackCount: 1, tracks: [null] }));
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist(validPlaylistUrl);

    await expect.element(page.getByRole("alert")).toHaveTextContent("Failed to format playlist.");
  });

  it("copies output and shows success status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson({ playlistName: "Copy Test", trackCount: playlistTracks.length, tracks: playlistTracks })
      );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist(validPlaylistUrl);
    await page.getByRole("button", { name: "Copy" }).click();

    expect(writeText).toHaveBeenCalledWith(formatTracklist(playlistTracks, "current"));
    await expect.element(page.getByText("Copied to clipboard.")).toBeInTheDocument();
  });

  it("shows copy failure status when clipboard write fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson({ playlistName: "Copy Test", trackCount: playlistTracks.length, tracks: playlistTracks })
      );
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist(validPlaylistUrl);
    await page.getByRole("button", { name: "Copy" }).click();

    await expect.element(page.getByText("Clipboard access failed.")).toBeInTheDocument();
  });

  it("downloads output as txt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson({ playlistName: "My Playlist", trackCount: playlistTracks.length, tracks: playlistTracks })
      );
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, "appendChild");
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist(validPlaylistUrl);
    await page.getByRole("button", { name: "Download .txt" }).click();

    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    expect(revokeObjectURLSpy).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    const appendedAnchor = appendSpy.mock.calls
      .map(([node]) => node)
      .find((node) => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
    if (!appendedAnchor) throw new Error("Expected a downloaded anchor element");
    expect(appendedAnchor.download).toBe("My_Playlist.txt");
  });

  it("uses fallback filename when playlist name is blank", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ playlistName: "   ", trackCount: playlistTracks.length, tracks: playlistTracks }));
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, "appendChild");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await submitPlaylist(validPlaylistUrl);
    await page.getByRole("button", { name: "Download .txt" }).click();

    expect(createObjectURLSpy).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    const appendedAnchor = appendSpy.mock.calls
      .map(([node]) => node)
      .find((node) => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
    if (!appendedAnchor) throw new Error("Expected a downloaded anchor element");
    expect(appendedAnchor.download).toBe("playlist.txt");
  });

  it("logs out via API and navigates to login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({}));
    vi.stubGlobal("fetch", fetchMock);
    render(Page);

    await page.getByRole("button", { name: "Logout" }).click();

    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
    expect(navigateToMock).toHaveBeenCalledWith("/login");
  });
});
