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
