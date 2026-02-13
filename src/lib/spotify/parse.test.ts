import { describe, expect, it } from "vitest";
import { extractPlaylistId, type ParseResult } from "./parse";

describe("extractPlaylistId", () => {
  const validId = "5gtG8dWukpPrFqF4zKG58t";
  const minLenId = "A".repeat(16);
  const maxLenId = "Z".repeat(64);

  const cases: Array<{ name: string; input: string; expected: ParseResult }> = [
    {
      name: "returns empty for blank input",
      input: " \n\t ",
      expected: { ok: false, reason: "empty" }
    },
    {
      name: "parses spotify URI with lowercase prefix",
      input: `spotify:playlist:${validId}`,
      expected: { ok: true, id: validId }
    },
    {
      name: "parses spotify URI with uppercase prefix",
      input: `SPOTIFY:PLAYLIST:${validId}`,
      expected: { ok: true, id: validId }
    },
    {
      name: "rejects spotify URI with invalid id",
      input: "spotify:playlist:short",
      expected: { ok: false, reason: "invalid_id" }
    },
    {
      name: "parses raw id at min length boundary",
      input: minLenId,
      expected: { ok: true, id: minLenId }
    },
    {
      name: "parses raw id at max length boundary",
      input: maxLenId,
      expected: { ok: true, id: maxLenId }
    },
    {
      name: "returns not_url for non-url non-id input",
      input: "not a spotify link",
      expected: { ok: false, reason: "not_url" }
    },
    {
      name: "rejects non-spotify host",
      input: `https://example.com/playlist/${validId}`,
      expected: { ok: false, reason: "bad_host" }
    },
    {
      name: "rejects spotify URL that is not playlist",
      input: `https://open.spotify.com/track/${validId}`,
      expected: { ok: false, reason: "wrong_type" }
    },
    {
      name: "rejects playlist URL missing id",
      input: "https://open.spotify.com/playlist",
      expected: { ok: false, reason: "missing_id" }
    },
    {
      name: "rejects playlist URL with invalid id",
      input: "https://open.spotify.com/playlist/too-short",
      expected: { ok: false, reason: "invalid_id" }
    },
    {
      name: "parses valid open.spotify.com playlist URL",
      input: `https://open.spotify.com/playlist/${validId}?si=abc`,
      expected: { ok: true, id: validId }
    },
    {
      name: "parses valid play.spotify.com playlist URL",
      input: `https://play.spotify.com/user/demo/PlayList/${validId}`,
      expected: { ok: true, id: validId }
    }
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(extractPlaylistId(input)).toStrictEqual(expected);
  });
});
