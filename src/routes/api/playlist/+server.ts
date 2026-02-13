import { json } from "@sveltejs/kit";
import { CSRF_ERROR_MESSAGE, isSameOriginPostRequest } from "$lib/server/csrf";
import { parseErrorMessages } from "$lib/spotify/parse-messages";
import { extractPlaylistId } from "$lib/spotify/parse";
import { SpotifyApiError, getPublicPlaylist } from "$lib/spotify/client";

export const POST = async ({ request, fetch, url }) => {
  if (!isSameOriginPostRequest(request, url)) {
    return json({ error: CSRF_ERROR_MESSAGE }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as null | { input?: string };
  const input = body?.input ?? "";

  const parsed = extractPlaylistId(input);
  if (!parsed.ok) {
    return json({ error: parseErrorMessages[parsed.reason] }, { status: 400 });
  }

  try {
    const playlist = await getPublicPlaylist(parsed.id, fetch);
    return json({
      playlistId: playlist.id,
      playlistName: playlist.name,
      trackCount: playlist.tracks.length,
      tracks: playlist.tracks
    });
  } catch (error) {
    if (!(error instanceof SpotifyApiError)) {
      return json({ error: "Failed to fetch playlist from Spotify." }, { status: 500 });
    }

    if (error.status === 500 && error.message === "Missing Spotify API credentials.") {
      return json({ error: "Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET on the server." }, { status: 500 });
    }

    if ((error.status === 400 || error.status === 401) && /invalid_client/i.test(error.message)) {
      return json(
        { error: "Spotify client credentials are invalid. Check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET." },
        { status: 502 }
      );
    }

    if (error.status === 404) {
      return json({ error: "Playlist not found or not publicly accessible." }, { status: 404 });
    }

    if (error.status === 429) {
      return json({ error: "Spotify rate limit reached. Please wait and try again." }, { status: 429 });
    }

    if (error.status === 400) {
      return json(
        { error: "Spotify rejected this request. Check that the playlist URL is valid and public." },
        { status: 502 }
      );
    }

    if (error.status === 401 || error.status === 403) {
      return json({ error: "Spotify authorization failed." }, { status: 502 });
    }

    return json({ error: "Spotify API error. Please try again." }, { status: 502 });
  }
};
