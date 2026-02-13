import type { PlaylistTrack } from "$lib/spotify/client";
import { collectRows, normalizeHeader, parseCsvRows, toPlaylistName } from "$lib/csv/shared";

type ParseDjayCsvOk = {
  ok: true;
  playlistName: string;
  tracks: PlaylistTrack[];
};

type ParseDjayCsvErr = {
  ok: false;
  error: string;
};

type ParseDjayCsvResult = ParseDjayCsvOk | ParseDjayCsvErr;

export function parseDjayCsv(content: string, fileName?: string): ParseDjayCsvResult {
  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, error: "Upload a non-empty Djay Pro CSV file." };
  }

  const rows = parseCsvRows(trimmed);
  if (!rows.length) {
    return { ok: false, error: "Unable to parse Djay Pro CSV rows." };
  }

  const headers = rows[0]!.map(normalizeHeader);
  const artistIndex = headers.indexOf("artist");
  const titleIndex = headers.indexOf("title");

  if (titleIndex === -1 || artistIndex === -1) {
    return { ok: false, error: "CSV must include Artist and Title columns." };
  }

  const tracks = collectRows(rows, 1, (row): PlaylistTrack | null => {
    const title = (row[titleIndex] ?? "").trim();
    const artist = (row[artistIndex] ?? "").trim() || "Unknown Artist";
    return title ? { artist, title } : null;
  });

  if (!tracks.length) {
    return { ok: false, error: "No playable tracks found in Djay Pro CSV." };
  }

  return {
    ok: true,
    playlistName: toPlaylistName(fileName, "Djay Pro CSV"),
    tracks
  };
}
