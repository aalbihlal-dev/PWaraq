// OCR test set v3 (owner, 21 Oct 2026: "different types of files and arrangements of files and scans"): synthetic pages
// of many document TYPES, page ARRANGEMENTS and SCAN kinds, each tagged, into tests/fixtures/ocr/v3/ (git-ignored):
//   node tests/fixtures/ocr/make-ocr-v3.mjs      → v3/NN-name.pdf (picture-only page), NN-name.txt (truth), manifest.json (tags)
// The tool reads the manifest and slices its numbers by type, arrangement and scan. Watermark and stamp words are
// decoration and are not part of the truth. Scan effects: scan-fx.mjs.
import fs from 'node:fs';
import * as m from '../../../engine/mupdf-wasm/dist/mupdf.js';
import { pageWriter, measure, wrap } from '../../../src/lib/engine/textpage.ts';
import { scanPdf } from './scan-fx.mjs';

const here = (f) => new URL(f, import.meta.url), out = here('v3/');
fs.mkdirSync(out, { recursive: true });
const font = (f) => new m.Font(f, fs.readFileSync(here('../../../public/fonts/' + f + '.ttf')));
const faces = {
  naskh: { regular: font('NotoNaskhArabic-Regular'), bold: font('NotoNaskhArabic-Bold') },
  sans: { regular: font('NotoSansArabic-Regular'), bold: font('NotoSansArabic-Bold') },
  tajawal: { regular: font('Tajawal-Regular'), bold: font('Tajawal-Bold') },
};
const A4 = [595, 842], A5 = [420, 595], LETTER = [612, 792], RECEIPT = [227, 700]; // points
const INK = [0.14, 0.24, 0.21], GREY = [0.6, 0.6, 0.6];
const latin = (s) => /^[\x00-\x7F]/.test(s.trim());

/** A page under construction: text lines, rules (x, y, w, h, r, g, b), filled polys, extra drawing ops and the truth. */
class Page {
  constructor(w, h, face = 'naskh') { this.w = w; this.h = h; this.face = face; this.lines = []; this.rules = []; this.polys = []; this.extra = ''; this.truth = []; }
  fonts() { return faces[this.face]; }
  /** Paragraph(s) wrapped to `width` at x (right edge for Arabic), returns the y after. Also records the truth. */
  para(text, x, y, width, size, o = {}) {
    const f = this.fonts(), lead = o.lead ?? size * 1.65;
    for (const p of text.split('\n')) {
      const bold = !!o.bold || p.startsWith('#'), t = p.replace(/^#/, ''), s = p.startsWith('#') ? size * 1.3 : size;
      for (const l of wrap((q) => measure(f[bold ? 'bold' : 'regular'], q, s), t, width)) {
        const ltr = latin(l) || o.ltr;
        this.lines.push({ text: l, x: ltr ? x - width : x, y, size: s, bold, color: o.color, align: ltr ? (o.center ? 'center' : 'left') : (o.center ? 'center' : 'right'), ...(o.center ? { x: x - width / 2 } : {}) });
        y += lead * (p.startsWith('#') ? 1.3 : 1);
      }
      y += lead * (o.gap ?? 0.4);
    }
    this.truth.push(text.replace(/^#/gm, ''));
    return y;
  }
  /** A table with borders; rows of cells in reading order (first cell at the right for Arabic). */
  table(rows, x, y, widths, size, o = {}) {
    const rh = size * 2.2, w = widths.reduce((a, b) => a + b, 0), f = this.fonts();
    for (let r = 0; r <= rows.length; r++) this.rules.push([x - w, y + r * rh, w, 0.8, ...INK]);
    let cx = x; this.rules.push([x - 0.8, y, 0.8, rows.length * rh, ...INK]);
    for (const cw of widths) { cx -= cw; this.rules.push([cx, y, 0.8, rows.length * rh, ...INK]); }
    rows.forEach((row, r) => {
      let cx = x;
      if (r === 0 && o.header) this.polys.push({ pts: [[x - w, y], [x, y], [x, y + rh], [x - w, y + rh]], color: [0.92, 0.95, 0.92] });
      row.forEach((cell, c) => { const cw = widths[c]; this.lines.push({ text: cell, x: cx - cw / 2, y: y + r * rh + size * 1.45, size, bold: r === 0 && o.header, align: 'center', max: cw - 6 }); cx -= cw; });
      this.truth.push(row.join(' '));
    });
    return y + rows.length * rh;
  }
  /** A labelled box to fill in (forms). */
  field(label, x, y, width, size) {
    const f = this.fonts(), lw = measure(f.regular, label, size) + 8;
    this.lines.push({ text: label, x, y: y + size * 1.3, size, align: 'right' });
    this.rules.push([x - width, y + 2, width - lw, 0.8, ...INK], [x - width, y + 2, 0.8, size * 1.6, ...INK], [x - lw - 0.8, y + 2, 0.8, size * 1.6, ...INK], [x - width, y + 2 + size * 1.6, width - lw, 0.8, ...INK]);
    this.truth.push(label);
    return y + size * 2.4;
  }
  tint(color, x = 0, y = 0, w = this.w, h = this.h) { this.polys.push({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], color }); }
  /** Rotated decoration text (a stamp, a watermark) — not part of the truth. */
  turned(writer, text, x, y, size, deg, color) {
    const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
    this.extra += `q ${c.toFixed(4)} ${s.toFixed(4)} ${(-s).toFixed(4)} ${c.toFixed(4)} ${x.toFixed(1)} ${(this.h - y).toFixed(1)} cm ${writer.draw({ w: this.w, h: 0, lines: [{ text, x: 0, y: 0, size, bold: true, color, align: 'center' }] })} Q\n`;
  }
  /** The page as a PDF (vector), then rendered and scanned. */
  pdf(stamps = []) {
    const doc = new m.PDFDocument(), writer = pageWriter(m, doc, this.fonts());
    for (const [text, x, y, size, deg, color] of stamps) this.turned(writer, text, x, y, size, deg, color);
    const ops = writer.draw({ w: this.w, h: this.h, lines: this.lines, rules: this.rules, polys: this.polys }) + this.extra;
    doc.insertPage(-1, doc.addPage([0, 0, this.w, this.h], 0, { Font: writer.fonts }, ops));
    writer.finish();
    return doc;
  }
}

// ---- texts ----
const LETTER_T = `#إلى سعادة مدير إدارة المشتريات
تحية طيبة وبعد،
نفيدكم بأن اللجنة الفنية أنهت دراسة العروض المقدمة لمشروع تجهيز المختبر، وقد تبين أن العرض الثاني هو الأنسب من حيث المواصفات والسعر ومدة التوريد.
نرجو التكرم بالموافقة على ترسية المشروع على الشركة صاحبة العرض الثاني، وإشعار الإدارة المالية لتخصيص المبلغ المطلوب ضمن ميزانية الربع القادم.
وتفضلوا بقبول فائق الاحترام،
رئيس اللجنة الفنية`;
const CONTRACT_T = `#عقد توريد وتركيب
#البند الأول: موضوع العقد
يلتزم الطرف الأول بتوريد وتركيب أجهزة الحاسب الآلي الموضحة في الملحق رقم واحد في مقر الطرف الثاني خلال ثلاثين يوماً من تاريخ توقيع هذا العقد.
#البند الثاني: قيمة العقد
قيمة هذا العقد مبلغ وقدره ثمانون ألف ريال شاملاً ضريبة القيمة المضافة، يدفع على دفعتين متساويتين، الأولى عند التوقيع والثانية بعد الاستلام النهائي.
#البند الثالث: الضمان
يضمن الطرف الأول الأجهزة الموردة لمدة سنتين من تاريخ الاستلام ضد عيوب الصناعة، ويلتزم باستبدال أي جهاز معيب خلال أسبوع من الإبلاغ.
#البند الرابع: فض النزاع
تسوى الخلافات الناشئة عن هذا العقد ودياً، وإلا فتختص المحاكم المختصة بالنظر فيها.`;
const SMALL_T = `تسري هذه الشروط على جميع الطلبات المقدمة عبر الموقع الإلكتروني. يحق للشركة تعديل الأسعار دون إشعار مسبق، وتعد الأسعار المعروضة وقت تأكيد الطلب هي الأسعار النهائية. لا تشمل الأسعار رسوم الشحن إلا إذا ذكر ذلك صراحة. يتم الرد على طلبات الاسترجاع خلال خمسة أيام عمل، ولا تقبل المنتجات المستخدمة أو التي أزيلت أختامها. تحتفظ الشركة بحق رفض أي طلب تشتبه في كونه مخالفاً لسياسة الاستخدام. تخضع هذه الشروط لأنظمة المملكة العربية السعودية، وتختص لجان الفصل في المنازعات التجارية بأي خلاف ينشأ عنها.`;
const NEWS_T = [`تشهد المدينة خلال الأسبوع القادم انطلاق معرض الكتاب الدولي في نسخته الثلاثين بمشاركة أكثر من ألف دار نشر من ثلاثين دولة، وسط توقعات بأن يتجاوز عدد الزوار مليون زائر.
وقال المتحدث باسم المعرض إن هذا العام يشهد زيادة في عدد الأنشطة الثقافية المصاحبة، من ندوات وأمسيات شعرية وورش عمل للأطفال، إضافة إلى جناح خاص بالكتاب الرقمي.`,
  `وأضاف أن إدارة المعرض وفرت هذا العام مواقف إضافية للسيارات وخدمة نقل مجانية من محطات القطار، بعد الملاحظات التي وردت في الدورة الماضية حول صعوبة الوصول.
من جهتها أكدت وزارة الثقافة أن المعرض يأتي ضمن برنامج وطني لدعم القراءة يستهدف رفع معدل قراءة الفرد إلى عشرة كتب في السنة.`,
  `وفي سياق متصل تنظم المكتبة العامة بالتزامن مع المعرض حملة لتبادل الكتب المستعملة، يحصل فيها الزائر على كتاب مقابل كل كتاب يتبرع به.
ويختتم المعرض فعالياته بحفل توزيع جوائز أفضل كتاب للعام في فروع الرواية والشعر وأدب الطفل، والتي يبلغ مجموع قيمتها مليون ريال.`];
const PAPER_T = [`#أثر القراءة الحرة في تحصيل طلاب المرحلة المتوسطة
#الملخص
هدفت هذه الدراسة إلى قياس أثر تخصيص ربع ساعة يومية للقراءة الحرة في التحصيل اللغوي لدى عينة من طلاب الصف الثاني المتوسط بلغت مئة وعشرين طالباً، قسموا إلى مجموعتين تجريبية وضابطة.
#المقدمة
تعد القراءة الحرة من أهم الممارسات التي تسهم في بناء الحصيلة اللغوية، وقد أشارت دراسات سابقة إلى علاقة طردية بين عدد الكتب التي يقرؤها الطالب ومستوى فهمه المقروء.`,
  `#المنهج
استخدم الباحث المنهج شبه التجريبي، وطبق اختباراً قبلياً وبعدياً على المجموعتين، وحلل النتائج باستخدام اختبار ت للعينات المستقلة.
#النتائج
أظهرت النتائج فروقاً ذات دلالة إحصائية عند مستوى واحد بالمئة لصالح المجموعة التجريبية في مهارات الفهم والتعبير، بينما لم تظهر فروق دالة في مهارة الإملاء.
#التوصيات
يوصي الباحث بإدراج القراءة الحرة ضمن الجدول المدرسي، وتزويد المكتبات المدرسية بكتب مناسبة لاهتمامات الطلاب.`];
const FOOT_T = `(1) انظر دراسة مركز البحوث التربوية، التقرير السنوي، الصفحات 45-52.
(2) طبقت الدراسة في فصل دراسي واحد، ولم تتابع الأثر على المدى البعيد.`;
const BOOK_T = `وكان الرجل إذا دخل السوق نظر في وجوه الناس، فإن رأى حزيناً سأله عن حاله، وإن رأى فرحاً شاركه فرحه، حتى عرفه أهل السوق جميعاً وصاروا ينتظرون قدومه كل صباح.
وحدث في يوم من الأيام أن تأخر عن موعده، فقلق الناس وأرسلوا من يسأل عنه، فوجدوه مريضاً في بيته، فتناوبوا على زيارته حتى شفي، فقال لهم: ما كنت أظن أن سؤالي عن أحوالكم يرد علي بهذا الخير كله.(1)
ومن هنا قيل: من زرع المعروف حصد الوفاء، وإن طال الزمن.(2)`;
const TASHKEEL_T = `قَالَ المُعَلِّمُ لِطُلَّابِهِ: إِنَّ العِلْمَ نُورٌ يَهْدِي صَاحِبَهُ إِلَى الطَّرِيقِ المُسْتَقِيمِ، وَإِنَّ الجَهْلَ ظُلْمَةٌ تُضِلُّ مَنْ سَارَ فِيهَا.
فَاجْتَهِدُوا فِي طَلَبِ العِلْمِ صِغَاراً، تَنْفَعُوا بِهِ أَنْفُسَكُمْ وَأُمَّتَكُمْ كِبَاراً، وَاعْلَمُوا أَنَّ الكِتَابَ خَيْرُ جَلِيسٍ لَا يَمَلُّ وَلَا يَخُونُ.
وَكَانَ مِنْ عَادَةِ الحُكَمَاءِ أَنْ يَقُولُوا: مَنْ قَرَأَ كَثِيراً عَرَفَ كَثِيراً، وَمَنْ عَرَفَ كَثِيراً تَوَاضَعَ كَثِيراً.`;
const LIST_T = `#خطوات تقديم الطلب
١. تعبئة النموذج الإلكتروني بالبيانات الأساسية.
٢. إرفاق صورة من الهوية الوطنية سارية المفعول.
٣. إرفاق شهادة التخرج مصدقة من الجهة المانحة.
٤. سداد الرسوم عبر القنوات الإلكترونية المعتمدة.
٥. متابعة حالة الطلب من خلال الرقم المرجعي خلال خمسة أيام عمل.
٦. استلام البطاقة من الفرع المحدد في الطلب بعد وصول رسالة التأكيد.`;
const EN_T = `#Annual safety briefing
All staff must complete the online safety course before the end of the quarter. The course takes about forty minutes and ends with a short test.
Visitors are not allowed in the workshop without a badge and protective glasses. Report any damaged equipment to the duty supervisor at once.`;
const AR_OF_EN = `#إحاطة السلامة السنوية
على جميع الموظفين إكمال دورة السلامة الإلكترونية قبل نهاية الربع. تستغرق الدورة نحو أربعين دقيقة وتنتهي باختبار قصير.
لا يسمح للزوار بدخول الورشة دون بطاقة ونظارات واقية. يجب إبلاغ المشرف المناوب فوراً عن أي معدات تالفة.`;
const MENU_ROWS = [['الصنف', 'الوصف', 'السعر'], ['شوربة العدس', 'عدس أحمر مع الليمون', '١٢ ر.س'], ['سلطة فتوش', 'خضار طازجة مع الخبز المحمص', '١٨ ر.س'], ['كبسة لحم', 'أرز بسمتي مع لحم الضأن', '٤٥ ر.س'], ['مندي دجاج', 'نصف دجاجة مع الأرز', '٣٨ ر.س'], ['كنافة بالجبن', 'طبق حلو ساخن', '١٦ ر.س'], ['شاي بالنعناع', 'كوب كبير', '٦ ر.س']];
const TIME_ROWS = [['اليوم', 'الحصة الأولى', 'الحصة الثانية', 'الحصة الثالثة', 'الحصة الرابعة'], ['الأحد', 'رياضيات', 'لغة عربية', 'علوم', 'تربية فنية'], ['الاثنين', 'لغة إنجليزية', 'رياضيات', 'دراسات اجتماعية', 'حاسب آلي'], ['الثلاثاء', 'علوم', 'لغة عربية', 'تربية بدنية', 'رياضيات'], ['الأربعاء', 'لغة عربية', 'لغة إنجليزية', 'رياضيات', 'علوم'], ['الخميس', 'تربية إسلامية', 'رياضيات', 'لغة عربية', 'نشاط']];
const FIN_ROWS = [['البيان', '٢٠٢٥', '٢٠٢٤'], ['الإيرادات', '١٬٢٥٠٬٠٠٠', '١٬١٠٠٬٠٠٠'], ['تكلفة المبيعات', '(٧٨٠٬٠٠٠)', '(٧١٠٬٠٠٠)'], ['مجمل الربح', '٤٧٠٬٠٠٠', '٣٩٠٬٠٠٠'], ['المصروفات الإدارية', '(١٦٠٬٠٠٠)', '(١٤٥٬٠٠٠)'], ['صافي الربح', '٣١٠٬٠٠٠', '٢٤٥٬٠٠٠']];
const INV_ROWS = [['البند', 'الكمية', 'سعر الوحدة', 'الإجمالي'], ['حبر طابعة أسود', '4', '95.00', '380.00'], ['ورق تصوير A4', '20', '22.50', '450.00'], ['أقلام تحديد', '30', '3.00', '90.00'], ['دباسة مكتبية', '5', '28.00', '140.00']];
const RECEIPT_T = `#مخبز الحي
فرع شارع الملك فهد
التاريخ ٢٠٢٦/٠٤/١٢ الساعة ١٠:٢٤
خبز بلدي ٤ × ١٫٥٠ = ٦٫٠٠
كعك بالسمسم ٢ × ٣٫٠٠ = ٦٫٠٠
فطيرة جبن ١ × ٨٫٠٠ = ٨٫٠٠
ماء ٢ × ١٫٠٠ = ٢٫٠٠
المجموع ٢٢٫٠٠
ضريبة القيمة المضافة ٣٫٣٠
الإجمالي ٢٥٫٣٠
شكراً لزيارتكم`;
const CERT_T = `#شهادة تقدير
تتقدم إدارة المدرسة بالشكر والتقدير
إلى الطالب المتميز
عبد الرحمن
لتفوقه في مسابقة القراءة للعام الدراسي
نتمنى له دوام التوفيق والنجاح`;
const SLIDE_T = `#خطة العمل للربع الثالث
• زيادة عدد الفروع إلى اثني عشر فرعاً
• إطلاق تطبيق الهاتف في شهر أغسطس
• تدريب مئة موظف على نظام خدمة العملاء الجديد
• خفض زمن الاستجابة للشكاوى إلى يوم واحد`;
const POSTER_T = `#مهرجان الربيع
فعاليات للعائلة طوال الأسبوع
مسرح الأطفال، معرض الحرف، سوق المزارعين
من الخميس إلى السبت، من الرابعة عصراً حتى العاشرة مساءً
الدخول مجاني`;

// ---- page builders by type (each returns a Page; W/H may be swapped for landscape) ----
const build = {
  letter(w = 595, h = 842, face = 'naskh') { const p = new Page(w, h, face); let y = 90; y = p.para(LETTER_T, w - 60, y, w - 120, 12); return p; },
  invoice(w = 595, h = 842, face = 'tajawal') {
    const p = new Page(w, h, face); let y = 70;
    y = p.para('#فاتورة ضريبية / Tax invoice\nرقم الفاتورة 2026-0147 بتاريخ 12/04/2026\nالعميل: شركة الأفق للتجارة', w - 60, y, w - 120, 12);
    y = p.table(INV_ROWS, w - 60, y + 10, [180, 80, 100, 110], 11, { header: true });
    p.para('المجموع 1060.00 ريال، ضريبة القيمة المضافة 159.00 ريال، الإجمالي 1219.00 ريال\nالسداد خلال ثلاثين يوماً بتحويل بنكي. Payment within 30 days.', w - 60, y + 20, w - 120, 11);
    return p;
  },
  contract(w = 595, h = 842) { const p = new Page(w, h, 'naskh'); p.para(CONTRACT_T, w - 60, 80, w - 120, 11); return p; },
  form(w = 595, h = 842) {
    const p = new Page(w, h, 'sans'); let y = p.para('#نموذج طلب بطاقة عضوية', w - 60, 80, w - 120, 14);
    for (const l of ['الاسم الكامل', 'رقم الهوية', 'تاريخ الميلاد', 'رقم الجوال', 'البريد الإلكتروني', 'المدينة', 'نوع العضوية']) y = p.field(l, w - 60, y + 6, w - 120, 11);
    p.para('أقر بصحة البيانات أعلاه وألتزم بشروط العضوية.\nالتوقيع والتاريخ', w - 60, y + 14, w - 120, 11);
    return p;
  },
  financial(w = 595, h = 842) { const p = new Page(w, h, 'tajawal'); let y = p.para('#قائمة الدخل للسنة المنتهية في ٣١ ديسمبر ٢٠٢٥\n(المبالغ بالريال السعودي)', w - 60, 80, w - 120, 12); p.table(FIN_ROWS, w - 80, y + 10, [220, 110, 110], 11, { header: true }); p.para('تقرأ الإيضاحات المرفقة جزءاً لا يتجزأ من هذه القوائم المالية.', w - 60, y + 220, w - 120, 10); return p; },
  newspaper(w = 595, h = 842) {
    const p = new Page(w, h, 'naskh'); p.para('#معرض الكتاب يفتح أبوابه بألف دار نشر', w - 50, 80, w - 100, 22);
    const cw = (w - 100 - 2 * 14) / 3; let y0 = 150;
    NEWS_T.forEach((t, i) => p.para(t, w - 50 - i * (cw + 14), y0, cw, 9.5));
    p.rules.push([50, 140, w - 100, 1.2, ...INK]);
    return p;
  },
  book(w = 420, h = 595) { const p = new Page(w, h, 'naskh'); let y = p.para('#الفصل الثالث: أهل السوق', w - 50, 70, w - 100, 13); y = p.para(BOOK_T, w - 50, y + 4, w - 100, 10.5); p.rules.push([w - 50 - 100, h - 110, 100, 0.6, ...INK]); p.para(FOOT_T, w - 50, h - 100, w - 100, 8); p.para('٤٧', w / 2 + 10, h - 40, 20, 10, { center: true }); return p; },
  paper(w = 595, h = 842) {
    const p = new Page(w, h, 'naskh'); const cw = (w - 120 - 20) / 2;
    PAPER_T.forEach((t, i) => p.para(t, w - 60 - i * (cw + 20), 80, cw, 10));
    p.rules.push([w - 60 - 120, h - 100, 120, 0.6, ...INK]); p.para(FOOT_T, w - 60, h - 90, w - 120, 8);
    return p;
  },
  slide(w = 842, h = 595) { const p = new Page(w, h, 'tajawal'); p.tint([0.09, 0.47, 0.36], 0, 0, w, 90); p.para('#خطة العمل للربع الثالث', w - 60, 60, w - 120, 22, { color: [1, 1, 1] }); p.truth.pop(); p.para(SLIDE_T.replace(/^#.*\n/, ''), w - 80, 160, w - 160, 18, { lead: 40 }); p.truth.unshift('خطة العمل للربع الثالث'); return p; },
  certificate(w = 842, h = 595) { const p = new Page(w, h, 'tajawal'); p.rules.push([30, 30, w - 60, 3, 0.55, 0.45, 0.2], [30, h - 33, w - 60, 3, 0.55, 0.45, 0.2], [30, 30, 3, h - 60, 0.55, 0.45, 0.2], [w - 33, 30, 3, h - 60, 0.55, 0.45, 0.2]); p.para(CERT_T, w / 2, 120, w - 200, 20, { center: true, lead: 46 }); return p; },
  poster(w = 595, h = 842) { const p = new Page(w, h, 'sans'); p.tint([0.93, 0.96, 0.93]); p.polys.push({ pts: [[0, 0], [w, 0], [w, 200], [0, 260]], color: [0.09, 0.47, 0.36] }); p.para('#مهرجان الربيع', w / 2, 120, w - 100, 40, { center: true, color: [1, 1, 1] }); p.truth.pop(); p.para(POSTER_T.replace(/^#.*\n/, ''), w / 2, 330, w - 120, 18, { center: true, lead: 42 }); p.truth.unshift('مهرجان الربيع'); return p; },
  menu(w = 420, h = 595) { const p = new Page(w, h, 'tajawal'); let y = p.para('#قائمة الطعام', w / 2, 60, w - 80, 20, { center: true }); p.table(MENU_ROWS, w - 40, y + 10, [110, 160, 70], 10, { header: true }); return p; },
  timetable(w = 842, h = 595) { const p = new Page(w, h, 'sans'); let y = p.para('#الجدول الأسبوعي للصف الخامس', w - 60, 60, w - 120, 16); p.table(TIME_ROWS, w - 70, y + 10, [120, 150, 150, 150, 150], 11, { header: true }); return p; },
  bilingual_ar_en(w = 595, h = 842) { const p = new Page(w, h, 'tajawal'); let y = p.para(AR_OF_EN, w - 60, 80, w - 120, 11); p.para(EN_T, w - 60, y + 20, w - 120, 11, { ltr: true }); return p; },
  bilingual_en_ar(w = 595, h = 842) { const p = new Page(w, h, 'tajawal'); let y = p.para(EN_T, w - 60, 80, w - 120, 11, { ltr: true }); p.para(AR_OF_EN, w - 60, y + 20, w - 120, 11); return p; },
  tashkeel(w = 595, h = 842) { const p = new Page(w, h, 'naskh'); p.para(TASHKEEL_T, w - 60, 90, w - 120, 13, { lead: 30 }); return p; },
  list(w = 595, h = 842) { const p = new Page(w, h, 'sans'); p.para(LIST_T, w - 60, 90, w - 120, 12, { lead: 26 }); return p; },
  smallprint(w = 595, h = 842) { const p = new Page(w, h, 'naskh'); let y = p.para('#الشروط والأحكام', w - 60, 70, w - 120, 11); y = p.para(SMALL_T, w - 60, y, w - 120, 7); p.para(SMALL_T, w - 60, y + 10, w - 120, 6); return p; },
  receipt() { const [w, h] = RECEIPT; const p = new Page(w, h, 'tajawal'); p.para(RECEIPT_T, w / 2, 40, w - 30, 9, { center: true, lead: 17 }); return p; },
  stamped(w = 595, h = 842) { const p = new Page(w, h, 'naskh'); p.para(LETTER_T, w - 60, 90, w - 120, 12); p.stamps = [['مُعتمد', 180, 520, 34, 25, [0.75, 0.15, 0.1]], ['نسخة للأرشيف', w / 2, h / 2, 56, 45, [0.85, 0.85, 0.85]]]; return p; },
  coloured(w = 595, h = 842) { const p = new Page(w, h, 'sans'); p.tint([0.80, 0.86, 0.95]); p.tint([0.95, 0.97, 1], 40, 70, w - 80, 420); p.para(LETTER_T, w - 60, 100, w - 120, 12); return p; },
};

// ---- the set: [name, type, arrangement, scan, build, args, fx, rotateAttr?] ----
const FLAT = (dpi) => ({ dpi, fx: [['blur', 1]] });
const KINDS = { // scan kinds on the same two pages (letter, book)
  'flatbed 150 dpi': { dpi: 150, fx: [['blur', 1]] }, 'flatbed 200 dpi': FLAT(200), 'flatbed 300 dpi': { dpi: 300, fx: [['blur', 1]] },
  'phone photo (perspective, shadow)': { dpi: 200, fx: [['perspective', 0.06], ['shadow', 0.45], ['noise', 6], ['blur', 1]] },
  'phone photo (uneven light)': { dpi: 200, fx: [['uneven', 0.4], ['noise', 8], ['blur', 1]] },
  'curved book spine': { dpi: 200, fx: [['curve', 0.03], ['blur', 1]] },
  'skew 1°': { dpi: 200, fx: [['tilt', 1], ['blur', 1]] }, 'skew 3°': { dpi: 200, fx: [['tilt', 3], ['blur', 1]] }, 'skew 5°': { dpi: 200, fx: [['tilt', -5], ['blur', 1]] },
  faded: { dpi: 200, fx: [['fade', 80, 200], ['noise', 10]] },
  'photocopy of a photocopy': { dpi: 200, fx: [['blur', 1], ['onebit', 140], ['blur', 1], ['noise', 12], ['onebit', 150], ['blur', 1]] },
  '1-bit black and white': { dpi: 200, fx: [['onebit', 128]] },
  'bleed-through': { dpi: 200, fx: [['bleed', 0.3], ['blur', 1]] },
  'pen strokes over text': { dpi: 200, fx: [['strokes', 14], ['blur', 1]] },
  'hard JPEG': { dpi: 200, fx: [['jpeg', 24]] },
  'turned 90°': { dpi: 200, fx: [['blur', 1], ['turn', 1]] }, 'turned 180°': { dpi: 200, fx: [['blur', 1], ['turn', 2]] }, 'turned 270°': { dpi: 200, fx: [['blur', 1], ['turn', 3]] },
};
const SET = [];
let n = 0;
const add = (type, arrangement, scan, page, { dpi, fx }, rotate = 0) => SET.push({ name: `${String(++n).padStart(2, '0')}-${type.replace(/[^a-z0-9]+/gi, '-')}-${scan.replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase(), type, arrangement, scan, page, dpi, fx, rotate });
// types, one plain flatbed scan each
for (const [type, arr] of [['letter', '1 column, A4'], ['invoice', 'table, A4'], ['contract', '1 column, A4'], ['form', 'boxes, A4'], ['financial', 'table RTL columns, A4'], ['newspaper', '3 columns + headline, A4'], ['book', '1 column + footnotes, A5'], ['paper', '2 columns + footnotes, A4'], ['slide', 'landscape, dark title band'], ['certificate', 'landscape, centred display'], ['poster', 'display font over colour'], ['menu', 'table, A5'], ['timetable', 'table RTL columns, landscape'], ['bilingual_ar_en', 'Arabic then English'], ['bilingual_en_ar', 'English then Arabic'], ['tashkeel', 'full tashkeel'], ['list', 'numbered Arabic list'], ['smallprint', 'small print 6–7 pt'], ['receipt', 'long receipt 80 mm'], ['stamped', 'stamp + watermark over text'], ['coloured', 'text over coloured background']])
  add(type, arr, 'flatbed 200 dpi', build[type](), FLAT(200));
// arrangements on the letter
add('letter', 'Letter size', 'flatbed 200 dpi', build.letter(...LETTER), FLAT(200));
add('letter', 'landscape page', 'flatbed 200 dpi', build.letter(842, 595), FLAT(200));
add('letter', 'page /Rotate 90 (content upright)', 'flatbed 200 dpi', build.letter(), FLAT(200), 90);
add('letter', 'page /Rotate 180', 'flatbed 200 dpi', build.letter(), FLAT(200), 180);
add('letter', 'page /Rotate 270', 'flatbed 200 dpi', build.letter(), FLAT(200), 270);
add('book', 'Letter size, Tajawal', 'flatbed 200 dpi', build.letter(612, 792, 'tajawal'), FLAT(200));
// scan kinds on the letter and the book
for (const [scan, k] of Object.entries(KINDS)) { add('letter', '1 column, A4', scan, build.letter(), k); add('book', '1 column + footnotes, A5', scan, build.book(), k); }

const manifest = [];
for (const s of SET) {
  const doc = s.page.pdf(s.page.stamps), k = s.dpi / 72;
  const pix = doc.loadPage(0).toPixmap(m.Matrix.scale(k, k), m.ColorSpace.DeviceGray, false);
  let pdf = scanPdf(m, pix, s.fx, s.page.w, s.page.h);
  if (s.rotate) { const d = m.Document.openDocument(pdf, 'application/pdf').asPDF(); d.findPage(0).put('Rotate', s.rotate); pdf = d.saveToBuffer('compress').asUint8Array(); }
  fs.writeFileSync(new URL(s.name + '.pdf', out), pdf);
  fs.writeFileSync(new URL(s.name + '.txt', out), s.page.truth.join('\n') + '\n');
  manifest.push({ file: s.name + '.pdf', type: s.type, arrangement: s.arrangement, scan: s.scan });
  console.log(s.name, s.page.truth.join(' ').split(/\s+/).length, 'words');
}
fs.writeFileSync(new URL('manifest.json', out), JSON.stringify(manifest, null, 1));
console.log(SET.length, 'pages');
