export type ParseOk = { ok: true; id: string };
export type ParseErr = {
  ok: false;
  reason: "empty" | "not_url" | "wrong_type" | "bad_host" | "missing_id" | "invalid_id";
};
export type ParseResult = ParseOk | ParseErr;

const PLAYLIST_ID_RE = /^[A-Za-z0-9]{16,64}$/;
const SPOTIFY_PLAYLIST_URI_RE = /^spotify:playlist:([A-Za-z0-9]+)$/i;
const ALLOWED_HOSTS = new Set(["open.spotify.com", "play.spotify.com"]);

function isValidPlaylistId(value: string): boolean {
  return PLAYLIST_ID_RE.test(value);
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function extractPlaylistId(input: string): ParseResult {
  const value = input.trim();

  if (!value) return { ok: false, reason: "empty" };

  const uriMatch = value.match(SPOTIFY_PLAYLIST_URI_RE)?.[1];
  if (uriMatch) return isValidPlaylistId(uriMatch) ? { ok: true, id: uriMatch } : { ok: false, reason: "invalid_id" };

  if (isValidPlaylistId(value)) return { ok: true, id: value };

  const url = parseUrl(value);
  if (!url) return { ok: false, reason: "not_url" };

  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return { ok: false, reason: "bad_host" };

  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p.toLowerCase() === "playlist");
  if (idx === -1) return { ok: false, reason: "wrong_type" };

  const id = parts[idx + 1];
  if (!id) return { ok: false, reason: "missing_id" };
  if (!isValidPlaylistId(id)) return { ok: false, reason: "invalid_id" };

  return { ok: true, id };
}
