<script lang="ts">
  let { playlistName, trackCount }: { playlistName: string; trackCount: number } = $props();
</script>

<p class="success">
  Playlist: <strong>{playlistName}</strong> ({trackCount} tracks)
</p>
