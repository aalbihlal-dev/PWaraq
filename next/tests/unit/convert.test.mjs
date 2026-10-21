// Office/CAD to PDF with the real LibreOffice + LibreDWG packs (../waraq/engines/win-x64); skipped where they are absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { commands, isConvertible, extOf } from '../../src/lib/convert.ts';

const eng = fileURLToPathSafe('../../../waraq/engines/win-x64/');
function fileURLToPathSafe(rel) { return decodeURIComponent(new URL(rel, import.meta.url).pathname.replace(/^\//, '')); }
const soffice = path.join(eng, 'libreoffice/program/soffice.exe'), ok = fs.existsSync(soffice);

test('which files are converted', () => {
  assert.ok(isConvertible('Plan.DWG') && isConvertible('a.docx') && isConvertible('b.pptx') && !isConvertible('c.pdf'));
  assert.equal(extOf('x.y.xlsx'), 'xlsx');
});

test('DXF drawing becomes a PDF with the pack commands', { skip: !ok && 'LibreOffice pack missing' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wq-cad-')), outdir = path.join(dir, 'out');
  fs.mkdirSync(outdir);
  const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', '0', '10', '0', '20', '0', '30', '0', '11', '100', '21', '50', '31', '0', '0', 'CIRCLE', '8', '0', '10', '50', '20', '25', '30', '0', '40', '20', '0', 'ENDSEC', '0', 'EOF'].join('\r\n');
  fs.writeFileSync(path.join(dir, 'plan.dxf'), dxf);
  for (const [exe, args] of commands('dxf', { soffice, profileUrl: pathToFileURL(path.join(dir, 'profile')).href, input: path.join(dir, 'plan.dxf'), outdir })) {
    const r = spawnSync(exe, args, { cwd: dir, timeout: 110_000 });
    assert.equal(r.status, 0, String(r.stderr));
  }
  const pdf = m.Document.openDocument(fs.readFileSync(path.join(outdir, 'plan.pdf')), 'application/pdf');
  assert.equal(pdf.countPages(), 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
