// PROTOTYPE of fix package WP0: textpage.ts with only the three-line digit/base-direction change (copy in proto/engine-hotfix).
// Same editor page as gen-editor (indic + hijri + date lines), cover subtitle and watermark. -> hotfix.pdf
import { m, fonts, basePdf, save, writeOut, outline } from './lib.mjs';
import { editPage } from './proto/engine-hotfix/editpage.ts';
const F = fonts(), lines = ['رقم الهاتف ٠١٢٣٤٥٦٧٨٩ والسنة ١٤٤٨ هـ', '10/05/1448 هـ', 'التاريخ: ٢١/١٠/٢٠٢٦', 'دراسة حالة: ٢٠٢٦', 'الفاتورة رقم INV-2026 بتاريخ 21/10/2026', 'سارة ٢٠٢٦ Al-Ahmad', '۱۲۳ پنج (فارسی)'];
const d = editPage(m, basePdf([{ w: 595, h: 842 }]), 0, lines.map((t, i) => ({ kind: 'text', text: t, x: 60, y: 40 + i * 50, w: 475, h: 30, size: 18, color: [0, 0, 0], bold: false, align: 'right' })), [], () => F);
writeOut('hotfix.pdf', d.saveToBuffer('').asUint8Array().slice());
const st = m.Document.openDocument(d.saveToBuffer('').asUint8Array().slice(), 'application/pdf').loadPage(0).toStructuredText('preserve-whitespace').asText();
console.log(st);
