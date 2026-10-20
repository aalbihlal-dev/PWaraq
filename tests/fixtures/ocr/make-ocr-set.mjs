// Makes the OCR test set: NN-name.pdf (a page that is only a picture, like a scan) + NN-name.txt (the correct text, one
// paragraph per line, reading order).  node tests/fixtures/ocr/make-ocr-set.mjs
// Synthetic until real scans arrive: text in Noto Naskh / Noto Sans Arabic / Tajawal, drawn at 150–300 dpi, then blurred,
// noised, tilted or faded like a scanner or photocopier would. Real scans go in beside them as NN-name.pdf + NN-name.txt.
import fs from 'node:fs';
import * as m from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { assemble } from '../../../src/lib/engine/assemble.ts';
import { pageWriter, measure, wrap } from '../../../src/lib/engine/textpage.ts';

const here = (f) => new URL(f, import.meta.url);
const font = (f) => new m.Font(f, fs.readFileSync(here('../../../public/fonts/' + f + '.ttf')));
const faces = {
  naskh: { regular: font('NotoNaskhArabic-Regular'), bold: font('NotoNaskhArabic-Bold') },
  sans: { regular: font('NotoSansArabic-Regular'), bold: font('NotoSansArabic-Bold') },
  tajawal: { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') }, // the only one with Latin letters
};
const W = 595, H = 842, M = 60;
const latin = (s) => /^[\x00-\x7F]/.test(s.trim());

/** The page text drawn as lines: paragraphs wrapped to the column, Arabic right-aligned, Latin left-aligned. */
function layout(text, face, size, lead = size * 1.7) {
  const fonts = faces[face], lines = [];
  let y = M + size * 2;
  for (const para of text.split('\n')) {
    const bold = para.startsWith('#'), s = bold ? size * 1.3 : size, t = para.replace(/^#/, '');
    for (const l of wrap((x) => measure(fonts[bold ? 'bold' : 'regular'], x, s), t, W - 2 * M)) {
      lines.push(latin(l) ? { text: l, x: M, y, size: s, bold } : { text: l, x: W - M, y, size: s, bold, align: 'right' });
      y += lead * (bold ? 1.3 : 1);
    }
    y += lead * 0.4;
  }
  return lines;
}

// --- scanner effects on an 8-bit grey picture (w x h bytes) ---
const blur = (px, w, h, r) => { // box blur, radius r, separable
  const tmp = new Uint8Array(px.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += px[y * w + Math.min(w - 1, Math.max(0, x + k))]; tmp[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]; px[y * w + x] = s / n; }
};
let seed = 7; const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32: repeatable, no stripes
const noise = (px, w, h, sigma) => { for (let i = 0; i < px.length; i++) { const g = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()); px[i] = Math.min(255, Math.max(0, px[i] + g * sigma)); } };
const fade = (px, w, h, lo, hi) => { for (let i = 0; i < px.length; i++) px[i] = lo + (px[i] * (hi - lo)) / 255; }; // low contrast
const tilt = (px, w, h, deg) => { // turned by deg about the centre, bilinear, white outside
  const out = new Uint8Array(px.length), c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180), cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = c * (x - cx) + s * (y - cy) + cx, sy = -s * (x - cx) + c * (y - cy) + cy, x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 255 : px[j * w + i]);
    out[y * w + x] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  }
  px.set(out);
};

/** Writes NN-name.pdf (picture only) and NN-name.txt. `fx`: scanner effects in order, each [name, ...args]. */
function page(name, text, face, size, dpi, fx = []) {
  const doc = new m.PDFDocument(), w = pageWriter(m, doc, faces[face]);
  doc.insertPage(-1, w.add({ w: W, h: H, lines: layout(text, face, size) }));
  w.finish();
  const k = dpi / 72, pix = doc.loadPage(0).toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceGray, false), px = pix.getPixels(), pw = pix.getWidth(), ph = pix.getHeight();
  for (const [f, ...a] of fx) ({ blur, noise, fade, tilt })[f](px, pw, ph, ...a);
  const png = pix.asPNG(), photo = { doc: m.Document.openDocument(png, 'image/png'), bytes: png };
  const pdf = assemble(m, () => photo, { items: [{ doc: 1, page: 0, fit: { w: W, h: H } }] });
  fs.writeFileSync(here(name + '.pdf'), m.Document.openDocument(pdf, 'application/pdf').asPDF().saveToBuffer('compress').asUint8Array()); // deflated: 0.1–0.2 MB a page
  fs.writeFileSync(here(name + '.txt'), text.replace(/^#/gm, '') + '\n');
  console.log(name, pw + 'x' + ph);
}

const T = {
  letter: `#إلى إدارة المكتبة العامة
تحية طيبة وبعد،
نتقدم إليكم بطلب تجديد اشتراك المدرسة في خدمات المكتبة للعام الدراسي القادم، مع زيادة عدد البطاقات إلى خمسين بطاقة بدلًا من ثلاثين، نظرًا لارتفاع عدد الطلاب المشاركين في برنامج القراءة الصيفية.
كما نرجو تزويدنا بقائمة الكتب الجديدة التي وصلت خلال الأشهر الثلاثة الماضية، وبخاصة كتب العلوم المبسطة وقصص الأطفال، لنتمكن من إعداد جدول الزيارات الأسبوعية.
ونود الإشارة إلى أن المدرسة مستعدة لاستضافة ورشة عمل عن كيفية استخدام الفهرس الإلكتروني، على أن يتم تحديد موعدها بالتنسيق مع قسم خدمات القراء.
وتفضلوا بقبول فائق الاحترام والتقدير،
مدير المدرسة`,
  article: `#القراءة عادة تبنى في الصغر
تشير الدراسات التربوية إلى أن الطفل الذي يرى والديه يقرآن بانتظام يميل إلى اكتساب عادة القراءة بصورة طبيعية، دون حاجة إلى تحفيز خارجي. فالبيت الذي تتوفر فيه الكتب في متناول اليد يصنع قارئًا أكثر مما تصنعه المناهج وحدها.
ولا يشترط أن تكون الكتب كثيرة أو باهظة الثمن، بل يكفي أن تكون مناسبة لعمر الطفل واهتماماته، وأن يجد من يناقشه فيما قرأ. وقد لاحظ معلمون كثيرون أن ربع ساعة يومية من القراءة الحرة تحسن مستوى الفهم والتعبير خلال فصل دراسي واحد.
ومن الوسائل المجربة أن يخصص مكان هادئ للقراءة، وأن تعرض الكتب بأغلفتها لا بكعوبها، وأن يترك للطفل حق اختيار ما يقرأ، حتى لو اختار القصص المصورة في البداية.
المكتبات العامة تؤدي دورًا مكملًا، فهي توفر التنوع الذي لا يستطيع البيت توفيره، وتقيم أنشطة جماعية تجعل من القراءة تجربة اجتماعية لا فردية فقط.`,
  invoice: `#INVOICE — فاتورة
Invoice number 2024-0317
Date 12 March 2024
Al Noor Office Supplies — مؤسسة النور للأدوات المكتبية
ورق تصوير A4 وزن 80 غرام، الكمية 40، السعر 1600.00
أقلام حبر جاف أزرق، الكمية 200، السعر 300.00
ملفات بلاستيكية ملونة، الكمية 120، السعر 480.00
Subtotal 2380.00 — المجموع الفرعي
VAT 15% 357.00 — ضريبة القيمة المضافة
Total 2737.00 SAR — الإجمالي
Payment within 30 days by bank transfer.
السداد خلال ثلاثين يومًا بتحويل بنكي.
Thank you for your business.
شكرًا لتعاملكم معنا.`,
  notice: `#إعلان لسكان المجمع
تعلن إدارة المجمع السكني عن انقطاع المياه يوم الثلاثاء القادم من الساعة التاسعة صباحًا حتى الساعة الثانية ظهرًا، وذلك لأعمال الصيانة الدورية لخزان المياه الرئيسي.
يرجى من السكان تخزين كمية كافية من المياه قبل الموعد المحدد، وإغلاق صنابير المياه أثناء فترة الانقطاع لتجنب أي تسرب عند عودة الضخ.
كما نذكر بأن مواقف السيارات أمام المبنى الثالث ستكون مغلقة طوال اليوم لتسهيل حركة سيارات الصيانة.
نعتذر عن أي إزعاج، ونشكر لكم تعاونكم.
إدارة المجمع`,
  contract: `#البند الأول: موضوع العقد
يلتزم الطرف الأول بتقديم خدمات الصيانة الدورية لأجهزة التكييف الموجودة في مقر الطرف الثاني، وفق الجدول الزمني المرفق بهذا العقد، ويشمل ذلك تنظيف الفلاتر وفحص الضواغط وتعبئة غاز التبريد عند الحاجة.
#البند الثاني: مدة العقد
مدة هذا العقد سنة واحدة تبدأ من تاريخ التوقيع، وتجدد تلقائيًا لمدة مماثلة ما لم يخطر أحد الطرفين الآخر كتابةً برغبته في عدم التجديد قبل انتهاء المدة بثلاثين يومًا على الأقل.
#البند الثالث: المقابل المالي
يدفع الطرف الثاني للطرف الأول مبلغًا قدره اثنا عشر ألف ريال سنويًا، على أربعة أقساط متساوية، يستحق كل قسط في بداية كل ربع سنة، ولا يشمل هذا المبلغ قطع الغيار التي تورد بموجب فواتير مستقلة.
#البند الرابع: الإنهاء
يحق لأي من الطرفين إنهاء العقد في حال إخلال الطرف الآخر بأي من التزاماته، بعد إنذاره كتابةً ومنحه مهلة خمسة عشر يومًا لتصحيح الإخلال.`,
  weather: `#تقرير حالة الطقس الأسبوعي
يتوقع أن تسود أجواء معتدلة على المناطق الساحلية خلال الأيام الثلاثة الأولى من الأسبوع، مع رياح شمالية غربية خفيفة إلى معتدلة السرعة، وارتفاع في الرطوبة النسبية خلال ساعات الليل والصباح الباكر.
أما المناطق الداخلية فتشهد ارتفاعًا تدريجيًا في درجات الحرارة يبلغ ذروته يوم الخميس، حيث تصل الدرجة العظمى إلى تسع وثلاثين درجة مئوية في بعض المدن.
وتبقى فرص هطول الأمطار ضعيفة بوجه عام، باستثناء المرتفعات الجنوبية الغربية التي قد تشهد سحبًا ركامية ممطرة بعد الظهر، مصحوبة أحيانًا برياح هابطة نشطة.
ننصح السائقين بالحذر على الطرق الجبلية بسبب احتمال تشكل الضباب في الصباح، كما ننصح بالإكثار من شرب الماء وتجنب التعرض المباشر للشمس في ساعات الذروة.`,
  report: `#Annual report summary — ملخص التقرير السنوي
During the past year the library welcomed more than forty thousand visitors, an increase of twelve percent over the previous year.
استقبلت المكتبة خلال العام الماضي أكثر من أربعين ألف زائر، بزيادة قدرها اثنا عشر بالمئة عن العام السابق.
The children's section was expanded with three hundred new titles, and weekend story hours were held every Saturday morning.
تم توسيع قسم الأطفال بثلاثمئة عنوان جديد، وأقيمت ساعات القصة في نهاية الأسبوع صباح كل سبت.
Digital lending now accounts for a quarter of all loans, and the catalogue is searchable in both Arabic and English.
تشكل الإعارة الرقمية الآن ربع إجمالي الإعارات، ويمكن البحث في الفهرس باللغتين العربية والإنجليزية.
Next year's priorities are a longer opening time, a quiet study floor, and a mobile library for remote villages.
أولويات العام القادم هي تمديد ساعات العمل، وطابق هادئ للدراسة، ومكتبة متنقلة للقرى البعيدة.`,
  minutes: `#محضر اجتماع لجنة المكتبة
انعقد الاجتماع الدوري للجنة في قاعة الاجتماعات بحضور جميع الأعضاء، وافتتح رئيس اللجنة الجلسة بمراجعة ما تم تنفيذه من توصيات الاجتماع السابق.
نوقش مقترح تمديد ساعات العمل في فترة الامتحانات، واتفق الحضور على فتح المكتبة حتى الساعة العاشرة مساءً لمدة أربعة أسابيع، على أن يتم تقييم التجربة بعد انتهائها.
كما استعرضت اللجنة طلبات شراء الكتب المقدمة من الأقسام، وأقرت ثلثي الطلبات، وأجلت الباقي إلى الميزانية القادمة لعدم كفاية المخصصات.
واختتم الاجتماع بالاتفاق على موعد الاجتماع القادم في الأسبوع الأول من الشهر المقبل.`,
};

page('01-letter-naskh-300', T.letter, 'naskh', 12, 300);
page('02-article-tajawal-200', T.article, 'tajawal', 11, 200, [['blur', 1]]);
page('03-invoice-mixed-200', T.invoice, 'tajawal', 11, 200, [['noise', 14]]);
page('04-notice-tilted-200', T.notice, 'naskh', 13, 200, [['tilt', 1.5], ['blur', 1]]);
page('05-contract-small-200', T.contract, 'naskh', 9, 200);
page('06-weather-faded-150', T.weather, 'sans', 12, 150, [['fade', 70, 190], ['noise', 18]]);
page('07-report-bilingual-300', T.report, 'tajawal', 12, 300, [['blur', 1]]);
page('08-minutes-photocopy-200', T.minutes, 'naskh', 12, 200, [['tilt', -1], ['blur', 2], ['noise', 25], ['fade', 40, 230]]);
