// Office (Word, Excel, PowerPoint) and CAD (DWG, DXF) files to PDF. The converters are the 0.3.3 add-on packs
// (LibreOffice + LibreDWG): native programs, so only the desktop app can run them. The desktop shell (Tauri, Phase 4)
// puts `window.waraqDesktop` on the page; in the browser it is missing and the interface says "desktop only".
export type Desktop = { convertToPdf(name: string, bytes: Uint8Array): Promise<Uint8Array> };

export const OFFICE = ['doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'];
export const CAD = ['dwg', 'dxf'];
export const CONVERTIBLE_ACCEPT = [...OFFICE, ...CAD].map((e) => '.' + e).join(',');

export const extOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();
export const isConvertible = (name: string) => [...OFFICE, ...CAD].includes(extOf(name));
export const desktop = (): Desktop | undefined => (globalThis as { waraqDesktop?: Desktop }).waraqDesktop;

/** Converts `file` to PDF bytes. Throws 'DESKTOP_ONLY' in the browser. */
export async function toPdf(file: File): Promise<Uint8Array> {
  const d = desktop();
  if (!d) throw new Error('DESKTOP_ONLY');
  return d.convertToPdf(file.name, new Uint8Array(await file.arrayBuffer()));
}

/** The programs the desktop shell runs for `ext` (it fills in `dir`, `profile` and the pack's paths). A DWG goes
 *  through LibreDWG first (to DXF), then LibreOffice Draw lays the drawing out as PDF; Office files go straight to
 *  PDF. Macros are switched off by the profile the shell writes (MacroSecurityLevel 3). */
export function commands(ext: string, o: { soffice: string; dwg2dxf?: string; profileUrl: string; input: string; outdir: string }) {
  const lo = (filter: string, file: string) => [o.soffice, ['-env:UserInstallation=' + o.profileUrl, '--headless', '--nologo', '--nodefault', '--norestore', '--convert-to', filter, '--outdir', o.outdir, file]] as const;
  if (ext === 'dwg') return [[o.dwg2dxf!, ['-y', '-o', 'drawing.dxf', o.input]] as const, lo('pdf:draw_pdf_Export', 'drawing.dxf')];
  return [lo(ext === 'dxf' ? 'pdf:draw_pdf_Export' : 'pdf', o.input)];
}
