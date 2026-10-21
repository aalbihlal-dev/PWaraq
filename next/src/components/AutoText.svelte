<script lang="ts">
  // A text field that grows with its text (up to `maxLines`, then scrolls) so a long title is never hidden sideways; long Arabic or
  // unbroken words wrap too. Enter stays out of the text unless `multiline`; pasted line breaks become spaces.
  let { value = $bindable(''), multiline = false, maxLines = 4, variant = 'field', auto = false, readonly = false, placeholder = '', label, oninput }:
    { value?: string; multiline?: boolean; maxLines?: number; variant?: 'field' | 'title' | 'plain' | 'note'; auto?: boolean; readonly?: boolean; placeholder?: string; label: string; oninput?: () => void } = $props();
  let el = $state<HTMLTextAreaElement>();
  function fit() {
    if (!el) return;
    el.style.height = 'auto';
    const s = getComputedStyle(el), line = parseFloat(s.lineHeight) || 20, border = el.offsetHeight - el.clientHeight, pad = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) + border;
    el.style.height = Math.min(el.scrollHeight + border, line * maxLines + pad) + 'px'; // border-box: the border counts
  }
  $effect(() => { value; fit(); }); // text changed from outside too (undo, another field)
  $effect(() => { if (!el) return; const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect(); }); // and when the width changes
</script>

<textarea bind:this={el} bind:value rows="1" class="{variant} wq-auto" class:auto {readonly} {placeholder} aria-label={label} spellcheck="false"
  onkeydown={(e) => { if (e.key === 'Enter' && !multiline && !e.isComposing) e.preventDefault(); }}
  oninput={() => { if (!multiline && /[\r\n]/.test(value)) value = value.replace(/\s*[\r\n]+\s*/g, ' '); fit(); oninput?.(); }}></textarea>

<style>
  textarea { box-sizing: border-box; width: 100%; min-height: var(--control); padding: 6px var(--s-12); resize: none; overflow-y: auto; overflow-wrap: anywhere; font: inherit; line-height: 1.4; color: var(--ink); text-align: start;
    border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); }
  textarea.title { font-size: var(--fs-18); font-weight: 600; border-color: transparent; background: transparent; }
  textarea.title:hover, textarea.title:focus { border-color: var(--line); background: var(--surface); }
  textarea.plain, textarea.note { border-color: transparent; background: transparent; }
  textarea.auto { background: var(--green-soft); border-color: var(--green); } /* a title taken from the file name until it is renamed */
  textarea:read-only { background: transparent; }
</style>
