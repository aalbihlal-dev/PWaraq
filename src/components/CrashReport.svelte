<script lang="ts">
  // "Waraq closed unexpectedly. Your work was restored. Send a report?" — shown on the next start. The person can read the exact
  // text (Preview), then send it by email, report it on GitHub, or not send it. Nothing is sent without a click on one of the links.
  import { t } from '../lib/i18n.svelte';
  import { reportText, mailtoUrl, githubUrl, type Entry } from '../lib/crashreport';
  import { askFirst, setAsk, openFile } from '../lib/crashlog';
  import { isDesktop, openExternal } from '../lib/desktop';

  let { entry, restored, onclose }: { entry: Entry; restored: boolean; onclose: () => void } = $props();
  let dialog = $state<HTMLDialogElement>(), preview = $state(false), ask = $state(askFirst()), attach = $state(false);
  const text = $derived(reportText(entry)), mail = $derived(mailtoUrl(text)), issue = $derived(githubUrl(text));
  $effect(() => { dialog?.showModal(); });
  const finish = () => { setAsk(ask); setTimeout(onclose, 300); }; // after the browser has followed the link
  function go(e: MouseEvent, url: string, withFile = false) {
    if (isDesktop) { // the desktop program opens the mail program / browser itself; the log file is shown for attaching
      e.preventDefault(); openExternal(url);
      if (withFile) { openFile(entry); attach = true; return; }
    }
    finish();
  }
</script>

<dialog bind:this={dialog} aria-labelledby="crash-h" oncancel={(e) => { e.preventDefault(); setAsk(ask); onclose(); }}>
  <h2 id="crash-h">{t('crashTitle')}</h2>
  <p>{restored ? t('crashRestored') : t('crashAsk')}</p>
  <button class="btn" aria-expanded={preview} onclick={() => (preview = !preview)}>{preview ? t('crashHidePreview') : t('crashPreview')}</button>
  {#if preview}
    <p class="muted">{t('crashPreviewHelp')}</p>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrolling box must be reachable by keyboard) -->
    <pre dir="ltr" tabindex="0" aria-label={t('crashPreview')}>{text}</pre>
  {/if}
  <div class="buttons">
    <a class="btn primary" href={mail} onclick={(e) => go(e, mail, true)}>{t('sendEmail')}</a>
    <a class="btn" href={issue} target="_blank" rel="noopener" onclick={(e) => go(e, issue)}>{t('reportGithub')}</a>
    <button class="btn" onclick={() => { setAsk(ask); onclose(); }}>{t('dontSend')}</button>
  </div>
  {#if attach}<p class="muted" role="status">{t('crashAttach')}</p>{/if}
  <label class="ask"><input type="checkbox" bind:checked={ask} />{t('alwaysAsk')}</label>
</dialog>

<style>
  dialog { width: min(640px, calc(100% - 2 * var(--s-16))); max-height: calc(100% - 2 * var(--s-16)); overflow: auto; display: grid; gap: var(--s-12); padding: var(--s-24);
    border: 1px solid var(--line); border-radius: var(--r-16); background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
  dialog::backdrop { background: var(--veil); }
  dialog[open] { display: grid; }
  h2 { margin: 0; font-size: var(--fs-20); }
  p { margin: 0; }
  .muted { color: var(--muted); }
  pre { margin: 0; max-height: 240px; overflow: auto; padding: var(--s-12); border: 1px solid var(--line); border-radius: var(--r-8); background: var(--paper); font: 400 var(--fs-12)/1.5 ui-monospace, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--s-8); }
  .btn { text-decoration: none; width: fit-content; color: var(--ink); } /* the two links look like buttons, not like links */
  .btn.primary { color: var(--on-green); }
  .ask { display: inline-flex; align-items: center; gap: var(--s-8); min-height: var(--control); }
  .ask input { width: 18px; height: 18px; accent-color: var(--green); }
</style>
