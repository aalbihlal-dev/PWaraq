// Light / Dim / Dark: chosen by hand, remembered, never taken from Windows.
export const THEMES = ['light', 'dim', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
const saved = (() => { try { return localStorage.getItem('waraq-theme'); } catch { return null; } })();
export const theme = $state({ name: (THEMES as readonly string[]).includes(saved ?? '') ? (saved as Theme) : 'light' });
export const applyTheme = () => { if (theme.name === 'light') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme.name; };
export function cycleTheme() {
  theme.name = THEMES[(THEMES.indexOf(theme.name) + 1) % THEMES.length];
  applyTheme();
  try { localStorage.setItem('waraq-theme', theme.name); } catch {}
}
applyTheme();
