import { formatTracklist, type FormatStyle } from "$lib/format/format";
import type { PlaylistTrack } from "$lib/spotify/client";
import { parseErrorMessages } from "$lib/spotify/parse-messages";
import { extractPlaylistId } from "$lib/spotify/parse";

type PlaylistApiPayload = {
  error?: string;
  playlistName?: string;
  trackCount?: number;
  tracks?: unknown[];
};

export type FormatRequestResult =
  | { ok: true; playlistName: string; trackCount: number; tracks: PlaylistTrack[] }
  | { ok: false; error: string };

export function isPlaylistTrack(value: unknown): value is PlaylistTrack {
  if (typeof value !== "object" || value === null) return false;
  const track = value as Record<string, unknown>;
  return typeof track.artist === "string" && typeof track.title === "string";
}

export async function requestFormattedPlaylist(
  input: string,
  fetchFn: typeof fetch = fetch
): Promise<FormatRequestResult> {
  const parsed = extractPlaylistId(input);
  if (!parsed.ok) {
    return { ok: false, error: parseErrorMessages[parsed.reason] };
  }

  try {
    const response = await fetchFn("/api/playlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input })
    });

    const payload = (await response.json().catch(() => null)) as null | PlaylistApiPayload;
    if (
      !response.ok ||
      !payload?.playlistName ||
      typeof payload.trackCount !== "number" ||
      !Array.isArray(payload.tracks) ||
      !payload.tracks.every(isPlaylistTrack)
    ) {
      return { ok: false, error: payload?.error ?? "Failed to format playlist." };
    }

    return {
      ok: true,
      playlistName: payload.playlistName,
      trackCount: payload.trackCount,
      tracks: payload.tracks
    };
  } catch {
    return { ok: false, error: "Network error while formatting playlist. Please try again." };
  }
}

export function toFormattedOutput(tracks: PlaylistTrack[], style: FormatStyle): string {
  return formatTracklist(tracks, style);
}

export async function copyToClipboard(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = navigator.clipboard
): Promise<string> {
  if (!clipboard || typeof clipboard.writeText !== "function") {
    return "Clipboard access failed.";
  }

  try {
    await clipboard.writeText(text);
    return "Copied to clipboard.";
  } catch {
    return "Clipboard access failed.";
  }
}

export function downloadAsTextFile(
  content: string,
  playlistName: string,
  documentRef: Document = document,
  urlRef: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL
): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const fileUrl = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  const safeName = playlistName.trim().replace(/[^\w.-]+/g, "_") || "playlist";
  anchor.href = fileUrl;
  anchor.download = `${safeName}.txt`;
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  urlRef.revokeObjectURL(fileUrl);
}

export async function requestLogout(fetchFn: typeof fetch = fetch): Promise<void> {
  await fetchFn("/api/logout", { method: "POST" });
}
