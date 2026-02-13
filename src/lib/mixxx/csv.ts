import type { PlaylistTrack } from "$lib/spotify/client";
import { collectRows, normalizeHeader, parseCsvRows, toPlaylistName } from "$lib/csv/shared";

type ParseMixxxCsvOk = {
  ok: true;
  playlistName: string;
  tracks: PlaylistTrack[];
};

type ParseMixxxCsvErr = {
  ok: false;
  error: string;
};

type ParseMixxxCsvResult = ParseMixxxCsvOk | ParseMixxxCsvErr;

export function parseMixxxCsv(content: string, fileName?: string): ParseMixxxCsvResult {
  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, error: "Upload a non-empty Mixxx CSV file." };
  }

  const rows = parseCsvRows(trimmed);
  if (!rows.length) {
    return { ok: false, error: "Unable to parse Mixxx CSV rows." };
  }

  const headers = rows[0]!.map(normalizeHeader);
  const artistIndex = headers.indexOf("artist");
  const titleIndex = headers.indexOf("title");
  const albumArtistIndex = headers.indexOf("album artist");

  if (titleIndex === -1 || (artistIndex === -1 && albumArtistIndex === -1)) {
    return { ok: false, error: "CSV must include Artist (or Album Artist) and Title columns." };
  }

  const tracks = collectRows(rows, 1, (row): PlaylistTrack | null => {
    const title = (row[titleIndex] ?? "").trim();
    const primaryArtist = artistIndex === -1 ? "" : (row[artistIndex] ?? "").trim();
    const fallbackArtist = albumArtistIndex === -1 ? "" : (row[albumArtistIndex] ?? "").trim();
    const artist = primaryArtist || fallbackArtist || "Unknown Artist";

    return title ? { artist, title } : null;
  });

  if (!tracks.length) {
    return { ok: false, error: "No playable tracks found in Mixxx CSV." };
  }

  return {
    ok: true,
    playlistName: toPlaylistName(fileName, "Mixxx CSV"),
    tracks
  };
}
