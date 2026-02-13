import type { ParseErr } from "./parse";

export const parseErrorMessages: Record<ParseErr["reason"], string> = {
  empty: "Enter a Spotify playlist URL.",
  not_url: "Enter a valid URL or Spotify playlist URI.",
  wrong_type: "That URL is not a playlist.",
  bad_host: "Use an open.spotify.com playlist link.",
  missing_id: "Playlist link is missing an ID.",
  invalid_id: "Playlist ID is invalid."
};
