/* Engine setup explained for the situation the user is actually in (desktop app, website on a computer, phone),
   in the current interface language. Rendered inside the "Processing engines" dialog. */
export function engineGuide(t,caps){
  const desktop=window.waraqDesktop?.isDesktop===true;
  const phone=/Android|iPhone|iPod/i.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1)||/iPad/.test(navigator.userAgent);
  const ready=(id)=>!!caps?.operations?.[id]?.available;
  const office=ready('officeToPdf'),ocr=ready('ocr'),qpdf=ready('protect');
  const step=(items)=>`<ol class="engine-steps">${items.map((x)=>`<li>${x}</li>`).join('')}</ol>`;
  const code=(s)=>`<code dir="ltr">${s}</code>`;
  if(desktop){
    const missing=[!ocr&&t('Searchable OCR and Fix Arabic text','OCR القابل للبحث وإصلاح النص العربي'),!qpdf&&t('Protect, unlock, repair and optimize','الحماية وفك القفل والإصلاح والتحسين'),!office&&t('Word, PowerPoint and Office conversion','التحويل إلى Word وPowerPoint وأوفيس')].filter(Boolean);
    return `<details open class="engine-guide"><summary>${t('How engines work in the desktop app','كيف تعمل المحركات في تطبيق سطح المكتب')}</summary>
      <p>${t('Nothing to set up. The Full edition of Waraq for Windows includes every engine. They run on this computer, without internet, and your files never leave it.','لا يلزم أي إعداد. تتضمن النسخة الكاملة من ورق لويندوز جميع المحركات، وتعمل على هذا الجهاز دون إنترنت، ولا تغادر ملفاتك جهازك.')}</p>
      ${missing.length?`<p class="engine-warn">${t('Not available in this installation:','غير متاح في هذا التثبيت:')} ${missing.join('، ')}.</p>${step([
        t('This usually means the Lite edition is installed. Download the Full edition from the Downloads page and install it over this one; your settings are kept.','غالباً لديك النسخة المختصرة. نزّل النسخة الكاملة من صفحة التنزيلات وثبّتها فوق الحالية؛ تبقى إعداداتك كما هي.'),
        t('Restart Waraq. Engine tools then show “Engine ready”.','أعد تشغيل ورق. ستظهر أدوات المحرك بعدها بعلامة «المحرك جاهز».')])}`:`<p class="engine-ok">${t('All engines are installed and ready.','جميع المحركات مثبتة وجاهزة.')}</p>`}
      <p>${t('Certificate signing uses the certificates installed in Windows (including USB tokens and smart cards) or a .pfx file you choose.','يستخدم التوقيع بالشهادة الشهادات المثبتة في ويندوز (ومنها مفاتيح USB والبطاقات الذكية) أو ملف ‎.pfx تختاره.')}</p></details>`;
  }
  if(phone){
    return `<details open class="engine-guide"><summary>${t('Engines on a phone or tablet','المحركات على الهاتف أو الجهاز اللوحي')}</summary>
      <p>${t('Phones cannot run the engines. Every tool in the main list works on your phone without them. For engine tools you have two choices:','لا يمكن تشغيل المحركات على الهاتف. جميع أدوات القائمة الرئيسية تعمل على هاتفك دونها. ولأدوات المحرك لديك خياران:')}</p>
      ${step([t('Use Waraq on a Windows computer with the desktop app. Everything is included.','استخدم ورق على جهاز ويندوز مع تطبيق سطح المكتب، وكل شيء مضمَّن.'),
        t('Or connect to a Waraq server that you or your company run: enter its https:// address and access token above, then press “Connect and check tools”.','أو اتصل بخادم ورق تديره أنت أو جهة عملك: أدخل عنوانه ‎https://‎ ورمز الوصول أعلاه، ثم اضغط «اتصال وفحص الأدوات».')])}</details>`;
  }
  return `<details class="engine-guide"><summary>${t('Set up engines — step by step','إعداد المحركات — خطوة بخطوة')}</summary>
    <p>${t('A website cannot run programs on your computer, so engine tools need one of these. Option A is the easiest.','لا يستطيع الموقع تشغيل برامج على جهازك، لذا تحتاج أدوات المحرك إلى أحد الخيارات التالية. الخيار (أ) هو الأسهل.')}</p>
    <h4>${t('A. Install the desktop app (recommended)','أ. ثبّت تطبيق سطح المكتب (موصى به)')}</h4>
    ${step([t('Open Downloads and choose “Waraq for Windows — Full”.','افتح التنزيلات واختر «ورق لويندوز — النسخة الكاملة».'),
      t('Run the installer. It does not need administrator rights.','شغّل ملف التثبيت. لا يحتاج إلى صلاحيات المسؤول.'),
      t('If Windows shows “Windows protected your PC”, choose More info → Run anyway (the preview build is not yet signed).','إذا ظهرت رسالة «حمى ويندوز جهازك»، اختر «مزيد من المعلومات» ثم «تشغيل على أي حال» (النسخة التجريبية غير موقّعة بعد).'),
      t('Open Waraq. All engine tools are ready, offline.','افتح ورق. جميع أدوات المحرك جاهزة دون اتصال.')])}
    <h4>${t('B. Run the companion server on this computer','ب. شغّل الخادم المرافق على هذا الجهاز')}</h4>
    ${step([t('Install Node.js 22 or newer from nodejs.org.','ثبّت Node.js الإصدار 22 أو أحدث من nodejs.org.'),
      t('Download and unzip the app and server kit (link below).','نزّل حزمة التطبيق والخادم وفك ضغطها (الرابط أدناه).'),
      t('Install the engines you need: qpdf, Tesseract with Arabic (ara), MuPDF and LibreOffice.','ثبّت المحركات التي تحتاجها: qpdf وTesseract مع العربية (ara) وMuPDF وLibreOffice.'),
      t('In the unzipped folder run '+code('node server.cjs')+', then open '+code('http://127.0.0.1:4173')+'.','في المجلد شغّل '+code('node server.cjs')+' ثم افتح '+code('http://127.0.0.1:4173')+'.')])}
    <h4>${t('C. A shared server for a team (Docker)','ج. خادم مشترك لفريق (Docker)')}</h4>
    ${step([t('On the server, open the '+code('backend')+' folder of the kit.','على الخادم افتح مجلد '+code('backend')+' من الحزمة.'),
      t('Copy '+code('.env.example')+' to '+code('.env')+', set '+code('WARAQ_API_TOKEN')+' (24+ random characters) and '+code('WARAQ_ALLOWED_ORIGINS')+' to this website’s address.','انسخ '+code('.env.example')+' باسم '+code('.env')+' واضبط '+code('WARAQ_API_TOKEN')+' (24 حرفاً عشوائياً أو أكثر) و'+code('WARAQ_ALLOWED_ORIGINS')+' على عنوان هذا الموقع.'),
      t('Run '+code('docker compose up -d')+' and put it behind HTTPS.','شغّل '+code('docker compose up -d')+' واجعله خلف HTTPS.'),
      t('Here, enter the server address and token above and press “Connect and check tools”.','هنا أدخل عنوان الخادم والرمز أعلاه واضغط «اتصال وفحص الأدوات».')])}
    <p class="pw-muted">${t('Your files are sent to an engine only when you press “Send to engine and process”, and only to the address shown.','لا تُرسل ملفاتك إلى أي محرك إلا عند الضغط على «إرسال للمحرك والمعالجة»، وإلى العنوان الظاهر فقط.')}</p>
    <a href="offline/waraq-offline.zip" download>${t('Download app and server kit','تنزيل التطبيق وحزمة الخادم')}</a></details>`;
}
