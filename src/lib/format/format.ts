export type FormattableTrack =
  | { artist: string; title: string }
  | { name: string; artists: { name: string }[] }
  | { track: { name: string; artists: { name: string }[] } | null };
type NormalizedTrack = { artist: string; title: string };
type SpotifyLikeTrack = { name: string; artists: { name: string }[] };
type SpotifyTrackInput =
  | { name: string; artists: { name: string }[] }
  | { track: { name: string; artists: { name: string }[] } | null };

export const FORMAT_STYLES = ["current", "me_now_playing", "plain"] as const;
export type FormatStyle = (typeof FORMAT_STYLES)[number];

export const FORMAT_STYLE_OPTIONS: Array<{ value: FormatStyle; label: string }> = [
  { value: "current", label: "Full Emojis w/ colour (🎶 now playing... {artist} - {title} 🎶)" },
  { value: "me_now_playing", label: "Basic (/me now playing... {artist} - {title})" },
  { value: "plain", label: "Plain ({artist} - {title})" }
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSpotifyTrack(input: SpotifyTrackInput): SpotifyLikeTrack | null {
  const spotifyTrack = "track" in input ? input.track : input;
  if (!spotifyTrack || !isObject(spotifyTrack)) return null;
  if (typeof spotifyTrack.name !== "string" || !spotifyTrack.name) return null;

  const artists = Array.isArray(spotifyTrack.artists) ? spotifyTrack.artists : [];
  return { name: spotifyTrack.name, artists };
}

function extractArtistNames(artists: unknown[]): string[] {
  return artists
    .map((artist) => (isObject(artist) && typeof artist.name === "string" ? artist.name : null))
    .filter((name): name is string => Boolean(name));
}

function normalizeTrack(input: FormattableTrack): NormalizedTrack | null {
  if ("artist" in input && "title" in input) {
    return { artist: input.artist, title: input.title };
  }

  const spotifyTrack = toSpotifyTrack(input);
  if (!spotifyTrack) return null;

  const artists = extractArtistNames(spotifyTrack.artists);

  return {
    artist: artists.length ? artists.join(", ") : "Unknown Artist",
    title: spotifyTrack.name
  };
}

const styleRenderers: Record<FormatStyle, (track: NormalizedTrack) => string> = {
  current: ({ artist, title }) =>
    `<color=#FACC15><sprite name="musical-notes_1F3B6"> now playing... ${artist} - ${title} <sprite name="musical-notes_1F3B6">`,
  me_now_playing: ({ artist, title }) => `/me now playing... ${artist} - ${title}`,
  plain: ({ artist, title }) => `${artist} - ${title}`
};

export function isFormatStyle(value: string): value is FormatStyle {
  return (FORMAT_STYLES as readonly string[]).includes(value);
}

export function formatTracklist(input: FormattableTrack[], style: FormatStyle = "current"): string {
  const render = styleRenderers[style];
  return input
    .map(normalizeTrack)
    .filter((track): track is NormalizedTrack => Boolean(track))
    .map(render)
    .join("\n");
}
