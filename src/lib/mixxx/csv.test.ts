import { describe, expect, it } from "vitest";
import { parseMixxxCsv } from "./csv";

const sampleMixxxCsv = `"#","Timestamp","Played","Last Played","Album Artist","Album","Artist","Title","Year"
"1","","0","","4 Non Blondes","Bigger, Better, Faster, More!","4 Non Blondes","Spaceman","1992"
"2","","0","","50 Year Storm","Grace","50 Year Storm","Grace","2021"`;

describe("parseMixxxCsv", () => {
  it("parses tracks from Mixxx CSV and derives playlist name from file", () => {
    const result = parseMixxxCsv(sampleMixxxCsv, "mixxx-export.csv");

    expect(result).toStrictEqual({
      ok: true,
      playlistName: "mixxx-export",
      tracks: [
        { artist: "4 Non Blondes", title: "Spaceman" },
        { artist: "50 Year Storm", title: "Grace" }
      ]
    });
  });

  it("falls back to Album Artist and Unknown Artist when Artist is missing", () => {
    const csv = `"Album Artist","Artist","Title"
"Album Artist Name","","Song A"
"","","Song B"`;

    const result = parseMixxxCsv(csv);

    expect(result).toStrictEqual({
      ok: true,
      playlistName: "Mixxx CSV",
      tracks: [
        { artist: "Album Artist Name", title: "Song A" },
        { artist: "Unknown Artist", title: "Song B" }
      ]
    });
  });

  it("returns error for empty input", () => {
    expect(parseMixxxCsv("   ")).toStrictEqual({
      ok: false,
      error: "Upload a non-empty Mixxx CSV file."
    });
  });

  it("returns error when required columns are missing", () => {
    const csv = `"Album","Genre"
"A","Rock"`;

    expect(parseMixxxCsv(csv)).toStrictEqual({
      ok: false,
      error: "CSV must include Artist (or Album Artist) and Title columns."
    });
  });

  it("returns error when no rows contain a title", () => {
    const csv = `"Artist","Title"
"A",""
"B","  "`;

    expect(parseMixxxCsv(csv)).toStrictEqual({
      ok: false,
      error: "No playable tracks found in Mixxx CSV."
    });
  });

  it("supports BOM in header row", () => {
    const csv = `"\uFEFFTitle","Artist"
"Song A","Artist A"`;

    const result = parseMixxxCsv(csv);

    expect(result).toStrictEqual({
      ok: true,
      playlistName: "Mixxx CSV",
      tracks: [{ artist: "Artist A", title: "Song A" }]
    });
  });

  it("parses embedded commas and newlines inside quoted fields", () => {
    const csv = `"Artist","Title"
"Artist, A","Line 1
Line 2, Remix"`;

    const result = parseMixxxCsv(csv);

    expect(result).toStrictEqual({
      ok: true,
      playlistName: "Mixxx CSV",
      tracks: [{ artist: "Artist, A", title: "Line 1\nLine 2, Remix" }]
    });
  });

  it("handles duplicate and whitespace-padded headers", () => {
    const csv = `"  Artist  ","Title","Artist"
"Primary Artist","Song A","Secondary Artist"`;

    const result = parseMixxxCsv(csv);

    expect(result).toStrictEqual({
      ok: true,
      playlistName: "Mixxx CSV",
      tracks: [{ artist: "Primary Artist", title: "Song A" }]
    });
  });

  it("parses large CSV exports (performance sanity)", () => {
    const rowCount = 10000;
    const rows = Array.from({ length: rowCount }, (_, i) => `"Artist ${i}","Song ${i}"`).join("\n");
    const csv = `"Artist","Title"\n${rows}`;

    const result = parseMixxxCsv(csv);

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
