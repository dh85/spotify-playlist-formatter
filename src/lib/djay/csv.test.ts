import { describe, expect, it } from "vitest";
import { parseDjayCsv } from "./csv";

const sampleDjayCsv = `"Title","Artist","Album","Time","BPM","Key","URL"
"Christmas Time (Don't Let the Bells End)","The Darkness","Permission To Land... Again (20th Anniversary Edition)","03:31","124.0","12B","apple-music:library:track:i.YJ84RBrSe9X1kk"
"Gambler (7"" Version)","Madonna","Gambler - Single","03:51","150.8","7A","apple-music:library:track:i.8WBlE5YSMZEv55"`;

describe("parseDjayCsv", () => {
  it("parses tracks from Djay Pro CSV and derives playlist name from file", () => {
    const result = parseDjayCsv(sampleDjayCsv, "djay-export.csv");

    expect(result).toStrictEqual({
      ok: true,
      playlistName: "djay-export",
      tracks: [
        { artist: "The Darkness", title: "Christmas Time (Don't Let the Bells End)" },
        { artist: "Madonna", title: 'Gambler (7" Version)' }
      ]
    });
  });

  it("uses Unknown Artist when artist is empty", () => {
    const csv = `"Title","Artist"
"Song A",""`;

    const result = parseDjayCsv(csv);

    expect(result).toStrictEqual({
      ok: true,
      playlistName: "Djay Pro CSV",
      tracks: [{ artist: "Unknown Artist", title: "Song A" }]
    });
  });

  it("returns error for empty input", () => {
    expect(parseDjayCsv("   ")).toStrictEqual({
      ok: false,
      error: "Upload a non-empty Djay Pro CSV file."
    });
  });

  it("returns error when required columns are missing", () => {
    const csv = `"Album","BPM"
"A","124"`;

    expect(parseDjayCsv(csv)).toStrictEqual({
      ok: false,
      error: "CSV must include Artist and Title columns."
    });
  });

  it("returns error when no rows contain a title", () => {
    const csv = `"Title","Artist"
"","Artist A"
"  ","Artist B"`;

    expect(parseDjayCsv(csv)).toStrictEqual({
      ok: false,
      error: "No playable tracks found in Djay Pro CSV."
    });
  });

  it("supports BOM in header row", () => {
    const csv = `"\uFEFFTitle","Artist"
"Song A","Artist A"`;

    const result = parseDjayCsv(csv);

    expect(result).toStrictEqual({
      ok: true,
      playlistName: "Djay Pro CSV",
      tracks: [{ artist: "Artist A", title: "Song A" }]
    });
  });

  it("parses embedded commas and newlines inside quoted fields", () => {
    const csv = `"Title","Artist"
"Line 1
Line 2, Remix","Artist, A"`;

    const result = parseDjayCsv(csv);

    expect(result).toStrictEqual({
      ok: true,
      playlistName: "Djay Pro CSV",
      tracks: [{ artist: "Artist, A", title: "Line 1\nLine 2, Remix" }]
    });
  });

  it("handles duplicate and whitespace-padded headers", () => {
    const csv = `" Title ","Artist","Artist"
"Song A","Primary Artist","Secondary Artist"`;

    const result = parseDjayCsv(csv);

    expect(result).toStrictEqual({
      ok: true,
      playlistName: "Djay Pro CSV",
      tracks: [{ artist: "Primary Artist", title: "Song A" }]
    });
  });

  it("parses large CSV exports (performance sanity)", () => {
    const rowCount = 10000;
    const rows = Array.from({ length: rowCount }, (_, i) => `"Song ${i}","Artist ${i}"`).join("\n");
    const csv = `"Title","Artist"\n${rows}`;

    const result = parseDjayCsv(csv);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tracks).toHaveLength(rowCount);
    expect(result.tracks[0]).toStrictEqual({ artist: "Artist 0", title: "Song 0" });
    expect(result.tracks[rowCount - 1]).toStrictEqual({
      artist: `Artist ${rowCount - 1}`,
      title: `Song ${rowCount - 1}`
    });
  });
});
