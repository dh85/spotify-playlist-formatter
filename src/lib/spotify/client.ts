import { env } from "$env/dynamic/private";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const TOKEN_REFRESH_SAFETY_MS = 60_000;

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type SpotifyArtist = { name: string };
type SpotifyTrack = { name: string; artists: SpotifyArtist[] };
type SpotifyTrackItem = { track: SpotifyTrack | null };
type PlaylistPage = { items: SpotifyTrackItem[]; next: string | null };
type PlaylistResponse = { name: string; tracks: PlaylistPage };

export type PlaylistTrack = { artist: string; title: string };
export type PublicPlaylist = { id: string; name: string; tracks: PlaylistTrack[] };

export class SpotifyApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function getBasicAuthHeaderValue(): string {
  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new SpotifyApiError(500, "Missing Spotify API credentials.");
  }

  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Spotify API request failed (${response.status})`;
}

function parseTokenResponse(value: unknown): TokenResponse {
  if (!isRecord(value)) {
    throw new SpotifyApiError(502, "Spotify token response was invalid.");
  }

  const accessToken = asNonEmptyString(value.access_token);
  const tokenType = asNonEmptyString(value.token_type);
  const expiresIn = asPositiveNumber(value.expires_in);

  if (!accessToken || !tokenType || !expiresIn || tokenType.toLowerCase() !== "bearer") {
    throw new SpotifyApiError(502, "Spotify token response was invalid.");
  }

  return {
    access_token: accessToken,
    token_type: tokenType,
    expires_in: expiresIn
  };
}

function parsePlaylistTrack(item: unknown): PlaylistTrack[] {
  if (!isRecord(item)) return [];
  const track = item.track;
  if (!isRecord(track)) return [];

  const title = asNonEmptyString(track.name);
  if (!title) return [];

  const artistsRaw = Array.isArray(track.artists) ? track.artists : [];
  const artistNames = artistsRaw
    .map((artist) => (isRecord(artist) ? asNonEmptyString(artist.name) : null))
    .filter((name): name is string => Boolean(name));

  return [
    {
      artist: artistNames.length ? artistNames.join(", ") : "Unknown Artist",
      title
    }
  ];
}

function parsePlaylistPage(value: unknown): PlaylistPage {
  if (!isRecord(value) || !Array.isArray(value.items) || (value.next !== null && typeof value.next !== "string")) {
    throw new SpotifyApiError(502, "Spotify playlist response was invalid.");
  }

  return {
    items: value.items as SpotifyTrackItem[],
    next: value.next
  };
}

function parsePlaylistResponse(value: unknown): PlaylistResponse {
  if (!isRecord(value)) {
    throw new SpotifyApiError(502, "Spotify playlist response was invalid.");
  }

  const name = asNonEmptyString(value.name);
  if (!name) {
    throw new SpotifyApiError(502, "Spotify playlist response was invalid.");
  }

  return {
    name,
    tracks: parsePlaylistPage(value.tracks)
  };
}

async function getAccessToken(fetchFn: typeof fetch): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_SAFETY_MS) {
    return cachedToken.value;
  }

  const response = await fetchFn(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeaderValue(),
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });

  if (!response.ok) {
    throw new SpotifyApiError(response.status, await readErrorMessage(response));
  }

  const token = parseTokenResponse(await response.json());

  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000
  };

  return token.access_token;
}

async function spotifyGetJson(url: string, fetchFn: typeof fetch, allowRetry = true): Promise<unknown> {
  const accessToken = await getAccessToken(fetchFn);
  const response = await fetchFn(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (response.status === 401 && allowRetry) {
    cachedToken = null;
    return spotifyGetJson(url, fetchFn, false);
  }

  if (!response.ok) {
    throw new SpotifyApiError(response.status, await readErrorMessage(response));
  }

  return await response.json();
}

export async function getPublicPlaylist(id: string, fetchFn: typeof fetch = fetch): Promise<PublicPlaylist> {
  const playlistUrl = `${SPOTIFY_API_BASE}/playlists/${encodeURIComponent(id)}?fields=name,tracks.items(track(name,artists(name))),tracks.next`;
  const playlist = parsePlaylistResponse(await spotifyGetJson(playlistUrl, fetchFn));

  const allItems = [...playlist.tracks.items];
  let next = playlist.tracks.next;

  while (next) {
    const page = parsePlaylistPage(await spotifyGetJson(next, fetchFn));
    allItems.push(...page.items);
    next = page.next;
  }

  const tracks = allItems.flatMap(parsePlaylistTrack);
  return { id, name: playlist.name, tracks };
}
