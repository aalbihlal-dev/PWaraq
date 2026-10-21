<script lang="ts">
  import { t } from '../lib/i18n.svelte';
  import { icon } from '../lib/icons.js';
  import { theme, cycleTheme } from '../lib/theme.svelte';
  const NAMES = { light: 'themeLight', dim: 'themeDim', dark: 'themeDark', graphite: 'themeGraphite' } as const;
  const label = $derived(`${t('theme')}: ${t(NAMES[theme.name])}`);
</script>
<button class="btn icon" onclick={cycleTheme} title={label} aria-label={label}>{@html icon('theme')}</button>
