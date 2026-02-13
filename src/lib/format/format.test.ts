import { describe, expect, it } from "vitest";
import { formatTracklist, isFormatStyle } from "./format";

describe("formatTrackList", () => {
  it("formats in playlist order", () => {
    const out = formatTracklist([
      { artist: "Artist A", title: "Song 1" },
      { artist: "Artist B", title: "Song 2" }
    ]);

    expect(out).toBe(
      '<color=#FACC15><sprite name="musical-notes_1F3B6"> now playing... Artist A - Song 1 <sprite name="musical-notes_1F3B6">\n' +
        '<color=#FACC15><sprite name="musical-notes_1F3B6"> now playing... Artist B - Song 2 <sprite name="musical-notes_1F3B6">'
    );
  });

  it("formats in /me now playing style", () => {
    const out = formatTracklist(
      [
        { artist: "Artist A", title: "Song 1" },
        { artist: "Artist B", title: "Song 2" }
      ],
      "me_now_playing"
    );

    expect(out).toBe("/me now playing... Artist A - Song 1\n" + "/me now playing... Artist B - Song 2");
  });

  it("formats in plain style", () => {
    const out = formatTracklist(
      [
        { artist: "Artist A", title: "Song 1" },
        { artist: "Artist B", title: "Song 2" }
      ],
      "plain"
    );

    expect(out).toBe("Artist A - Song 1\n" + "Artist B - Song 2");
  });

  it("formats spotify track objects and playlist items", () => {
    const out = formatTracklist([
      { name: "Song 1", artists: [{ name: "Artist A" }] },
      { track: { name: "Song 2", artists: [{ name: "Artist B" }, { name: "Artist C" }] } },
      { track: { name: "Song 3", artists: [] } }
    ]);

    expect(out).toBe(
      '<color=#FACC15><sprite name="musical-notes_1F3B6"> now playing... Artist A - Song 1 <sprite name="musical-notes_1F3B6">\n' +
        '<color=#FACC15><sprite name="musical-notes_1F3B6"> now playing... Artist B, Artist C - Song 2 <sprite name="musical-notes_1F3B6">\n' +
        '<color=#FACC15><sprite name="musical-notes_1F3B6"> now playing... Unknown Artist - Song 3 <sprite name="musical-notes_1F3B6">'
    );
  });

  it("skips invalid spotify track entries", () => {
    const out = formatTracklist([
      { track: null },
      { track: { name: "", artists: [] } },
      { name: "Valid", artists: [{ name: "Artist A" }] }
    ]);

    expect(out).toBe(
      '<color=#FACC15><sprite name="musical-notes_1F3B6"> now playing... Artist A - Valid <sprite name="musical-notes_1F3B6">'
    );
  });

  it("validates supported format styles", () => {
    expect(isFormatStyle("current")).toBe(true);
    expect(isFormatStyle("me_now_playing")).toBe(true);
    expect(isFormatStyle("plain")).toBe(true);
    expect(isFormatStyle("invalid")).toBe(false);
  });

  it("handles malformed artist arrays from spotify payloads", () => {
    const out = formatTracklist([
      { name: "Song A", artists: "not-an-array" as unknown as { name: string }[] },
      { name: "Song B", artists: [null, { name: 42 }, { name: "Artist B" }] as unknown as { name: string }[] }
    ]);

    expect(out).toBe(
      '<color=#FACC15><sprite name="musical-notes_1F3B6"> now playing... Unknown Artist - Song A <sprite name="musical-notes_1F3B6">\n' +
        '<color=#FACC15><sprite name="musical-notes_1F3B6"> now playing... Artist B - Song B <sprite name="musical-notes_1F3B6">'
    );
  });
});
