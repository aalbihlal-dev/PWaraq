// Corpus, second axis: DOCUMENT TYPES and ARRANGEMENTS (owner, 21 Oct 2026: "use different types of files and
// arrangements"). Each document is an HTML template printed by Edge (Skia) in one or two fonts, so the PDFs carry the
// same kinds of fonts real Edge/Chrome/Word-like files have. Every file gets tags in tests/fixtures/arabic/tags.json
// (type, arrangement, size, fonts, and the paragraphs it contains as the truth for the lift check).
//   node tools/arabic/make-corpus-types.mjs            (needs the OFL fonts of make-corpus.mjs for Amiri / Cairo / Noto Kufi)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import * as m from '../../engine/mupdf-wasm/dist/mupdf.js';
import { FONTS } from './make-corpus.mjs';

const ROOT = path.join(import.meta.dirname, '..', '..'), OUT = path.join(ROOT, 'tests', 'fixtures', 'arabic'), TAGS = path.join(OUT, 'tags.json');
const tags = fs.existsSync(TAGS) ? JSON.parse(fs.readFileSync(TAGS, 'utf8')) : {};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fwd = (p) => p.replace(/\\/g, '/');
const OPEN = { Amiri: [path.join(FONTS, 'Amiri-Regular.ttf'), path.join(FONTS, 'Amiri-Bold.ttf')], Cairo: [path.join(FONTS, 'Cairo-VF.ttf')], 'Noto Kufi Arabic': [path.join(FONTS, 'NotoKufiArabic-VF.ttf')],
  'Scheherazade New': [path.join(FONTS, 'ScheherazadeNew-Regular.ttf')], Tajawal: [path.join(ROOT, 'public/fonts/Tajawal-Regular.ttf'), path.join(ROOT, 'public/fonts/Tajawal-Bold.ttf')] };
const faces = (fonts) => fonts.filter((f) => OPEN[f] && fs.existsSync(OPEN[f][0])).map((f) => `@font-face{font-family:"${f}";src:url("file:///${fwd(OPEN[f][0])}")}${OPEN[f][1] ? `@font-face{font-family:"${f}";font-weight:700;src:url("file:///${fwd(OPEN[f][1])}")}` : ''}`).join('');
// small public-safe pictures: a logo, a round stamp, a photo-like gradient, a watermark
const svg = (s) => `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
const LOGO = svg('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" rx="8" fill="#15775d"/><circle cx="30" cy="30" r="16" fill="#eaf3eb"/><rect x="56" y="18" width="50" height="8" fill="#fafbf8"/><rect x="56" y="34" width="36" height="8" fill="#fafbf8"/></svg>');
const STAMP = svg('<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><circle cx="70" cy="70" r="62" fill="none" stroke="#b3261e" stroke-width="5" opacity=".7"/><circle cx="70" cy="70" r="44" fill="none" stroke="#b3261e" stroke-width="2" opacity=".7"/><text x="70" y="78" font-size="20" text-anchor="middle" fill="#b3261e" opacity=".75" font-family="Arial">معتمد</text></svg>');
const PHOTO = svg('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#9fc5e8"/><stop offset="1" stop-color="#3b6ea5"/></linearGradient></defs><rect width="300" height="200" fill="url(#g)"/><circle cx="220" cy="60" r="30" fill="#fff3b0"/><path d="M0 200 L80 120 L140 170 L200 110 L300 200 Z" fill="#2f6b3a"/></svg>');
const WATER = svg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><text x="200" y="220" font-size="64" text-anchor="middle" fill="#15775d" opacity=".12" font-family="Arial" transform="rotate(-30 200 200)">نسخة</text></svg>');

// ---- the texts (public-safe, written for this corpus; the poetry is classical and public domain) ----
const T = {
  bismillah: 'بسم الله الرحمن الرحيم',
  org: 'المؤسسة العامة للتدريب التقني والمهني',
  circularTitle: 'تعميم رقم (٤٢) لعام ١٤٤٨هـ',
  circularTo: 'إلى: جميع مديري الإدارات والفروع',
  circularSubj: 'الموضوع: تحديث إجراءات اعتماد الطلبات الإلكترونية',
  salam: 'السلام عليكم ورحمة الله وبركاته،',
  circularBody: 'إشارة إلى التعميم السابق رقم (٣٧) بتاريخ 12/02/2026م، نفيدكم بأن النظام الإلكتروني الجديد سيُعتمد ابتداءً من يوم الأحد 01/06/2026م، ويُلغى العمل بالنماذج الورقية بعد هذا التاريخ.',
  circularBody2: 'نأمل التكرم بإحاطة جميع الموظفين بما ورد أعلاه، والتنسيق مع الإدارة العامة لتقنية المعلومات (هاتف 0112345678) لأي استفسار.',
  closing: 'وتقبلوا فائق الاحترام والتقدير،',
  signer: 'المدير العام',
  signerName: 'م. عبدالله بن سعد الحربي',
  invoiceTitle: 'فاتورة ضريبية — Tax Invoice',
  invoiceNo: 'رقم الفاتورة: INV-2026-00981',
  invoiceDate: 'التاريخ: ١٤٤٨/٠٣/٢١هـ الموافق 2026-09-14',
  invoiceVat: 'الرقم الضريبي: 300012345600003',
  invoiceCustomer: 'العميل: شركة النخبة للمقاولات (Elite Contracting Co.)',
  items: [['١', 'أعمال تمديدات كهربائية — الدور الأول', '١٢٠ م.ط', '٤٥٫٠٠', '٥٬٤٠٠٫٠٠'], ['٢', 'لوحة توزيع رئيسية 400A', '1', '12,500.00', '12,500.00'], ['٣', 'كابل نحاس 4×16 مم²', '350 م', '18.50', '6,475.00']],
  subtotal: 'الإجمالي قبل الضريبة: 24,375.00 ر.س', vat: 'ضريبة القيمة المضافة 15%: 3,656.25 ر.س', total: 'الإجمالي المستحق: 28,031.25 ر.س',
  receiptShop: 'بقالة الحي — فرع الروضة', receiptLines: ['حليب طازج ١ لتر      6.50', 'خبز بلدي ×٣            4.50', 'ماء ٦٠٠ مل ×١٢        12.00', 'المجموع               23.00', 'نقداً                  25.00', 'الباقي                  2.00'],
  receiptFoot: 'شكراً لزيارتكم — Thank you — 2026/09/14 18:42',
  contractTitle: 'عقد تقديم خدمات استشارية',
  parties: 'أُبرم هذا العقد في مدينة الرياض بتاريخ ١٤٤٨/٠٢/١٠هـ بين كلٍّ من: الطرف الأول: شركة الأفق للاستشارات، والطرف الثاني: مؤسسة البناء الحديث.',
  clauses: ['البند الأول: موضوع العقد — يلتزم الطرف الأول بتقديم خدمات الاستشارات الهندسية الموضحة في الملحق (أ).', 'البند الثاني: مدة العقد — اثنا عشر (١٢) شهراً تبدأ من تاريخ التوقيع، قابلة للتجديد باتفاق الطرفين كتابةً.', 'البند الثالث: قيمة العقد — مبلغ وقدره 240,000 ريال سعودي (مائتان وأربعون ألف ريال) تُسدد على أقساط شهرية.', 'البند الرابع: الالتزامات — يلتزم الطرف الثاني بما يلي:'],
  subclauses: ['أ. توفير البيانات اللازمة خلال خمسة أيام عمل من طلبها.', 'ب. سداد المستحقات خلال ٣٠ يوماً من تاريخ الفاتورة.', 'ج. إخطار الطرف الأول كتابةً بأي تغيير في نطاق العمل.'],
  clause5: 'البند الخامس: تسوية النزاعات — تُحال أي خلافات إلى التحكيم وفق نظام التحكيم السعودي.',
  formTitle: 'نموذج طلب إجازة', formFields: [['الاسم الرباعي', 'الرقم الوظيفي'], ['الإدارة', 'المسمى الوظيفي'], ['نوع الإجازة: ☐ سنوية ☐ مرضية ☐ اضطرارية', 'عدد الأيام'], ['من تاريخ: ____/____/______', 'إلى تاريخ: ____/____/______']], formNote: 'ملاحظة: يُرفق التقرير الطبي في حالة الإجازة المرضية التي تزيد عن ثلاثة أيام.',
  finTitle: 'قائمة المركز المالي كما في 31 ديسمبر 2025م', finCols: ['البيان', 'إيضاح', '2025', '2024'],
  finRows: [['النقد وما في حكمه', '٤', '1,250,340', '980,115'], ['ذمم مدينة تجارية', '٥', '2,114,900', '2,450,600'], ['المخزون', '٦', '830,000', '(12,400)'], ['إجمالي الموجودات المتداولة', '', '4,195,240', '3,418,315'], ['ممتلكات ومعدات', '٧', '6,700,000', '7,100,000'], ['إجمالي الموجودات', '', '10,895,240', '10,518,315']],
  headline: 'افتتاح أكبر مركز للطاقة الشمسية في المنطقة الشرقية', subhead: 'المشروع ينتج ١٫٥ غيغاواط ويوفر ٣ آلاف وظيفة', byline: 'الدمام — مراسل الصحيفة',
  news1: 'افتتح أمس مشروع الطاقة الشمسية الجديد بحضور عدد من المسؤولين والمستثمرين، ويُعد المشروع الأكبر من نوعه في المنطقة بطاقة إنتاجية تصل إلى ١٫٥ غيغاواط، ما يكفي لتغذية نحو ٢٥٠ ألف منزل.',
  news2: 'وقال المدير التنفيذي للشركة المنفذة إن المرحلة الثانية ستبدأ في الربع الأول من عام 2027م، مشيراً إلى أن نسبة المحتوى المحلي بلغت 48%.',
  news3: 'من جهته أكد رئيس الغرفة التجارية أن المشروع سيسهم في خفض تكلفة الكهرباء على المصانع، داعياً الشركات الناشئة إلى الاستفادة من الفرص المصاحبة.',
  caption: 'صورة: جانب من الألواح الشمسية في الموقع (تصوير: أحمد العلي)',
  pull: '«المشروع سيغيّر خريطة الطاقة في المنطقة خلال خمس سنوات»',
  bookHeader: 'الفصل الثالث — مناهج البحث', bookPara1: 'يُقصد بالمنهج الوصفي ذلك الأسلوب الذي يعتمد على دراسة الظاهرة كما توجد في الواقع، ويهتم بوصفها وصفاً دقيقاً ويعبّر عنها تعبيراً كيفياً أو كمياً¹.',
  bookPara2: 'وقد أشار (Creswell, 2014) إلى أن تصميم البحث يجب أن ينسجم مع طبيعة السؤال البحثي، وهو ما أكدته دراسات لاحقة².', footnotes: ['¹ عبيدات، ذوقان وآخرون (2016). البحث العلمي: مفهومه وأدواته وأساليبه. عمّان: دار الفكر، ص 219.', '² Creswell, J. W. (2014). Research Design: Qualitative, Quantitative, and Mixed Methods Approaches. 4th ed. SAGE.'],
  paperTitle: 'أثر التعلم النشط في تحصيل طلاب المرحلة الثانوية في مادة الفيزياء', authors: 'سارة بنت محمد القحطاني¹، Omar H. Al-Zahrani²',
  abstractAr: 'الملخص: هدفت الدراسة إلى قياس أثر استراتيجيات التعلم النشط في تحصيل طلاب الصف الثاني الثانوي، وتكونت العينة من 120 طالباً، وأظهرت النتائج فروقاً دالة إحصائياً عند مستوى (α = 0.05) لصالح المجموعة التجريبية.',
  abstractEn: 'Abstract: This study measured the effect of active-learning strategies on the achievement of 120 secondary-school students. Results showed statistically significant differences (α = 0.05) in favour of the experimental group.',
  refs: ['[1] Prince, M. (2004). Does active learning work? A review of the research. Journal of Engineering Education, 93(3), 223–231.', '[2] الزهراني، عمر (2022). استراتيجيات التدريس الحديثة. الرياض: مكتبة الرشد.'],
  slideTitle: 'خطة التحول الرقمي 2026–2028', bullets: ['رقمنة ٩٠٪ من الخدمات بنهاية 2027', 'تدريب 1,200 موظف على الأدوات الجديدة', 'خفض زمن إنجاز المعاملة من 7 أيام إلى يومين', 'مؤشر رضا المستفيدين ≥ 85%'],
  certTitle: 'شهادة شكر وتقدير', certBody: 'تتقدم إدارة المدرسة بالشكر والتقدير للطالب', certName: 'محمد بن خالد العتيبي', certFor: 'لتميزه في مسابقة القرآن الكريم للعام الدراسي ١٤٤٧/١٤٤٨هـ',
  posterTitle: 'ملتقى الابتكار', posterSub: 'الثلاثاء ١٢ ربيع الأول — قاعة المؤتمرات الكبرى', posterNote: 'الدخول مجاني — التسجيل عبر الموقع innovate.example.sa',
  menuTitle: 'قائمة الطعام', menu: [['كبسة لحم', '٤٥'], ['مندي دجاج', '٣٨'], ['سلطة فتوش', '١٨'], ['عصير برتقال طازج', '١٢'], ['قهوة عربية (دلة)', '٢٥']], menuNote: 'الأسعار شاملة ضريبة القيمة المضافة 15%',
  ttTitle: 'الجدول الدراسي — الفصل الأول', days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'], periods: ['٨:٠٠–٨:٤٥', '٨:٥٠–٩:٣٥', '٩:٤٠–١٠:٢٥', '١٠:٤٥–١١:٣٠'], subjects: ['رياضيات', 'لغة عربية', 'فيزياء', 'English', 'حاسب', 'تربية إسلامية', 'كيمياء', 'تاريخ'],
  cadTitle: 'مخطط الدور الأرضي — مشروع فيلا سكنية', cadBlock: [['اسم المشروع', 'فيلا سكنية — حي النرجس'], ['المالك', 'عبدالرحمن الشهري'], ['المقياس', '1:100'], ['رقم اللوحة', 'A-101'], ['التاريخ', '2026-03-05'], ['المراجعة', 'Rev. C']], cadLabels: ['غرفة نوم رئيسية 4.20×5.00', 'صالة 6.00×7.50', 'مطبخ 3.60×4.00', 'حمام', 'مدخل', 'موقف سيارة 3.00×6.00'],
  enTitle: 'Service Level Agreement — اتفاقية مستوى الخدمة', enPara: 'This agreement is made between the Provider and the Customer. The Arabic text below is the binding version in case of conflict.', arInEn: 'تُعد النسخة العربية هي المرجع في حال وجود تعارض بين النصين، ويُعمل بها أمام الجهات الرسمية.',
  arTitle: 'الشروط والأحكام — Terms and Conditions', arPara: 'تسري هذه الشروط على جميع المستخدمين، ويُعد استخدام الخدمة قبولاً بها.', enInAr: 'By using the service you agree to these terms. Last updated: 14 September 2026.',
  poem: [['قِفَا نَبْكِ مِنْ ذِكْرَى حَبِيبٍ وَمَنْزِلِ', 'بِسِقْطِ اللِّوَى بَيْنَ الدَّخُولِ فَحَوْمَلِ'], ['فَتُوضِحَ فَالمِقْرَاةِ لَمْ يَعْفُ رَسْمُهَا', 'لِمَا نَسَجَتْهَا مِنْ جَنُوبٍ وَشَمْأَلِ'], ['تَرَى بَعَرَ الآرَامِ فِي عَرَصَاتِهَا', 'وَقِيعَانِهَا كَأَنَّهُ حَبُّ فُلْفُلِ']],
  poet: 'امرؤ القيس — من المعلقة',
  hadithStyle: 'قَالَ الشَّاعِرُ: وَمَا نَيْلُ الْمَطَالِبِ بِالتَّمَنِّي * وَلَكِنْ تُؤْخَذُ الدُّنْيَا غِلَابَا، وَمَا اسْتَعْصَى عَلَى قَوْمٍ مَنَالٌ * إِذَا الإِقْدَامُ كَانَ لَهُمْ رِكَابَا.',
  wmTitle: 'نسخة غير رسمية — للاطلاع فقط', wmBody: 'يُمنع تداول هذه النسخة خارج الجهة، وتُعد النسخة المختومة بالختم الرسمي هي المعتمدة.',
  boxes: ['صندوق نص أول في أعلى الصفحة، محاذاة لليمين.', 'نص دائر بزاوية ٩٠ درجة على الهامش', 'Left-aligned English box inside an Arabic page: see Appendix B.', 'نص في المنتصف — centred'],
  mixedLine: 'يبدأ الدوام الساعة 7:30 صباحاً في مبنى Building C، الطابق ٣، مكتب رقم 312.',
};

const PAGE = (size, margin = '18mm', extra = '') => `@page{size:${size};margin:${margin}} body{margin:0;line-height:1.6} ${extra}`;
const p = (t, cls = '', style = '') => `<p class="${cls}" style="${style}">${esc(t)}</p>`;
const docs = [
  { id: 'type-letter-circular', type: 'letter-circular', arrangement: ['single-column', 'right-aligned', 'header-footer', 'logo', 'stamp'], size: 'A4', fonts: ['Traditional Arabic', 'Arial'],
    html: (f) => `<header style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #15775d;padding-bottom:6pt"><img src="${LOGO}" width="100"><div style="text-align:center;font-weight:700">${esc(T.org)}<br><span style="font-size:9pt;font-family:Arial">General Organization for Technical Training</span></div><div style="font-size:9pt">${esc('الرقم: ٤٢/١٤٤٨')}<br>${esc('التاريخ: ١٤٤٨/٠٣/١٥هـ')}</div></header>
      ${p(T.bismillah, '', 'text-align:center;margin-top:14pt')}${p(T.circularTitle, '', 'text-align:center;font-weight:700;font-size:16pt')}${p(T.circularTo)}${p(T.circularSubj, '', 'font-weight:700')}${p(T.salam)}${p(T.circularBody, '', 'text-align:justify')}${p(T.circularBody2, '', 'text-align:justify')}${p(T.closing)}
      <div style="text-align:left;margin-top:24pt;position:relative">${esc(T.signer)}<br>${esc(T.signerName)}<img src="${STAMP}" width="110" style="position:absolute;left:120pt;top:-30pt"></div>
      <footer style="position:fixed;bottom:0;left:0;right:0;font-size:8pt;color:#666;border-top:1px solid #ccc;display:flex;justify-content:space-between"><span>${esc('ص.ب 7080 الرياض 11472 — هاتف 0112345678')}</span><span>${esc('صفحة ١ من ١')}</span></footer>`,
    lines: [T.org, T.bismillah, T.circularTitle, T.circularTo, T.circularSubj, T.salam, T.circularBody, T.circularBody2, T.closing, T.signer, T.signerName] },
  { id: 'type-letter-circular-usletter', type: 'letter-circular', arrangement: ['single-column', 'justified', 'us-letter'], size: 'Letter', fonts: ['Simplified Arabic'], css: PAGE('Letter', '1in'),
    html: () => `${p(T.bismillah, '', 'text-align:center')}${p(T.circularTitle, '', 'text-align:center;font-weight:700')}${p(T.circularTo)}${p(T.circularSubj)}${p(T.salam)}${p(T.circularBody, '', 'text-align:justify')}${p(T.circularBody2, '', 'text-align:justify')}${p(T.closing)}${p(T.signerName, '', 'text-align:left')}`,
    lines: [T.bismillah, T.circularTitle, T.circularTo, T.circularSubj, T.salam, T.circularBody, T.circularBody2, T.closing, T.signerName] },
  { id: 'type-invoice', type: 'invoice', arrangement: ['table', 'merged-cells', 'mixed-digits', 'small-print'], size: 'A4', fonts: ['Tahoma', 'Arial'],
    html: () => `${p(T.invoiceTitle, '', 'font-size:18pt;font-weight:700;text-align:center')}${p(T.invoiceNo)}${p(T.invoiceDate)}${p(T.invoiceVat)}${p(T.invoiceCustomer)}
      <table style="width:100%;border-collapse:collapse;font-size:11pt"><tr style="background:#eaf3eb"><th colspan="2">${esc('البند')}</th><th>${esc('الكمية')}</th><th>${esc('سعر الوحدة')}</th><th>${esc('الإجمالي')}</th></tr>${T.items.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td></tr>`).join('')}</table>
      ${p(T.subtotal, '', 'text-align:left')}${p(T.vat, '', 'text-align:left')}${p(T.total, '', 'text-align:left;font-weight:700')}${p('هذه الفاتورة صادرة إلكترونياً ولا تحتاج إلى توقيع — This is a computer-generated invoice.', '', 'font-size:7pt;color:#555')}`,
    css: PAGE('A4', '15mm', 'td,th{border:1px solid #888;padding:3pt 6pt}'), lines: [T.invoiceTitle, T.invoiceNo, T.invoiceDate, T.invoiceVat, T.invoiceCustomer, ...T.items.map((r) => r[1]), T.subtotal, T.vat, T.total] },
  { id: 'type-receipt-long', type: 'receipt', arrangement: ['single-column', 'long-receipt', 'monospace', 'small-print'], size: '80mm x 200mm', fonts: ['Courier New'], css: PAGE('80mm 200mm', '4mm', 'body{font-size:9pt;line-height:1.4} p{margin:0;white-space:pre}'),
    html: () => `${p(T.receiptShop, '', 'text-align:center;font-weight:700')}${p('الرقم الضريبي 300012345600003', '', 'text-align:center;font-size:7pt')}${T.receiptLines.map((l) => p(l)).join('')}${p(T.receiptFoot, '', 'text-align:center;font-size:7pt')}`,
    lines: [T.receiptShop, ...T.receiptLines, T.receiptFoot] },
  { id: 'type-contract-clauses', type: 'contract', arrangement: ['numbered-clauses', 'nested-list', 'justified', 'arabic-indic-numbering'], size: 'A4', fonts: ['Simplified Arabic', 'Times New Roman'],
    html: () => `${p(T.contractTitle, '', 'text-align:center;font-weight:700;font-size:16pt')}${p(T.parties, '', 'text-align:justify')}${T.clauses.map((c) => p(c, '', 'text-align:justify')).join('')}<ol style="list-style:none;padding-inline-start:18pt">${T.subclauses.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>${p(T.clause5, '', 'text-align:justify')}
      <table style="width:100%;margin-top:30pt"><tr><td style="text-align:center">${esc('الطرف الأول')}<br>${esc('الاسم: ____________')}<br>${esc('التوقيع: __________')}</td><td style="text-align:center">${esc('الطرف الثاني')}<br>${esc('الاسم: ____________')}<br>${esc('التوقيع: __________')}</td></tr></table>`,
    lines: [T.contractTitle, T.parties, ...T.clauses, ...T.subclauses, T.clause5] },
  { id: 'type-form-boxes', type: 'form', arrangement: ['table', 'boxes', 'checkboxes', 'dotted-lines'], size: 'A4', fonts: ['Arial'], css: PAGE('A4', '15mm', 'td{border:1px solid #333;padding:6pt;height:22pt;width:50%}'),
    html: () => `${p(T.formTitle, '', 'text-align:center;font-weight:700;font-size:16pt')}<table style="width:100%;border-collapse:collapse">${T.formFields.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>${p(T.formNote, '', 'font-size:9pt')}${p('توقيع الموظف: .............................      توقيع المدير المباشر: .............................', '', 'margin-top:24pt')}`,
    lines: [T.formTitle, ...T.formFields.flat(), T.formNote] },
  { id: 'type-financial-landscape', type: 'financial-statement', arrangement: ['table', 'landscape', 'figures', 'negative-brackets', 'western-digits'], size: 'A4 landscape', fonts: ['Calibri'], css: PAGE('A4 landscape', '15mm', 'td,th{border-bottom:1px solid #999;padding:3pt 10pt} td:nth-child(n+3){text-align:left;font-family:Arial}'),
    html: () => `${p(T.finTitle, '', 'font-weight:700;font-size:14pt')}${p('(المبالغ بالريال السعودي ما لم يُذكر خلاف ذلك)', '', 'font-size:9pt')}<table style="width:100%;border-collapse:collapse"><tr style="background:#eaf3eb">${T.finCols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${T.finRows.map((r) => `<tr${r[0].startsWith('إجمالي') ? ' style="font-weight:700"' : ''}>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`,
    lines: [T.finTitle, ...T.finRows.map((r) => r[0])] },
  { id: 'type-newspaper-3col', type: 'newspaper', arrangement: ['three-columns', 'big-headline', 'caption', 'photo', 'decorative-font'], size: 'A4', fonts: ['Sakkal Majalla', 'Arabic Typesetting'], css: PAGE('A4', '12mm', '.cols{column-count:3;column-gap:12pt;column-rule:1px solid #ccc;text-align:justify;font-size:10.5pt}'),
    html: (f) => `<div style="font-size:30pt;font-weight:700;font-family:'Arabic Typesetting';line-height:1.2">${esc(T.headline)}</div><div style="font-size:14pt;color:#15775d">${esc(T.subhead)}</div><div style="font-size:9pt;color:#666;border-bottom:2px solid #000;margin-bottom:8pt">${esc(T.byline)}</div>
      <div class="cols">${p(T.news1)}<img src="${PHOTO}" style="width:100%"><div style="font-size:8pt;color:#444">${esc(T.caption)}</div>${p(T.news2)}${p(T.news3)}</div>`,
    lines: [T.headline, T.subhead, T.byline, T.news1, T.caption, T.news2, T.news3] },
  { id: 'type-magazine-2col', type: 'magazine', arrangement: ['two-columns', 'pull-quote', 'text-on-colour', 'photo'], size: 'A4', fonts: ['Dubai'], css: PAGE('A4', '14mm', '.cols{column-count:2;column-gap:16pt;text-align:justify}'),
    html: () => `<div style="background:#15775d;color:#fff;padding:14pt;font-size:22pt;font-weight:700">${esc(T.headline)}</div><div class="cols" style="margin-top:10pt">${p(T.news1)}<div style="background:#eaf3eb;border-inline-start:4px solid #15775d;padding:8pt;font-size:14pt;margin:6pt 0">${esc(T.pull)}</div>${p(T.news2)}<img src="${PHOTO}" style="width:100%">${p(T.caption, '', 'font-size:8pt;color:#555')}${p(T.news3)}</div>`,
    lines: [T.headline, T.news1, T.pull, T.news2, T.caption, T.news3] },
  { id: 'type-book-a5', type: 'book', arrangement: ['single-column', 'a5', 'header-footer', 'footnotes', 'page-number', 'latin-references'], size: 'A5', fonts: ['Amiri', 'Times New Roman'], css: PAGE('A5', '16mm', 'body{font-size:11pt;text-align:justify}'),
    html: () => `<div style="display:flex;justify-content:space-between;font-size:8pt;color:#666;border-bottom:1px solid #999">${esc(T.bookHeader)}<span>٤٧</span></div>${p(T.bookPara1, '', 'margin-top:10pt')}${p(T.bookPara2)}${p(T.hadithStyle, '', 'text-align:center;font-size:12pt')}<div style="border-top:1px solid #999;margin-top:40pt;font-size:8pt;line-height:1.4">${T.footnotes.map((f) => `<div>${esc(f)}</div>`).join('')}</div>`,
    lines: [T.bookHeader, T.bookPara1, T.bookPara2, T.hadithStyle, ...T.footnotes] },
  { id: 'type-academic-paper', type: 'academic-paper', arrangement: ['two-columns', 'bilingual-abstract', 'latin-references', 'header-footer'], size: 'A4', fonts: ['Times New Roman'], css: PAGE('A4', '20mm', '.cols{column-count:2;column-gap:14pt;text-align:justify;font-size:10.5pt}'),
    html: () => `${p(T.paperTitle, '', 'text-align:center;font-weight:700;font-size:15pt')}${p(T.authors, '', 'text-align:center;font-size:10pt')}<div class="cols">${p(T.abstractAr)}<div dir="ltr" style="text-align:left">${esc(T.abstractEn)}</div>${p('١. المقدمة', '', 'font-weight:700')}${p(T.bookPara1)}${p('المراجع', '', 'font-weight:700')}<div dir="ltr" style="text-align:left;font-size:9pt">${esc(T.refs[0])}</div><div style="font-size:9pt">${esc(T.refs[1])}</div></div>`,
    lines: [T.paperTitle, T.authors, T.abstractAr, T.abstractEn, T.bookPara1, ...T.refs] },
  { id: 'type-slides-16x9', type: 'slides', arrangement: ['landscape', 'big-title', 'bullets', 'text-on-colour'], size: '16:9', fonts: ['Segoe UI'], css: PAGE('33.87cm 19.05cm', '0', 'body{background:#fafbf8}'),
    html: () => `<div style="background:#15775d;color:#fff;padding:28pt 40pt;font-size:36pt;font-weight:700">${esc(T.slideTitle)}</div><ul style="font-size:24pt;padding:30pt 60pt;line-height:1.8">${T.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul><div style="position:fixed;bottom:16pt;left:30pt;font-size:12pt;color:#666">3 / 12</div>`,
    lines: [T.slideTitle, ...T.bullets] },
  { id: 'type-certificate', type: 'certificate', arrangement: ['landscape', 'centred', 'display-text', 'decorative-font', 'logo', 'stamp'], size: 'A4 landscape', fonts: ['Andalus', 'Aldhabi'], css: PAGE('A4 landscape', '20mm', 'body{text-align:center;border:6px double #15775d;padding:20pt;height:150mm}'),
    html: () => `<img src="${LOGO}" width="90">${p(T.certTitle, '', "font-family:'Aldhabi';font-size:44pt;color:#15775d")}${p(T.certBody, '', 'font-size:18pt')}${p(T.certName, '', 'font-size:30pt;font-weight:700')}${p(T.certFor, '', 'font-size:16pt')}<div style="display:flex;justify-content:space-around;margin-top:30pt;font-size:14pt"><span>${esc('مدير المدرسة')}</span><img src="${STAMP}" width="90"><span>${esc('رائد النشاط')}</span></div>`,
    lines: [T.certTitle, T.certBody, T.certName, T.certFor] },
  { id: 'type-poster-display', type: 'poster', arrangement: ['display-text', 'text-on-colour', 'centred', 'huge'], size: 'A4', fonts: ['Noto Kufi Arabic', 'Cairo'], css: PAGE('A4', '0', 'body{background:#233c36;color:#fafbf8;text-align:center;padding:60pt 30pt;height:100%}'),
    html: () => `${p(T.posterTitle, '', 'font-size:64pt;font-weight:700;line-height:1.2;margin:0')}${p(T.posterSub, '', "font-size:20pt;font-family:'Cairo';color:#eaf3eb")}${p(T.posterNote, '', "font-size:13pt;font-family:'Cairo';margin-top:200pt")}`,
    lines: [T.posterTitle, T.posterSub, T.posterNote] },
  { id: 'type-menu-prices', type: 'menu', arrangement: ['two-column-table', 'leaders', 'arabic-indic-prices'], size: 'A5', fonts: ['Dubai'], css: PAGE('A5', '14mm', 'td{padding:4pt 0} td:last-child{text-align:left;width:60pt}'),
    html: () => `${p(T.menuTitle, '', 'text-align:center;font-size:24pt;font-weight:700;color:#15775d')}<table style="width:100%">${T.menu.map(([n, pr]) => `<tr><td>${esc(n)} <span style="color:#999">........................</span></td><td>${esc(pr + ' ر.س')}</td></tr>`).join('')}</table>${p(T.menuNote, '', 'font-size:9pt;text-align:center;margin-top:20pt')}`,
    lines: [T.menuTitle, ...T.menu.map((r) => r[0]), T.menuNote] },
  { id: 'type-timetable', type: 'timetable', arrangement: ['table', 'merged-cells', 'rotated-header', 'rtl-column-order'], size: 'A4 landscape', fonts: ['Tahoma'], css: PAGE('A4 landscape', '15mm', 'td,th{border:1px solid #666;padding:4pt 8pt;text-align:center} th.rot{writing-mode:vertical-rl;transform:rotate(180deg);height:70pt}'),
    html: () => `${p(T.ttTitle, '', 'font-weight:700;font-size:16pt')}<table style="width:100%;border-collapse:collapse"><tr><th>${esc('اليوم / الحصة')}</th>${T.periods.map((x) => `<th class="rot">${esc(x)}</th>`).join('')}</tr>${T.days.map((d, i) => `<tr><th>${esc(d)}</th>${T.periods.map((_, j) => (i === 2 && j === 1 ? `<td colspan="2">${esc('نشاط مشترك')}</td>` : i === 2 && j === 2 ? '' : `<td>${esc(T.subjects[(i * 3 + j) % T.subjects.length])}</td>`)).join('')}</tr>`).join('')}</table>`,
    lines: [T.ttTitle, ...T.days, ...T.periods, ...T.subjects, 'نشاط مشترك'] },
  { id: 'type-technical-cad', type: 'technical-drawing', arrangement: ['title-block', 'rotated-text', 'small-print', 'latin-dimensions', 'landscape'], size: 'A4 landscape', fonts: ['Arial'], css: PAGE('A4 landscape', '8mm', 'body{font-size:7pt} .blk td{border:1px solid #000;padding:2pt 5pt;font-size:7pt}'),
    html: () => `<div style="position:relative;height:160mm;border:1px solid #000"><div style="position:absolute;top:10mm;right:20mm;border:1px solid #000;width:60mm;height:50mm;padding:3pt">${esc(T.cadLabels[0])}</div><div style="position:absolute;top:70mm;right:20mm;border:1px solid #000;width:90mm;height:60mm;padding:3pt">${esc(T.cadLabels[1])}</div><div style="position:absolute;top:10mm;right:90mm;border:1px solid #000;width:50mm;height:40mm;padding:3pt">${esc(T.cadLabels[2])}</div><div style="position:absolute;top:55mm;right:90mm;border:1px solid #000;width:25mm;height:14mm;padding:3pt">${esc(T.cadLabels[3])}</div><div style="position:absolute;top:140mm;right:20mm">${esc(T.cadLabels[4])}</div><div style="position:absolute;top:30mm;left:20mm;writing-mode:vertical-rl;transform:rotate(180deg)">${esc(T.cadLabels[5])}</div><div style="position:absolute;top:3mm;left:3mm;font-family:Arial" dir="ltr">SCALE 1:100 — DIM IN M</div></div>
      <table class="blk" style="border-collapse:collapse;margin-top:4pt;width:100%"><tr><td colspan="4" style="font-weight:700;font-size:9pt">${esc(T.cadTitle)}</td></tr>${[0, 2, 4].map((i) => `<tr>${[T.cadBlock[i], T.cadBlock[i + 1]].flatMap(([k, v]) => [`<td>${esc(k)}</td>`, `<td>${esc(v)}</td>`]).join('')}</tr>`).join('')}</table>`,
    lines: [T.cadTitle, ...T.cadLabels, ...T.cadBlock.flat()] },
  { id: 'type-bilingual-en-page', type: 'bilingual', arrangement: ['ltr-page', 'arabic-inside-ltr', 'single-column'], size: 'A4', fonts: ['Calibri'], dir: 'ltr', css: PAGE('A4', '20mm', 'body{text-align:left}'),
    html: () => `${p(T.enTitle, '', 'font-weight:700;font-size:16pt')}${p(T.enPara)}<p dir="rtl" style="text-align:right">${esc(T.arInEn)}</p>${p('Section 2 — القسم الثاني: Response times / أزمنة الاستجابة')}${p(T.mixedLine)}<p dir="rtl" style="text-align:right">${esc(T.mixedLine)}</p>`,
    lines: [T.enTitle, T.enPara, T.arInEn, T.mixedLine] },
  { id: 'type-bilingual-ar-page', type: 'bilingual', arrangement: ['rtl-page', 'english-inside-rtl', 'left-aligned-ltr-box'], size: 'A4', fonts: ['Calibri'],
    html: () => `${p(T.arTitle, '', 'font-weight:700;font-size:16pt')}${p(T.arPara, '', 'text-align:justify')}<p dir="ltr" style="text-align:left">${esc(T.enInAr)}</p>${p(T.mixedLine)}${p('١. البند الأول — Clause 1', '', 'font-weight:700')}${p(T.arInEn, '', 'text-align:justify')}`,
    lines: [T.arTitle, T.arPara, T.enInAr, T.mixedLine, T.arInEn] },
  { id: 'type-poetry-tashkeel', type: 'poetry', arrangement: ['two-hemistich-columns', 'full-tashkeel', 'centred'], size: 'A4', fonts: ['Amiri', 'Scheherazade New', 'Traditional Arabic'], css: PAGE('A4', '20mm', 'table{margin:auto;font-size:16pt;line-height:2.2} td{padding:0 18pt}'),
    html: () => `${p('مُعَلَّقَةُ امْرِئِ الْقَيْسِ', '', 'text-align:center;font-size:22pt;font-weight:700')}<table>${T.poem.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>${p(T.poet, '', 'text-align:center;font-size:11pt;color:#666')}${p(T.hadithStyle, '', 'text-align:justify;font-size:14pt;margin-top:30pt')}`,
    lines: ['مُعَلَّقَةُ امْرِئِ الْقَيْسِ', ...T.poem.flat(), T.poet, T.hadithStyle] },
  { id: 'type-watermark-stamp', type: 'stamped', arrangement: ['watermark-behind', 'logo-behind', 'stamp-over', 'single-column'], size: 'A4', fonts: ['Arial'], css: PAGE('A4', '20mm', `body{background:url("${WATER}") center/400px repeat}`),
    html: () => `<img src="${LOGO}" style="position:absolute;top:30mm;left:60mm;width:240pt;opacity:.15">${p(T.wmTitle, '', 'font-weight:700;font-size:16pt;text-align:center')}${p(T.wmBody, '', 'text-align:justify')}${p(T.circularBody, '', 'text-align:justify')}${p(T.circularBody2, '', 'text-align:justify')}<img src="${STAMP}" style="position:absolute;top:80mm;right:30mm;width:120pt">`,
    lines: [T.wmTitle, T.wmBody, T.circularBody, T.circularBody2] },
  { id: 'type-textboxes-rotated', type: 'text-boxes', arrangement: ['text-boxes', 'rotated-90', 'centred', 'left-aligned-ltr-box'], size: 'A4', fonts: ['Segoe UI'],
    html: () => `<div style="border:1px solid #15775d;padding:8pt;width:60%">${esc(T.boxes[0])}</div><div style="position:absolute;top:60mm;left:12mm;writing-mode:vertical-rl;transform:rotate(180deg);border:1px solid #999;padding:6pt">${esc(T.boxes[1])}</div><div dir="ltr" style="position:absolute;top:70mm;right:30mm;width:70mm;text-align:left;border:1px dashed #999;padding:6pt">${esc(T.boxes[2])}</div><div style="position:absolute;top:120mm;left:40mm;right:40mm;text-align:center;font-size:18pt">${esc(T.boxes[3])}</div><div style="position:absolute;top:160mm;right:20mm;width:120mm;text-align:justify">${esc(T.circularBody)}</div>`,
    lines: [...T.boxes, T.circularBody] },
  { id: 'type-mixed-fonts-line', type: 'mixed-fonts', arrangement: ['mixed-fonts-per-line', 'single-column'], size: 'A4', fonts: ['Traditional Arabic', 'Arial', 'Times New Roman'],
    html: () => `${p(T.invoiceTitle, '', 'font-weight:700;font-size:16pt')}<p>${esc('يبدأ الدوام الساعة ')}<span style="font-family:Arial">7:30</span>${esc(' صباحاً في مبنى ')}<span style="font-family:'Times New Roman'">Building C</span>${esc('، الطابق ٣، مكتب رقم ')}<span style="font-family:Arial">312</span>.</p><p>${esc('المبلغ الإجمالي ')}<span style="font-family:Arial;font-weight:700">28,031.25</span>${esc(' ر.س شامل الضريبة ')}<span style="font-family:Arial">15%</span></p>${p(T.circularBody, '', 'text-align:justify')}`,
    lines: [T.invoiceTitle, T.mixedLine, 'المبلغ الإجمالي 28,031.25 ر.س شامل الضريبة 15%', T.circularBody] },
];

const browser = await chromium.launch({ channel: 'msedge' }), page = await browser.newPage();
const SCRATCH = path.join(FONTS, '..', 'corpus-src'); fs.mkdirSync(SCRATCH, { recursive: true });
for (const d of docs) {
  const html = `<!doctype html><html lang="${d.dir === 'ltr' ? 'en' : 'ar'}" dir="${d.dir ?? 'rtl'}"><head><meta charset="utf-8"><style>${faces(d.fonts)}${d.css ?? PAGE('A4')} body{font-family:"${d.fonts[0]}";font-size:12pt} p{margin:0 0 6pt}</style></head><body>${d.html(d.fonts[0])}</body></html>`;
  const file = path.join(SCRATCH, d.id + '.html');
  fs.writeFileSync(file, html);
  await page.goto('file:///' + fwd(file));
  await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  fs.writeFileSync(path.join(OUT, d.id + '.pdf'), pdf);
  tags[d.id + '.pdf'] = { producer: 'edge', type: d.type, arrangement: d.arrangement, size: d.size, fonts: d.fonts, source: 'digital', lines: d.lines };
  console.log(d.id + '.pdf', Math.round(pdf.length / 1024) + ' kB');
}
await browser.close();
// the CAD-like visual-order file, turned on its side (a landscape drawing stored as a rotated portrait page)
{
  const src = path.join(OUT, 'cadlike-visual-presentation-forms.pdf');
  if (fs.existsSync(src)) {
    const doc = new m.PDFDocument(new Uint8Array(fs.readFileSync(src)));
    doc.findPage(0).put('Rotate', 90);
    const bytes = doc.saveToBuffer('garbage=compact').asUint8Array();
    fs.writeFileSync(path.join(OUT, 'type-cadlike-rotated90.pdf'), bytes);
    tags['type-cadlike-rotated90.pdf'] = { producer: 'waraq', type: 'technical-drawing', arrangement: ['rotated-page-90', 'visual-order', 'presentation-forms'], size: 'A4 rotated', fonts: ['Tajawal'], source: 'digital', lines: [] };
    console.log('type-cadlike-rotated90.pdf', Math.round(bytes.length / 1024) + ' kB');
  }
}
fs.writeFileSync(TAGS, JSON.stringify(tags, null, 1));
