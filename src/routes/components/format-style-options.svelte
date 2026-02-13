<script lang="ts">
  import { FORMAT_STYLE_OPTIONS } from "$lib/format/format";
</script>

{#each FORMAT_STYLE_OPTIONS as option (option.value)}
  <option value={option.value}>{option.label}</option>
{/each}
