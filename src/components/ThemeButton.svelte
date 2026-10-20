<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { theme, cycleTheme } from '../lib/theme.svelte';
  const label = $derived(`${t('theme')}: ${t(theme.name === 'dim' ? 'themeDim' : theme.name === 'dark' ? 'themeDark' : 'themeLight')}`);
</script>
<button class="btn icon" onclick={cycleTheme} title={label} aria-label={label}>{@html icon('theme')}</button>
