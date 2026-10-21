// The Arabic paragraphs every corpus file carries (the same text from many producers and fonts), tagged by kind, and
// the replacement texts the audit types into each line. Used by tools/arabic/make-corpus.mjs and audit-edit.mjs.
export const TEXTS = [
  { kind: 'letter', text: 'بسم الله الرحمن الرحيم' },
  { kind: 'letter', text: 'سعادة مدير عام الشؤون الإدارية المحترم' },
  { kind: 'letter', text: 'السلام عليكم ورحمة الله وبركاته،' },
  { kind: 'letter', text: 'نفيدكم بأن اللجنة اعتمدت التقرير النهائي للمشروع بتاريخ 15/03/2026، ونأمل التكرم بالاطلاع والإفادة.' },
  { kind: 'letter', text: 'وتقبلوا فائق الاحترام والتقدير.' },
  { kind: 'invoice', text: 'فاتورة رقم 2026-0147 / Invoice No. 2026-0147' },
  { kind: 'invoice', text: 'العميل: شركة الأفق للتجارة (Horizon Trading LLC)' },
  { kind: 'invoice', text: 'المبلغ الإجمالي: ٤٬٥٠٠٫٧٥ ر.س — Total: SAR 4,500.75' },
  { kind: 'invoice', text: 'تاريخ الاستحقاق: ٣٠ يونيو ٢٠٢٦' },
  { kind: 'tashkeel', text: 'إِنَّ اللُّغَةَ العَرَبِيَّةَ لُغَةٌ غَنِيَّةٌ بِالمُفْرَدَاتِ وَالتَّرَاكِيبِ.' },
  { kind: 'table', cells: ['البند', 'الكمية', 'السعر'] },
  { kind: 'table', cells: ['أوراق A4', '١٠ رزم', '١٢٠٫٠٠ ر.س'] },
  { kind: 'table', cells: ['أحبار طابعة', '3 عبوات', '450.00 SAR'] },
  { kind: 'mixed', text: 'استخدم برنامج Waraq (الإصدار 1.0) لتحرير ملفات PDF بسهولة؛ راجع «الدليل» ص. 12-14.' },
  { kind: 'lamalef', text: 'الآلاء والأمل لا يلتقيان إلا بالإخلاص' },
  { kind: 'justified', text: 'تهدف هذه الوثيقة إلى بيان الإجراءات المتبعة في إعداد التقارير الدورية ومراجعتها واعتمادها، بما يضمن دقة البيانات وسلامة الإحصاءات المنشورة، ويحدد مسؤوليات كل جهة في مراحل العمل المختلفة.' },
  { kind: 'bold', text: 'تنبيه مهم: يُرجى قراءة الشروط قبل التوقيع.', bold: true },
  { kind: 'italic', text: 'ملاحظة جانبية بخط مائل للتوضيح فقط.', italic: true },
  { kind: 'green', text: 'تمت الموافقة على الطلب بنجاح.', color: '#15775d' },
  { kind: 'red', text: 'مرفوض: البيانات غير مكتملة.', color: '#b3261e' },
  { kind: 'small', text: 'طُبع هذا المستند آلياً ولا يحتاج إلى توقيع — صفحة 1 من 3', size: 8 },
  { kind: 'large', text: 'تقرير الأداء السنوي ٢٠٢٦', size: 28 },
];

/** What the audit types into a selected line: (i) another sentence of about the same length, (ii) the same text with one
 *  word changed, (iii) tashkeel, digits, Latin and punctuation, (iv) a longer sentence. */
export const SCENARIOS = ['similar', 'oneword', 'mixed', 'longer'];
const SIMILAR = [
  'شكراً لتعاونكم', 'تم استلام الطلب بنجاح', 'نشكر لكم حسن تعاونكم الدائم', 'يرجى مراجعة الإدارة المختصة خلال أسبوع من تاريخه',
  'تعتمد اللجنة التقرير المرفق وتوصي بتعميمه على جميع الجهات ذات العلاقة لاتخاذ ما يلزم بشأنه',
  'تؤكد الإدارة التزامها الكامل بتطبيق الأنظمة واللوائح المعمول بها وضمان جودة الخدمات المقدمة للمستفيدين في جميع المناطق دون استثناء',
];
export const MIXED = 'مُراجَعة البند 3 (Section A) قبل ٢٠٢٦/٠٦/٣٠؛ انظر ملف PDF.';
export const LONGER_TAIL = ' — وذلك وفق ما ورد في الفقرة الثانية من التعميم.';
const WORDS = ['الجديدة', 'المرفقة', 'السابقة', 'المعتمدة', 'الحالية', 'المذكورة'];
export function replacement(original, scenario) {
  const n = [...original].length;
  if (scenario === 'similar') return SIMILAR.reduce((a, b) => (Math.abs([...b].length - n) < Math.abs([...a].length - n) ? b : a));
  if (scenario === 'oneword') { const w = original.split(' '); const i = Math.min(1, w.length - 1); w[i] = WORDS[n % WORDS.length]; return w.join(' '); }
  if (scenario === 'mixed') return MIXED;
  return original + LONGER_TAIL;
}
