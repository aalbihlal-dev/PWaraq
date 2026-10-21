// Generates the Office/CAD fixtures in tests/fixtures/office/ from flat ODF written here (no customer files):
// arabic.docx (real Arabic text), table.xlsx, slide.pptx, plan.dxf and plan.dwg — through the 0.3.3 pack beside
// this repo (../waraq/engines/win-x64: LibreOffice + LibreDWG). The outputs are committed; rerun only to change them.
//   node tests/fixtures/make-office.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname, out = path.join(here, 'office');
const eng = path.resolve(here, '../../../waraq/engines/win-x64');
const soffice = path.join(eng, 'libreoffice/program/soffice.exe'), dxf2dwg = path.join(eng, 'libredwg/dxf2dwg.exe');
if (!fs.existsSync(soffice)) throw new Error('LibreOffice pack missing: ' + soffice);
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wq-fixtures-'));
const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3"';
const doc = (mime, body) => `<?xml version="1.0" encoding="UTF-8"?>\n<office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.${mime}"><office:body>${body}</office:body></office:document>`;
const flat = {
  'arabic.fodt': doc('text', `<office:text><text:h text:outline-level="1">Waraq test document</text:h><text:p>مرحباً بكم في ورق. هذا نص عربي حقيقي للتجربة.</text:p><text:p>English line: the quick brown fox.</text:p><text:p>العدد ١٢٣ والتاريخ ٢٠٢٦</text:p></office:text>`),
  'table.fods': doc('spreadsheet', `<office:spreadsheet><table:table table:name="Sheet1">${[['Item', 'Qty', 'Price'], ['Paper', '12', '3.5'], ['ورق', '7', '2.25'], ['Ink', '3', '19']].map((r) => `<table:table-row>${r.map((c, i) => (i && /^[\d.]+$/.test(c) ? `<table:table-cell office:value-type="float" office:value="${c}"><text:p>${c}</text:p></table:table-cell>` : `<table:table-cell office:value-type="string"><text:p>${c}</text:p></table:table-cell>`)).join('')}</table:table-row>`).join('')}</table:table></office:spreadsheet>`),
  'slide.fodp': doc('presentation', `<office:presentation><draw:page draw:name="page1"><draw:frame svg:width="22cm" svg:height="4cm" svg:x="2cm" svg:y="3cm"><draw:text-box><text:p>Waraq slide one</text:p><text:p>شريحة باللغة العربية</text:p></draw:text-box></draw:frame></draw:page><draw:page draw:name="page2"><draw:frame svg:width="22cm" svg:height="4cm" svg:x="2cm" svg:y="3cm"><draw:text-box><text:p>Slide two</text:p></draw:text-box></draw:frame></draw:page></office:presentation>`),
};
// a HEADER (version R2000, limits) so LibreDWG accepts the file (it rejects a bare ENTITIES section as "too small")
const dxf = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '4', '9', '$EXTMIN', '10', '0', '20', '0', '30', '0', '9', '$EXTMAX', '10', '100', '20', '50', '30', '0', '9', '$LIMMIN', '10', '0', '20', '0', '9', '$LIMMAX', '10', '100', '20', '50', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '1', '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS', '0', 'ENDTAB', '0', 'ENDSEC',
  '0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '100', '21', '50', '31', '0', '0', 'CIRCLE', '8', '0', '10', '50', '20', '25', '30', '0', '40', '20', '0', 'LINE', '8', '0', '10', '0', '20', '50', '30', '0', '11', '100', '21', '0', '31', '0', '0', 'ENDSEC', '0', 'EOF'].join('\r\n');
for (const [name, xml] of Object.entries(flat)) fs.writeFileSync(path.join(tmp, name), xml);
// a complete DXF (every table LibreDWG wants) comes from ezdxf when Python has it; else the hand-written one above (no DWG then)
const ez = spawnSync('python', ['-c', `import ezdxf,sys
d=ezdxf.new('R2000');m=d.modelspace();m.add_line((0,0),(100,50));m.add_circle((50,25),20);m.add_line((0,50),(100,0));m.add_text('Waraq plan',dxfattribs={'height':5}).set_placement((5,55));d.saveas(sys.argv[1])`, path.join(out, 'plan.dxf')], { encoding: 'utf8' });
if (ez.status !== 0) { console.warn('ezdxf missing: hand-written DXF, no DWG'); fs.writeFileSync(path.join(out, 'plan.dxf'), dxf); }
const profile = pathToFileURL(path.join(tmp, 'profile')).href;
for (const [src, fmt] of [['arabic.fodt', 'docx'], ['table.fods', 'xlsx'], ['slide.fodp', 'pptx']]) {
  const r = spawnSync(soffice, ['-env:UserInstallation=' + profile, '--headless', '--nologo', '--nodefault', '--norestore', '--convert-to', fmt, '--outdir', out, path.join(tmp, src)], { encoding: 'utf8', timeout: 120_000 });
  if (r.status !== 0 || !fs.existsSync(path.join(out, src.replace(/\.\w+$/, '.' + fmt)))) throw new Error(`${src} -> ${fmt} failed: ${r.stderr}`);
}
if (fs.existsSync(dxf2dwg) && ez.status === 0) {
  const r = spawnSync(dxf2dwg, ['-y', '-o', path.join(out, 'plan.dwg'), path.join(out, 'plan.dxf')], { encoding: 'utf8', timeout: 60_000 });
  if (!fs.existsSync(path.join(out, 'plan.dwg'))) throw new Error('dxf2dwg failed: ' + r.stderr + r.stdout);
}
fs.rmSync(tmp, { recursive: true, force: true });
for (const f of fs.readdirSync(out)) console.log(f, fs.statSync(path.join(out, f)).size, 'bytes');
