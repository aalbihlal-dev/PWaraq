// Crash reports: what is written to the crash log and the exact text that may be sent. Pure (no browser calls), so Node tests it.
// The rule: nothing from a document goes in — no text, no file names, no folders. Entries hold only what Waraq itself knows
// (version, system, language, theme, which task was open, which engine job failed, the error and its stack, a few log lines).

export type Kind = 'error' | 'rejection' | 'worker' | 'unclean' | 'panic';
export type Entry = { id: string; at: number; kind: Kind; version: string; system: string; lang: string; theme: string; task: string; job?: string;
  message: string; stack?: string; log: string[]; seen?: boolean };

export const SUPPORT = 'support@pwaraq.com', ISSUES = 'https://github.com/tshi-dev/PWaraq/issues/new?template=problem.md';
const EXT = 'pdf|waraq|docx?|xlsx?|pptx?|dwg|dxf|png|jpe?g|csv|txt';

/** Text that is safe to keep: the person's file names (the exact `names` the app knows, and anything that looks like one) become
 *  "file.pdf", folders become <path>, lines are cut short. */
export function clean(text: unknown, names: string[] = [], max = 300): string {
  let t = String(text ?? '');
  for (const n of [...names].filter((n) => n && n.length > 1).sort((a, b) => b.length - a.length)) t = t.split(n).join('file.pdf');
  t = t
    .replace(/[A-Za-z]:\\[^\s"'<>|]*/g, '<path>') // C:\Users\Sara\Documents\...
    .replace(/\\\\[^\s"'<>|]+/g, '<path>') // \\server\share
    .replace(/file:\/\/\/[^\s"'<>|]*/gi, '<path>')
    .replace(new RegExp(`[^\\s"'<>|:*?\\\\/]+\\.(?:${EXT})\\b`, 'gi'), 'file.pdf') // anything that looks like a file name
    .replace(/(?:\/(?:Users|home)\/[^\s/]+)[^\s"']*/g, '<path>');
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/** A stack trace as the lines of code only, cleaned, at most 12 lines. */
export const cleanStack = (stack: unknown, names: string[] = []) =>
  String(stack ?? '').split('\n').slice(0, 12).map((l) => clean(l, names, 200)).join('\n');

/** The system line from the browser's user-agent text: "Windows 11 · Edge 131" (Windows reports 10.0 for 10 and 11). */
export function systemOf(ua: string, desktop: boolean): string {
  const win = /Windows NT (\d+\.\d+)/.exec(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux|Android/.test(ua) ? 'Linux' : 'unknown system';
  const b = /Edg\/(\d+)/.exec(ua) ? ['Edge', /Edg\/(\d+)/.exec(ua)![1]] : /Firefox\/(\d+)/.exec(ua) ? ['Firefox', /Firefox\/(\d+)/.exec(ua)![1]] : /Chrome\/(\d+)/.exec(ua) ? ['Chrome', /Chrome\/(\d+)/.exec(ua)![1]] : /Version\/(\d+).*Safari/.exec(ua) ? ['Safari', /Version\/(\d+)/.exec(ua)![1]] : ['browser', ''];
  return `${desktop ? 'Waraq desktop · ' : ''}${win} · ${b[0]} ${b[1]}`.trim();
}

const when = (at: number) => new Date(at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const KIND: Record<Kind, string> = { error: 'error in the page', rejection: 'error in a background task', worker: 'engine stopped and was restarted', unclean: 'Waraq closed without a clean exit', panic: 'desktop program error (panic)' };

/** The exact text the person sees in "Preview" and that Send by email / Report on GitHub carry. */
export function reportText(e: Entry): string {
  return [
    'Waraq crash report',
    '(No document text, no file names. The person chose to send this.)',
    '',
    `Time: ${when(e.at)}`,
    `What happened: ${KIND[e.kind] ?? e.kind}`,
    `Waraq version: ${e.version}`,
    `System: ${e.system}`,
    `Language: ${e.lang} · Theme: ${e.theme}`,
    `Task open: ${e.task || 'none (start screen)'}`,
    ...(e.job ? [`Job that failed: ${e.job}`] : []),
    `Message: ${e.message || '(none)'}`,
    ...(e.stack ? ['', 'Stack:', e.stack] : []),
    '',
    `Last ${e.log.length} log lines:`,
    ...e.log,
  ].join('\n');
}

/** `text` cut to fit `max` characters once URL-encoded (mail programs and GitHub limit the length of a link). */
export function fit(text: string, max: number): string {
  if (encodeURIComponent(text).length <= max) return text;
  let t = text;
  while (encodeURIComponent(t + '\n… (trimmed)').length > max && t.length > 100) t = t.slice(0, Math.floor(t.length * 0.9));
  return t.replace(/\n[^\n]*$/, '') + '\n… (trimmed; the full report is in the crash log)';
}
export const mailtoUrl = (text: string) => `mailto:${SUPPORT}?subject=${encodeURIComponent('Waraq crash report')}&body=${encodeURIComponent(fit(text, 1800))}`;
export const githubUrl = (text: string) => `${ISSUES}&title=${encodeURIComponent('Crash report')}&body=${encodeURIComponent(fit(text, 6000))}`;

/** An entry read from the log file; the desktop program writes panic entries with fewer fields. */
export function normalise(raw: any): Entry {
  return { id: String(raw.id ?? raw.at), at: Number(raw.at) || 0, kind: raw.kind ?? 'error', version: String(raw.version ?? 'unknown'), system: String(raw.system ?? 'unknown'),
    lang: String(raw.lang ?? ''), theme: String(raw.theme ?? ''), task: String(raw.task ?? ''), job: raw.job, message: String(raw.message ?? ''), stack: raw.stack,
    log: Array.isArray(raw.log) ? raw.log.map(String) : [], seen: !!raw.seen };
}
