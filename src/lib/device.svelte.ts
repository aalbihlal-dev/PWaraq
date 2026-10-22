// What kind of screen this is, kept up to date: phone (<= 600 px), narrow (<= 820 px: phones and tablets in portrait), touch (a finger, not a mouse).
export const view = $state({ phone: false, narrow: false, touch: false });
const watch = (query: string, key: keyof typeof view) => { const m = matchMedia(query), set = () => (view[key] = m.matches); set(); m.addEventListener('change', set); };
if (typeof matchMedia !== 'undefined') { watch('(max-width: 600px)', 'phone'); watch('(max-width: 820px)', 'narrow'); watch('(pointer: coarse)', 'touch'); }
