<script lang="ts">
  import FormatStyleOptions from "./components/format-style-options.svelte";
  import PlaylistSummary from "./components/playlist-summary.svelte";
  import { navigateTo } from "$lib/browser/navigation";
  import "$lib/styles/base.css";
  import { type FormatStyle } from "$lib/format/format";
  import { parseDjayCsv } from "$lib/djay/csv";
  import { parseMixxxCsv } from "$lib/mixxx/csv";
  import {
    copyToClipboard,
    downloadAsTextFile,
    requestFormattedPlaylist,
    requestLogout,
    toFormattedOutput
  } from "$lib/playlist/formatter-client";
  import type { PlaylistTrack } from "$lib/spotify/client";
  import "./page.css";

  type InputSource = "spotify" | "mixxx" | "djay";

  let source = $state<InputSource>("spotify");
  let playlistInput = $state("");
  let mixxxFile = $state<File | null>(null);
  let selectedStyle = $state<FormatStyle>("current");
  let error = $state("");
  let playlistName = $state("");
  let trackCount = $state(0);
  let fetchedTracks = $state<PlaylistTrack[]>([]);
  let formattedOutput = $state("");
  let copyStatus = $state("");
  let isFormatting = $state(false);
  let isLoggingOut = $state(false);

  const sourceHintId = "source-input-hint";
  const errorId = "source-input-error";

  const sourceOptions: Array<{ value: InputSource; label: string }> = [
    { value: "spotify", label: "Spotify" },
    { value: "mixxx", label: "Mixxx" },
    { value: "djay", label: "Djay Pro" }
  ];

  function applyTracks(name: string, tracks: PlaylistTrack[]) {
    playlistName = name;
    trackCount = tracks.length;
    fetchedTracks = tracks;
    formattedOutput = toFormattedOutput(tracks, selectedStyle);
  }

  function onSourceChange() {
    error = "";
    copyStatus = "";
    formattedOutput = "";
    playlistName = "";
    trackCount = 0;
    fetchedTracks = [];
    if (source === "spotify") {
      mixxxFile = null;
    } else {
      playlistInput = "";
    }
  }

  function onMixxxFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    mixxxFile = input.files?.[0] ?? null;
  }

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();

    isFormatting = true;
    error = "";
    playlistName = "";
    trackCount = 0;
    fetchedTracks = [];
    formattedOutput = "";
    copyStatus = "";

    if (source !== "spotify") {
      if (!mixxxFile) {
        error = source === "mixxx" ? "Upload a Mixxx CSV export first." : "Upload a Djay Pro CSV export first.";
        isFormatting = false;
        return;
      }

      const csvContent = await mixxxFile.text().catch(() => null);
      if (!csvContent) {
        error = source === "mixxx" ? "Unable to read Mixxx CSV file." : "Unable to read Djay Pro CSV file.";
        isFormatting = false;
        return;
      }

      const parsedCsv =
        source === "mixxx" ? parseMixxxCsv(csvContent, mixxxFile.name) : parseDjayCsv(csvContent, mixxxFile.name);
      if (!parsedCsv.ok) {
        error = parsedCsv.error;
        isFormatting = false;
        return;
      }

      applyTracks(parsedCsv.playlistName, parsedCsv.tracks);
      isFormatting = false;
      return;
    }

    const result = await requestFormattedPlaylist(playlistInput);
    if (!result.ok) {
      error = result.error;
      isFormatting = false;
      return;
    }

    applyTracks(result.playlistName, result.tracks);
    isFormatting = false;
  }

  $effect(() => {
    if (!fetchedTracks.length) return;
    formattedOutput = toFormattedOutput(fetchedTracks, selectedStyle);
    copyStatus = "";
  });

  async function copyOutput() {
    copyStatus = await copyToClipboard(formattedOutput);
  }

  function downloadOutput() {
    downloadAsTextFile(formattedOutput, playlistName);
  }

  async function logout() {
    isLoggingOut = true;
    await requestLogout();
    navigateTo("/login");
  }
</script>

<main class="format-shell">
  <section class="format-card" aria-labelledby="format-title">
    <div class="card-actions">
      <button class="logout-button" type="button" onclick={logout} disabled={isLoggingOut}>
        {isLoggingOut ? "Logging out..." : "Logout"}
      </button>
    </div>
    <div class="brand-mark" aria-hidden="true"></div>
    <h1 id="format-title" class="format-title">Format Playlist</h1>
    <p class="subtitle">
      {source === "spotify"
        ? "Paste a Spotify playlist URL to prepare it for formatting."
        : source === "mixxx"
          ? "Upload a Mixxx CSV export to format track output."
          : "Upload a Djay Pro CSV export to format track output."}
    </p>

    <form class="format-form" onsubmit={onSubmit} novalidate>
      <label class="format-label" for="source-select">Source</label>
      <select class="format-select" id="source-select" bind:value={source} onchange={onSourceChange}>
        {#each sourceOptions as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>

      {#if source === "spotify"}
        <label class="format-label" for="playlist-url">Spotify Playlist URL</label>
        <input
          class="format-input"
          id="playlist-url"
          type="url"
          bind:value={playlistInput}
          placeholder="https://open.spotify.com/playlist/..."
          inputmode="url"
          spellcheck={false}
          autocomplete="off"
          aria-required="true"
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${sourceHintId} ${errorId}` : sourceHintId}
          required={source === "spotify"}
        />
        <p id={sourceHintId} class="format-hint">Supported: Spotify URL, URI, or raw playlist ID.</p>
      {:else if source === "mixxx"}
        <label class="format-label" for="source-csv">Mixxx CSV</label>
        <input
          class="format-input"
          id="source-csv"
          type="file"
          accept=".csv,text/csv"
          aria-required="true"
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${sourceHintId} ${errorId}` : sourceHintId}
          onchange={onMixxxFileChange}
          required={source === "mixxx"}
        />
        <p id={sourceHintId} class="format-hint">Export from Mixxx as CSV and upload it here.</p>
      {:else}
        <label class="format-label" for="source-csv">Djay Pro CSV</label>
        <input
          class="format-input"
          id="source-csv"
          type="file"
          accept=".csv,text/csv"
          aria-required="true"
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${sourceHintId} ${errorId}` : sourceHintId}
          onchange={onMixxxFileChange}
          required={source === "djay"}
        />
        <p id={sourceHintId} class="format-hint">Export from Djay Pro as CSV and upload it here.</p>
      {/if}

      <label class="format-label" for="format-style">Format style</label>
      <select class="format-select" id="format-style" bind:value={selectedStyle}>
        <FormatStyleOptions />
      </select>

      <button class="format-button" type="submit" disabled={isFormatting} aria-busy={isFormatting ? "true" : "false"}>
        {isFormatting ? "Formatting..." : "Format"}
      </button>

      {#if error}
        <p id={errorId} class="error" role="alert" aria-live="assertive">{error}</p>
      {/if}

      {#if formattedOutput}
        <div class="result-panel" aria-live="polite">
          <PlaylistSummary {playlistName} {trackCount} />
          <div class="result-actions">
            <button class="utility-button" type="button" onclick={copyOutput}>Copy</button>
            <button class="utility-button" type="button" onclick={downloadOutput}>Download .txt</button>
          </div>
          {#if copyStatus}
            <p class="result-meta">{copyStatus}</p>
          {/if}
          <label class="result-label" for="formatted-output">Formatted output</label>
          <textarea id="formatted-output" class="result-output" readonly value={formattedOutput}></textarea>
        </div>
      {/if}
    </form>
  </section>
</main>
