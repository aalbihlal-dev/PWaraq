/* UI rule audit in the spirit of lintapple (MIT, github.com/gholtzap/lintapple): checks the rendered page against
   explicit design rules. Paste into the browser console or run through the preview tool; returns findings.
   Rules: text sizes on the scale, normal text contrast >= 4.5:1 (large >= 3:1), controls >= 32 px (40 px target
   for touch), >= 8 px between controls in a group, >= 8 px inset inside control containers, no all-caps labels,
   nothing wider than the viewport. */
(() => {
  const SCALE = [12, 14, 16, 18, 20, 24, 32, 40, 48, 64];
  const findings = [];
  const add = (rule, el, value, fix) => findings.push({ rule, el: describe(el), value, fix });
  // Document content (page previews, selectable text layer) is the user's PDF, not interface.
  const visible = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden], [aria-hidden="true"], .textLayer, .pw-page, .page-preview, .pe-stage, .gradient-preview'); }; // decorative art is aria-hidden
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (el.textContent.trim() ? ' "' + el.textContent.trim().slice(0, 28) + '"' : '');
  const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const background = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.9) return c; if (getComputedStyle(e).backgroundImage !== 'none') return null; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const textEls = [...document.querySelectorAll('body *')].filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  for (const el of textEls) {
    const s = getComputedStyle(el), size = parseFloat(s.fontSize);
    if (!SCALE.includes(Math.round(size))) add('font-size', el, size + 'px', 'use a size from ' + SCALE.join('/'));
    const fg = rgb(s.color), bg = background(el);
    if (fg && bg) { const a = lum(fg) + 0.05, b = lum(bg) + 0.05, ratio = Math.max(a, b) / Math.min(a, b), large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700); if (ratio < (large ? 3 : 4.5)) add('contrast', el, ratio.toFixed(2) + ':1', 'darken the text or lighten the background'); }
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    // Exceptions: code/identifiers and the brand name are written in capitals on purpose.
    if (el.closest('code, kbd, [aria-hidden="true"]') || /WARAQ/.test(text)) {} else if (s.textTransform === 'uppercase' || (/[A-Z]{4,}/.test(text) && (text.match(/[A-Za-z]/g) || []).length > 0.6 * text.replace(/\s/g, '').length && text === text.toUpperCase() && /[A-Z]/.test(text) && text.length > 4 && !/^[A-Z0-9 .\-/]{1,6}$/.test(text))) add('all-caps', el, text.slice(0, 30), 'use sentence case');
  }
  const controls = [...document.querySelectorAll('button, [role=button], a.button, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range])')].filter(visible);
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (Math.min(r.width, r.height) < 32) add('control-size', el, Math.round(r.width) + 'x' + Math.round(r.height), 'at least 32 px (40 px for touch)');
    // A local horizontal scroll region (e.g. the phone toolbar) is allowed; its contents may extend past the screen.
    const scroller = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
    if ((r.right > innerWidth + 1 || r.left < -1) && !scroller(el)) add('bounds', el, Math.round(r.left) + '..' + Math.round(r.right), 'keep inside the viewport');
  }
  // Gaps between neighbouring controls in the same group, and insets inside control containers.
  const groups = new Set(controls.map((c) => c.parentElement));
  for (const g of groups) {
    const kids = [...g.children].filter((c) => controls.includes(c)).map((c) => c.getBoundingClientRect());
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1], b = kids[i], sameRow = Math.abs(a.top - b.top) < 4;
      const gap = sameRow ? Math.abs(b.left - a.right) < Math.abs(a.left - b.right) ? b.left - a.right : a.left - b.right : b.top - a.bottom;
      if (gap >= 0 && gap < 8) add('control-gap', g, Math.round(gap) + 'px', 'gap: 8px');
    }
    const box = g.getBoundingClientRect(), s = getComputedStyle(g);
    if ((s.borderStyle !== 'none' && parseFloat(s.borderWidth) > 0) || (rgb(s.backgroundColor)?.a > 0.9 && g !== document.body)) {
      for (const k of kids) { const inset = Math.min(k.left - box.left, box.right - k.right, k.top - box.top, box.bottom - k.bottom); if (inset >= 0 && inset < 8 && kids.length > 1) { add('control-inset', g, Math.round(inset) + 'px', 'padding: 8px'); break; } }
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) add('bounds', document.documentElement, 'page scrolls sideways (' + document.documentElement.scrollWidth + ' > ' + innerWidth + ')', 'nothing wider than the screen');
  const byRule = findings.reduce((m, f) => ((m[f.rule] = (m[f.rule] || 0) + 1), m), {});
  return { width: innerWidth, total: findings.length, byRule, sample: findings.slice(0, 40) };
})();
