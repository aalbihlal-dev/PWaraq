# Waraq 1.0 beta — release notes

*English first, العربية below.*

Waraq is a free, open-source (AGPL-3.0) PDF studio for Arabic and English documents. It runs on your computer: **your files are not uploaded anywhere.**

This is a **beta**. It is ready to use for everyday work, and it has limits, which are listed honestly at the end of this page. Please read them once.

## What Waraq 1.0 beta does

Ten tasks sit in one bar at the top. The interface is in Arabic or English (one click to switch) and has four themes: Light, Dim, Dark and Graphite.

| Task | What you can do |
|---|---|
| **View** | Open a PDF, zoom, thumbnails, find in the document, recent files. |
| **Organize** | Reorder, rotate, delete, insert, extract, split and crop pages. |
| **Edit** | Click a line of text or a photo on a page and change it; add text and photos; page numbers and watermarks for the whole document. A changed Arabic line keeps its own font when the PDF allows it. |
| **Convert** | Word, Excel, PowerPoint, DWG and DXF to PDF; pages to PNG pictures; make a file smaller (compress). |
| **Sign** | Draw, type or photograph your signature, with your name and date (Gregorian or Hijri, Western or Arabic-Indic digits); sign a batch of files in one go; optionally sign with a digital ID (certificate) and check other signatures. |
| **Protect** | Password-protect a copy (AES-256), or remove a password you know. |
| **Redact** | Remove text, photos and lines under a box for good, or mark all phone numbers, e-mail addresses or a word. |
| **Forms** | Fill in PDF forms in Arabic or English; keep them fillable or fix the answers. |
| **OCR** | Add searchable text to scanned pages. The picture is not changed. |
| **Comment** | Highlight, underline, strike through, draw, add arrows, text boxes and sticky notes. Other PDF readers show them too. |

Also: **Portfolio (حافظة)** gathers many files into one PDF with a cover, divider pages, a contents page, page numbers and bookmarks. You keep adding to it and can save it as a `.waraq` file.

## What is new compared with 0.3.3

- One PDF engine (MuPDF) for the web version and the Windows app, so both behave the same.
- A real page editor: text is changed in place, in the line's own font, not covered with a picture.
- New tasks: Portfolio, Sign (with certificate signatures), Redact, Forms, Comment, OCR with a cleaning step before reading, Office and CAD conversion.
- Arabic is drawn with HarfBuzz shaping everywhere Waraq writes text: harakat, Persian and Urdu letters, Arabic-Indic digits and mixed Arabic/English lines.
- Your work is protected: unsaved work is kept and offered back after a crash, saving checks the new file before replacing the old one, and a damaged PDF opens as far as it can be read. A crash report is shown to you first and is only sent if you click.
- The Windows app updates itself (the update is checked first) and goes back to the previous version if the new one does not start.

## The Windows installer

- **Size:** about 28 MB. **Per-user:** no administrator rights are needed; it installs into your own profile. Windows 10 or 11, 64-bit.
- **"Open with Waraq"** is added for `.pdf` files. Waraq never takes over your default PDF reader. `.waraq` files open in Waraq, and a right-click entry "Open in Waraq" is added. Uninstalling removes all of it.
- **Word, Excel, PowerPoint, DWG and DXF** need a one-time add-on (about 137 MB). Waraq asks before downloading it, checks it, and keeps it on your computer.
- **Windows will warn you the first time.** The installer is not code-signed yet, so Windows SmartScreen says *"Windows protected your PC — unknown publisher"*. This is expected for this beta. To continue: click **More info**, then **Run anyway**. You can check the download first: the file's SHA-256 is published with the release.

## Known limits in this beta

What Waraq draws is correct in every case we measured. The limits below are about editing existing lines and about reading text back (Find, copy).

**Editing Arabic text (Edit task).** We tested 2,584 scripted edits on Arabic test documents (made with Edge, Word, LibreOffice and others, including real documents and scans). 98.9 % had no real problem; **29 (1.1 %) did**, and they are these:
- **Fully vowelled lines** (poetry, Qur'anic text) from some producers: after you edit such a line, a vowel mark or a space can sit one letter off in the text box, and now and then a letter of the old line stays. Check these lines after editing.
- **A very long replacement sentence** is squeezed into the old line's width (smaller letters first, then narrower) and never wraps. Waraq warns you in the panel; shorten the text or widen the box.
- **Some PDF fonts cannot be reused** (for example fonts a program cut down for its own text, or fonts without Arabic joining rules). Waraq then writes the line in the same family from your PC, or in Amiri or Tajawal, and tells you which.

**Reading text back (Find and copy).**
- Some readers copy a line that mixes Arabic with numbers or English words in the order it is *drawn*, not the order it is *read*. This depends on the reader, not on the file.
- In Waraq's own Find, single words in text Waraq wrote are found 92–97 % of the time. Whole phrases that mix Arabic and numbers or English are found less often (about a third to a half); numbers in Arabic-Indic digits (١٢٣) are not found; a plain word is not found inside a fully vowelled line; and Find only partly works on text added to pages turned 90° or 270°.

**OCR (scanned pages).** Clean printed Arabic reads well: 86–98 % of words on our test pages. Old scanned books, photocopies, fully vowelled text, small-print tables and old prints read much worse, and number columns need checking by eye. OCR adds searchable text; it does not replace reading the result.

**Other.** The installer is not code-signed (see above). The web version cannot convert Word, Excel, PowerPoint or CAD files.

Found a problem? Open the Support page at pwaraq.com or report it on GitHub (github.com/tshi-dev/PWaraq). If Waraq closes unexpectedly it offers a crash report, which you can read first and which is only sent if you click.

---

<div dir="rtl">

# ورق 1.0 (تجريبي) — ملاحظات الإصدار

ورق أداة PDF مجانية ومفتوحة المصدر (AGPL-3.0) للمستندات العربية والإنجليزية. تعمل على جهازك: **ملفاتك لا تُرفع إلى أي مكان.**

هذا إصدار **تجريبي**. هو جاهز للعمل اليومي، وله حدود نذكرها بصراحة في آخر الصفحة، فنرجو قراءتها مرة واحدة.

## ماذا يفعل ورق 1.0 التجريبي

عشر مهام في شريط واحد أعلى النافذة. الواجهة بالعربية أو الإنجليزية (بنقرة واحدة)، وفيها أربعة مظاهر: فاتح، خافت، داكن، فحمي.

| المهمة | ما يمكنك فعله |
|---|---|
| **عرض** | فتح ملف PDF، التكبير، الصور المصغرة، البحث في المستند، الملفات الأخيرة. |
| **تنظيم** | ترتيب الصفحات وتدويرها وحذفها وإدراجها واستخراجها وتقسيمها وقصّها. |
| **تحرير** | انقر سطر نص أو صورة في الصفحة وغيّره؛ وأضف نصًا وصورًا؛ وأرقام صفحات وعلامات مائية للمستند كله. يبقى السطر العربي المعدَّل بخطه الأصلي متى سمح الملف بذلك. |
| **تحويل** | تحويل وورد وإكسل وباوربوينت وDWG وDXF إلى PDF؛ وحفظ الصفحات صورًا PNG؛ وتصغير حجم الملف. |
| **توقيع** | ارسم توقيعك أو اكتبه أو صوّره، مع اسمك وتاريخك (ميلادي أو هجري، بأرقام غربية أو هندية)؛ ووقّع عدة ملفات دفعة واحدة؛ ويمكنك التوقيع بهوية رقمية (شهادة) والتحقق من توقيعات الآخرين. |
| **حماية** | حفظ نسخة محمية بكلمة مرور (AES-256)، أو إزالة كلمة مرور تعرفها. |
| **تعتيم** | إزالة النص والصور والخطوط تحت مربع نهائيًا، أو تعليم كل أرقام الهاتف أو عناوين البريد أو كلمة معيّنة. |
| **نماذج** | تعبئة نماذج PDF بالعربية أو الإنجليزية؛ وإبقاؤها قابلة للتعبئة أو تثبيت الإجابات. |
| **التعرف على النص** | إضافة نص قابل للبحث إلى الصفحات الممسوحة. الصورة لا تتغير. |
| **تعليق** | تمييز وتسطير وشطب ورسم وأسهم ومربعات نص وملاحظات لاصقة. وتعرضها قارئات PDF الأخرى أيضًا. |

وفيه أيضًا **الحافظة**: تجمع ملفات كثيرة في ملف PDF واحد بغلاف وصفحات فاصلة وصفحة محتويات وأرقام صفحات وإشارات مرجعية. تضيف إليها متى شئت، ويمكنك حفظها بصيغة ‎.waraq‎.

## الجديد مقارنة بالإصدار 0.3.3

- محرّك PDF واحد (MuPDF) لنسخة الويب وتطبيق ويندوز، فيتصرفان بالطريقة نفسها.
- محرّر صفحات حقيقي: يُغيَّر النص في مكانه وبخط السطر نفسه، لا يُغطّى بصورة.
- مهام جديدة: الحافظة، والتوقيع (مع التوقيع بالشهادات)، والتعتيم، والنماذج، والتعليق، والتعرف على النص مع تنظيف الصورة قبل القراءة، وتحويل ملفات أوفيس وCAD.
- تُرسم العربية بتشكيل HarfBuzz في كل مكان يكتب فيه ورق نصًا: الحركات، والحروف الفارسية والأردية، والأرقام الهندية، والأسطر المختلطة بالإنجليزية.
- عملك محفوظ: يُحفظ ما لم تحفظه ويُعرض عليك بعد أي انهيار، ويفحص الحفظ الملف الجديد قبل أن يستبدل القديم، ويُفتح الملف التالف بقدر ما يمكن قراءته. ويُعرض عليك تقرير العطل أولًا ولا يُرسل إلا إذا نقرت.
- يحدّث تطبيق ويندوز نفسه (بعد فحص التحديث)، ويعود إلى الإصدار السابق إذا لم يبدأ الجديد.

## مثبّت ويندوز

- **الحجم:** نحو 28 ميغابايت. **لكل مستخدم:** لا يحتاج صلاحيات المسؤول، ويُثبَّت في ملفك الشخصي. ويندوز 10 أو 11، 64 بت.
- تُضاف «فتح باستخدام ورق» لملفات ‎.pdf‎، ولا يستولي ورق على قارئ PDF الافتراضي عندك أبدًا. وتُفتح ملفات ‎.waraq‎ في ورق، ويُضاف أمر «فتح في ورق» بالنقر الأيمن. وتُزال كلها عند إلغاء التثبيت.
- **وورد وإكسل وباوربوينت وDWG وDXF** تحتاج إضافة تُنزَّل مرة واحدة (نحو 137 ميغابايت). يسألك ورق قبل التنزيل، ويتحقق منها، ويحتفظ بها على جهازك.
- **سيحذّرك ويندوز في أول مرة.** المثبّت غير موقَّع رقميًا بعد، فتعرض خاصية SmartScreen عبارة *«حماية ويندوز لجهازك — ناشر غير معروف»*. هذا متوقع في هذا الإصدار التجريبي. للمتابعة: انقر **مزيد من المعلومات** ثم **تشغيل على أي حال**. ويمكنك التحقق من التنزيل قبل ذلك: بصمة SHA-256 للملف منشورة مع الإصدار.

## حدود هذا الإصدار التجريبي

ما يرسمه ورق صحيح في كل الحالات التي قِسناها. والحدود أدناه تخص تعديل الأسطر الموجودة وقراءة النص (البحث والنسخ).

**تعديل النص العربي (مهمة تحرير).** اختبرنا 2٬584 تعديلًا مبرمجًا على مستندات عربية (من Edge وWord وLibreOffice وغيرها، ومنها مستندات حقيقية ومسوحات ضوئية). في 98٫9٪ منها لم تظهر مشكلة حقيقية، و**ظهرت في 29 حالة (1٫1٪)**، وهي:
- **الأسطر المشكولة بالكامل** (الشعر والنص القرآني) من بعض البرامج: بعد تعديل سطر كهذا قد تظهر حركة أو مسافة في صندوق النص مزاحة حرفًا واحدًا، وقد يبقى أحيانًا حرف من السطر القديم. راجع هذه الأسطر بعد التعديل.
- **الجملة البديلة الطويلة جدًا** تُضغط في عرض السطر القديم (بتصغير الحروف أولًا ثم تضييقها) ولا تلتف على سطر ثانٍ. ينبّهك ورق في اللوحة؛ اختصر النص أو وسّع الصندوق.
- **بعض خطوط PDF لا يمكن إعادة استخدامها** (مثل خطوط قصّها برنامج لنصه الخاص، أو خطوط بلا قواعد وصل الحروف العربية). عندها يكتب ورق السطر بالخط نفسه من العائلة نفسها المثبّتة على جهازك، أو بخط أميري أو تجوال، ويخبرك بذلك.

**قراءة النص (البحث والنسخ).**
- بعض القارئات تنسخ السطر الذي يمزج العربية بالأرقام أو بكلمات إنجليزية بترتيب **رسمه** لا بترتيب **قراءته**. وهذا يتوقف على القارئ لا على الملف.
- في بحث ورق نفسه تُوجد الكلمات المفردة في النص الذي كتبه ورق بنسبة 92–97٪. أما العبارات الكاملة التي تمزج العربية بأرقام أو إنجليزية فتُوجد أقل (من ثلثها إلى نصفها تقريبًا)؛ والأرقام الهندية (١٢٣) لا تُوجد؛ والكلمة بلا تشكيل لا تُوجد داخل سطر مشكول بالكامل؛ ويعمل البحث جزئيًا فقط في النص المضاف إلى صفحات مدوَّرة 90° أو 270°.

**التعرف على النص (الصفحات الممسوحة).** تُقرأ العربية المطبوعة النظيفة جيدًا: 86–98٪ من الكلمات في صفحات الاختبار. أما الكتب الممسوحة القديمة والنسخ المصوّرة والنص المشكول بالكامل والجداول بخط صغير والمطبوعات القديمة فتُقرأ أضعف بكثير، وأعمدة الأرقام تحتاج إلى مراجعة بالعين. التعرف على النص يضيف نصًا قابلًا للبحث، ولا يغني عن مراجعة النتيجة.

**أخرى.** المثبّت غير موقَّع رقميًا (انظر أعلاه). ولا تستطيع نسخة الويب تحويل ملفات وورد وإكسل وباوربوينت وCAD.

وجدت مشكلة؟ افتح صفحة الدعم في pwaraq.com أو أبلغ عنها على GitHub (‏github.com/tshi-dev/PWaraq‏). وإذا أُغلق ورق بشكل غير متوقع عرض عليك تقرير عطل تقرؤه أولًا ولا يُرسل إلا إذا نقرت.

</div>
