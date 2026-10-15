// English / Arabic strings in one place. The interface direction follows the language.
const strings = {
  appName: ['Waraq', 'ورق'],
  tagline: ['Arabic and English PDF tools that stay on your computer.', 'أدوات PDF بالعربية والإنجليزية تبقى على جهازك.'],
  open: ['Open a PDF', 'افتح ملف PDF'],
  openShort: ['Open', 'فتح'],
  close: ['Close', 'إغلاق'],
  dropHere: ['or drop a PDF here', 'أو أفلت ملف PDF هنا'],
  privacy: ['Your files never leave this device.', 'ملفاتك لا تغادر هذا الجهاز.'],
  language: ['عربي', 'English'],
  view: ['View', 'عرض'], edit: ['Edit', 'تحرير'], organize: ['Organize', 'تنظيم'], convert: ['Convert', 'تحويل'],
  sign: ['Sign', 'توقيع'], protect: ['Protect', 'حماية'], ocr: ['OCR', 'التعرف على النص'],
  soon: ['Coming in Waraq 1.0', 'قادم في ورق 1.0'],
  pages: ['Pages', 'الصفحات'],
  page: ['Page', 'الصفحة'],
  of: ['of', 'من'],
  zoomIn: ['Zoom in (Ctrl +)', 'تكبير (Ctrl +)'], zoomOut: ['Zoom out (Ctrl −)', 'تصغير (Ctrl −)'],
  fitWidth: ['Fit width', 'ملء العرض'], fitPage: ['Whole page', 'الصفحة كاملة'],
  find: ['Find in document (Ctrl F)', 'البحث في المستند (Ctrl F)'],
  results: ['results', 'نتائج'],
  noResults: ['No results', 'لا نتائج'],
  reading: ['Reading the document…', 'جارٍ قراءة المستند…'],
  notPdf: ['This file could not be opened as a PDF.', 'تعذر فتح هذا الملف كملف PDF.'],
  thumbnails: ['Thumbnails', 'الصور المصغرة'],
} satisfies Record<string, [string, string]>;

export type Key = keyof typeof strings;
const saved = (() => { try { return localStorage.getItem('waraq-lang'); } catch { return null; } })();
export const i18n = $state({ lang: (saved === 'ar' || saved === 'en' ? saved : navigator.language.startsWith('ar') ? 'ar' : 'en') as 'en' | 'ar' });

export const t = (k: Key) => strings[k][i18n.lang === 'ar' ? 1 : 0];
export function toggleLanguage() {
  i18n.lang = i18n.lang === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem('waraq-lang', i18n.lang); } catch {}
}
