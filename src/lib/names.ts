// Never overwrite: a free file name. "a.pdf" taken -> "a (2).pdf", then "a (3).pdf" … (the number goes before the last
// extension; a name without one just gets " (2)"). Pure, so ZIP entries and the desktop wrapper share it.
/** `name` if it is free in `existing`, else the first free "name (n)". The chosen name is NOT added to `existing`. */
export function uniqueName(existing: Set<string>, name: string): string {
  if (!existing.has(name)) return name;
  const dot = name.lastIndexOf('.'), at = dot > 0 ? dot : name.length, stem = name.slice(0, at), ext = name.slice(at);
  for (let n = 2; ; n++) { const c = `${stem} (${n})${ext}`; if (!existing.has(c)) return c; }
}

/** A map of entries (for a ZIP) whose names are made unique as they are added. */
export function addUnique<T>(files: Record<string, T>, name: string, data: T): string {
  const own = uniqueName(new Set(Object.keys(files)), name);
  files[own] = data;
  return own;
}

/** A long name split for display: the head may be shortened with … while the tail (about 30 %, never less than the extension and
 *  a few letters before it, at most 18 characters) always stays visible, so ".pdf" and what tells two files apart are never hidden. */
export function splitName(name: string, short = 24): [string, string] {
  const chars = [...name];
  if (chars.length <= short) return [name, ''];
  const dot = name.lastIndexOf('.'), ext = dot > 0 && name.length - dot <= 6 ? name.length - dot : 0;
  const tail = Math.min(18, Math.max(ext + 6, Math.round(chars.length * 0.3)));
  return [chars.slice(0, chars.length - tail).join(''), chars.slice(-tail).join('')];
}
