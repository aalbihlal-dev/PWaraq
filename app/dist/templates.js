/* Independent, browser-only document templates. No pdfcn or PDFx code is included. */
import {icon} from './icons.js';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PAGE = {width:1190,height:1684,margin:96,bottom:1550};

export function calculateInvoice(rows, taxPercent = 0) {
  const tax = Number(taxPercent);
  if (!Number.isFinite(tax) || tax < 0 || tax > 100) throw new Error('Tax must be between 0 and 100.');
  if (!Array.isArray(rows) || !rows.length || rows.length > 40) throw new Error('Add between 1 and 40 invoice lines.');
  const lines = rows.map(row => {
    const quantity = Number(row.quantity), price = Number(row.price);
    if (!String(row.description || '').trim()) throw new Error('Each invoice line needs a description.');
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000 || !Number.isFinite(price) || price < 0 || price > 1000000) throw new Error('Check the quantity and price on each line.');
    const priceCents = Math.round(price * 100);
    return {...row, description:String(row.description).trim(), quantity, price:priceCents/100, cents:Math.round(priceCents * quantity)};
  });
  const subtotal = lines.reduce((total,row) => total + row.cents,0), taxAmount = Math.round(subtotal * tax / 100);
  return {lines,subtotal,tax:taxAmount,total:subtotal+taxAmount,taxPercent:tax};
}

function wrappedLines(context, text, width) {
  const lines = [];
  for (const paragraph of String(text).replace(/\r/g,'').split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    let current = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current ? current+' '+word : word;
      if (context.measureText(candidate).width <= width) { current=candidate; continue; }
      if (current) { lines.push(current); current=''; }
      if (context.measureText(word).width <= width) { current=word; continue; }
      const characters = typeof Intl.Segmenter==='function' ? [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(word)].map(p=>p.segment) : Array.from(word);
      for (const character of characters) {
        if (current && context.measureText(current+character).width>width) { lines.push(current); current=''; }
        current+=character;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function renderDocument(values) {
  const rtl = values.language==='ar', D=(en,ar)=>rtl?ar:en, canvases=[];
  const xStart=rtl?PAGE.width-PAGE.margin:PAGE.margin, ink='#273f36', muted='#6e7d74', teal='#15775d';
  let canvas,ctx,y;
  const font=(size=24,weight=400)=>{ctx.font=`${weight} ${size}px Tahoma, Arial, sans-serif`;};
  const text=(value,x,yPos,size=24,color=ink,align=rtl?'right':'left',weight=400)=>{font(size,weight);ctx.fillStyle=color;ctx.textAlign=align;ctx.direction=rtl?'rtl':'ltr';ctx.fillText(String(value),x,yPos);};
  const rule=(yPos,color='#e0e7de')=>{ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(PAGE.margin,yPos);ctx.lineTo(PAGE.width-PAGE.margin,yPos);ctx.stroke();};
  const newPage=()=>{
    if(canvases.length>=20)throw new Error(D('This template is limited to 20 pages. Shorten the content.','الحد الأقصى للقالب ٢٠ صفحة. اختصر المحتوى.'));
    canvas=document.createElement('canvas');canvas.width=PAGE.width;canvas.height=PAGE.height;ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,PAGE.width,PAGE.height);ctx.textBaseline='alphabetic';canvases.push(canvas);y=PAGE.margin;
    if(canvases.length>1){text(values.title,xStart,y,21,muted);rule(y+22);y+=70;}
  };
  const paragraph=(value,size=24,lineHeight=42,width=PAGE.width-PAGE.margin*2)=>{
    font(size);const lines=wrappedLines(ctx,value,width);
    for(const line of lines){if(y+lineHeight>PAGE.bottom)newPage();text(line,xStart,y,size);y+=lineHeight;}
  };
  const money=cents=>new Intl.NumberFormat(rtl?'ar-SA':'en-US',{style:'currency',currency:values.currency||'SAR',minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
  newPage();
  if(values.kind==='letter'){
    text(values.author||D('Correspondence','مراسلات'),xStart,y,22,teal,undefined,600);y+=60;
    font(43,600);for(const line of wrappedLines(ctx,values.title,PAGE.width-PAGE.margin*2)){text(line,xStart,y,43,ink,undefined,600);y+=58;}
    if(values.date){text(values.date,xStart,y+7,21,muted);y+=48;}
    rule(y+4);y+=65;
    paragraph(values.body,25,43);y+=24;
    if(values.author){if(y+70>PAGE.bottom)newPage();text(values.author,xStart,y,25,teal,undefined,600);}
  } else {
    const invoice=calculateInvoice(values.rows,values.tax);
    text(values.author||D('Your business','اسم المنشأة'),xStart,y,25,teal,undefined,600);y+=65;
    font(43,600);for(const line of wrappedLines(ctx,values.title||D('Invoice','فاتورة'),PAGE.width-PAGE.margin*2)){text(line,xStart,y,43,ink,undefined,600);y+=58;}
    text(D('Invoice no. ','رقم الفاتورة: ')+values.reference,xStart,y+5,22,muted);y+=42;
    text(D('Date: ','التاريخ: ')+values.date,xStart,y,22,muted);y+=40;
    rule(y);y+=48;
    text(D('Bill to','فاتورة إلى'),xStart,y,21,muted);y+=37;
    paragraph(values.recipient||D('Client name','اسم العميل'),25,39);y+=25;
    const cols=rtl?[{x:1094,width:498,align:'right'},{x:530,width:130,align:'right'},{x:375,width:180,align:'right'},{x:225,width:125,align:'right'}]:[{x:96,width:498,align:'left'},{x:650,width:100,align:'right'},{x:850,width:180,align:'right'},{x:1094,width:215,align:'right'}];
    const rowHeader=()=>{
      ctx.fillStyle='#edf3e9';ctx.fillRect(PAGE.margin,y-28,PAGE.width-PAGE.margin*2,50);
      [D('Description','الوصف'),D('Qty','الكمية'),D('Unit price','سعر الوحدة'),D('Amount','المبلغ')].forEach((label,i)=>text(label,cols[i].x+(i===0?(rtl?-12:12):0),y+4,20,teal,cols[i].align,600));y+=55;
    };
    rowHeader();
    for(const line of invoice.lines){
      font(22);const description=wrappedLines(ctx,line.description,cols[0].width-25),height=Math.max(65,description.length*34+25);
      if(y+height>PAGE.bottom){newPage();rowHeader();}
      description.forEach((part,index)=>text(part,cols[0].x+(rtl?-12:12),y+index*34,22,ink,cols[0].align));
      const quantity=new Intl.NumberFormat(rtl?'ar-SA':'en-US',{maximumFractionDigits:4}).format(line.quantity);
      [quantity,money(Math.round(line.price*100)),money(line.cents)].forEach((value,i)=>{
        const col=cols[i+1];font(20);let size=20;const measured=ctx.measureText(value).width;if(measured>col.width)size=Math.max(13,20*col.width/measured);text(value,col.x,y,size,ink,col.align);
      });
      y+=height;rule(y-22);
    }
    if(y+190>PAGE.bottom)newPage();
    y+=25;
    const labelX=rtl?450:760,amountX=rtl?96:1094,amountAlign=rtl?'left':'right';
    text(D('Subtotal','المجموع الفرعي'),labelX,y,23,muted);text(money(invoice.subtotal),amountX,y,24,ink,amountAlign);y+=45;
    text(D(`Tax (${invoice.taxPercent}%)`,`الضريبة (${invoice.taxPercent}٪)`),labelX,y,23,muted);text(money(invoice.tax),amountX,y,24,ink,amountAlign);y+=55;
    text(D('Total','الإجمالي'),labelX,y,27,teal,undefined,600);text(money(invoice.total),amountX,y,28,teal,amountAlign,600);y+=70;
    if(values.body.trim()){rule(y);y+=46;paragraph(values.body,22,38);}
  }
  canvases.forEach((page,index)=>{const footer=page.getContext('2d');footer.font='18px Tahoma, Arial, sans-serif';footer.textAlign='center';footer.fillStyle='#8b978f';footer.direction='ltr';footer.fillText(`${index+1} / ${canvases.length}`,PAGE.width/2,PAGE.height-54);});
  return canvases;
}

export function runTemplates(context) {
  const {t,modal,download,msg}=context, PDFLib=context.PDFLib||globalThis.PDFLib;
  const $=selector=>document.querySelector(selector);
  const uiArabic=document.documentElement.lang==='ar';
  let canvases=[],previewIndex=0,previewTimer=null,closed=false;
  const today=new Date(),dateValue=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  modal(t('Create a document','إنشاء مستند'),`
    <style>
      dialog:has(.template-editor){width:min(1140px,96vw);max-width:1140px}.template-editor{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}.template-preview-wrap{background:#e9eee3;border:1px solid #dae3d2;border-radius:9px;padding:15px;align-self:start;position:sticky;top:0}.template-preview{max-height:62vh;overflow:auto;text-align:center}.template-preview canvas{width:100%;height:auto;display:block;background:white;box-shadow:0 3px 14px #273c3520}.template-preview-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px;font-size:11px}.template-preview-nav button{padding:6px}.template-invoice-row{display:grid;grid-template-columns:minmax(100px,1fr) 60px 80px 30px;gap:6px;align-items:start}.template-invoice-row input{padding:7px!important;font-size:11px!important;margin:4px 0!important}.template-invoice-row label{margin:0!important;font-size:9px!important}.template-invoice-row button{margin-top:20px!important;padding:6px!important;min-height:34px}.template-invoice-row button .icon{width:14px;height:14px}.template-fields .form-row{gap:12px}.template-fields label:first-child{margin-top:0!important}.template-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px}.template-actions .primary{margin-top:0!important}.template-status{font-size:11px!important;min-height:18px;line-height:1.7!important}.template-status.error{color:#a34438!important}.template-notice{font-size:11px!important;margin-bottom:16px!important}.template-fields textarea{min-height:160px!important}.template-invoice-fields textarea{min-height:75px!important}#templateAddLine{font-size:10px!important;padding:6px 9px;margin-top:7px}.template-placeholder{font-size:12px;padding:80px 10px;color:#6e7d74}.template-preview-caption{font-size:10px!important;text-align:center;margin-bottom:0!important}@media(max-width:760px){.template-editor{grid-template-columns:1fr;gap:16px}.template-preview-wrap{position:static}.template-preview{max-height:55vh}.template-invoice-row{grid-template-columns:minmax(90px,1fr) 50px 68px 28px;gap:4px}}
    </style>
    <p class="template-notice">${t('Create a letter or invoice entirely on your device. Arabic is shaped by your browser. The PDF contains page images; its text is not searchable or editable.','أنشئ خطاباً أو فاتورة بالكامل على جهازك. يعالج المتصفح تشكيل العربية. يحتوي PDF على صور للصفحات؛ النص غير قابل للبحث أو التعديل.')}</p>
    <div class="template-editor"><div class="template-fields">
      <div class="form-row"><label>${t('Template','القالب')}<select id="templateKind"><option value="letter">${t('Letter','خطاب')}</option><option value="invoice">${t('Invoice','فاتورة')}</option></select></label><label>${t('Document language','لغة المستند')}<select id="templateLanguage"><option value="en" ${uiArabic?'':'selected'}>English</option><option value="ar" ${uiArabic?'selected':''}>العربية</option></select></label></div>
      <label>${t('Title','العنوان')}<input id="templateTitle" maxlength="150" value="${escapeHTML(t('A note for you','رسالة إليك'))}"></label>
      <div class="form-row"><label>${t('Author / business','الكاتب / المنشأة')}<input id="templateAuthor" maxlength="120" placeholder="${t('Your name','اسمك')}"></label><label>${t('Date','التاريخ')}<input type="date" id="templateDate" value="${dateValue}"></label></div>
      <div id="templateInvoiceFields" class="template-invoice-fields" hidden>
        <div class="form-row"><label>${t('Invoice number','رقم الفاتورة')}<input id="templateReference" maxlength="40" value="INV-001"></label><label>${t('Currency','العملة')}<select id="templateCurrency"><option value="SAR">SAR</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AED">AED</option></select></label></div>
        <label>${t('Bill to','فاتورة إلى')}<textarea id="templateRecipient" maxlength="600" placeholder="${t('Client name and address','اسم العميل وعنوانه')}"></textarea></label>
        <div id="templateLines"></div><button id="templateAddLine">${icon('plus')}${t('Add invoice line','إضافة بند')}</button>
        <label>${t('Tax percentage (optional)','نسبة الضريبة (اختياري)')}<input type="number" id="templateTax" value="0" min="0" max="100" step="0.01"></label>
      </div>
      <label><span id="templateBodyLabel">${t('Letter body','نص الخطاب')}</span><textarea id="templateBody" maxlength="30000" dir="auto">${escapeHTML(t('Hello,\n\nWrite your letter here. Add a new paragraph with a blank line.\n\nKind regards,','مرحباً،\n\nاكتب رسالتك هنا. أضف فقرة جديدة بسطر فارغ.\n\nمع خالص التحية،'))}</textarea></label>
      <div class="template-actions"><button class="primary" id="templateExport">${icon('download')}${t('Download PDF','تنزيل PDF')}</button><span class="subtle">${t('A4 · image-based PDF','A4 · PDF من الصور')}</span></div>
      <p id="templateStatus" class="template-status" role="status" aria-live="polite"></p>
    </div><div class="template-preview-wrap"><div class="template-preview-nav"><button id="templatePrevious" aria-label="${t('Previous preview page','صفحة المعاينة السابقة')}">${icon('arrow-left')}</button><span id="templatePreviewCount"></span><button id="templateNext" aria-label="${t('Next preview page','صفحة المعاينة التالية')}">${icon('arrow-right')}</button></div><div id="templatePreview" class="template-preview"></div><p class="template-preview-caption">${t('Live preview · changes update automatically','معاينة مباشرة · تتحدث التغييرات تلقائياً')}</p></div></div>`);

  const dialog=$('#dialog');
  const clearOnClose=()=>{closed=true;clearTimeout(previewTimer);canvases=[];dialog?.removeEventListener('close',clearOnClose);};
  dialog?.addEventListener('close',clearOnClose);
  const values=()=>({kind:$('#templateKind').value,language:$('#templateLanguage').value,title:$('#templateTitle').value.trim(),author:$('#templateAuthor').value.trim(),date:$('#templateDate').value,body:$('#templateBody').value,reference:$('#templateReference').value.trim(),currency:$('#templateCurrency').value,recipient:$('#templateRecipient').value.trim(),tax:$('#templateTax').value,rows:[...document.querySelectorAll('.template-invoice-row')].map(row=>({description:row.querySelector('[data-field=description]').value,quantity:row.querySelector('[data-field=quantity]').value,price:row.querySelector('[data-field=price]').value}))});
  const status=(value,error=false)=>{const element=$('#templateStatus');if(element){element.textContent=value;element.classList.toggle('error',error);}};
  const showPreview=()=>{
    previewIndex=Math.max(0,Math.min(previewIndex,canvases.length-1));const target=$('#templatePreview');target.replaceChildren();
    if(canvases.length){const selected=canvases[previewIndex];selected.setAttribute('role','img');selected.setAttribute('aria-label',t(`Document preview, page ${previewIndex+1} of ${canvases.length}`,`معاينة المستند، الصفحة ${previewIndex+1} من ${canvases.length}`));target.append(selected);}
    $('#templatePreviewCount').textContent=t(`Page ${canvases.length?previewIndex+1:0} of ${canvases.length}`,`الصفحة ${canvases.length?previewIndex+1:0} من ${canvases.length}`);
    $('#templatePrevious').disabled=previewIndex<=0;$('#templateNext').disabled=previewIndex>=canvases.length-1;
  };
  const updatePreview=()=>{
    if(closed||!$('#templateKind'))return false;
    try{const data=values();if(!data.title)throw new Error(t('Add a document title.','أضف عنواناً للمستند.'));canvases=renderDocument(data);showPreview();status(t('Ready to export.','جاهز للتصدير.'));$('#templateExport').disabled=false;return true;}
    catch(error){canvases=[];showPreview();status(t('Check the form: ','راجع الحقول: ')+(uiArabic?t('Use valid descriptions, quantities and prices.','أدخل وصفاً وكمية وسعراً صالحاً لكل بند وتأكد من اكتمال العنوان.'):error.message),true);$('#templateExport').disabled=true;return false;}
  };
  const schedulePreview=()=>{clearTimeout(previewTimer);previewTimer=setTimeout(updatePreview,180);};
  const addLine=(description='',quantity=1,price=0)=>{
    if(document.querySelectorAll('.template-invoice-row').length>=40){status(t('The limit is 40 invoice lines.','الحد الأقصى ٤٠ بنداً للفاتورة.'),true);return;}
    const row=document.createElement('div');row.className='template-invoice-row';
    row.innerHTML=`<label>${t('Description','الوصف')}<input data-field="description" maxlength="300" dir="auto" value="${escapeHTML(description)}" placeholder="${t('Service or item','الخدمة أو الصنف')}"></label><label>${t('Quantity','الكمية')}<input data-field="quantity" type="number" min="0.0001" max="10000" step="0.0001" value="${quantity}"></label><label>${t('Unit price','سعر الوحدة')}<input data-field="price" type="number" min="0" max="1000000" step="0.01" value="${price}"></label><button aria-label="${t('Remove invoice line','حذف بند الفاتورة')}">${icon('delete')}</button>`;
    row.querySelector('button').onclick=()=>{row.remove();schedulePreview();};$('#templateLines').append(row);schedulePreview();
  };
  addLine(t('Consultation','استشارة'),1,100);
  $('#templateAddLine').onclick=()=>addLine();
  let previousKind='letter',letterBody=$('#templateBody').value,invoiceBody='';
  $('#templateKind').onchange=()=>{
    const kind=$('#templateKind').value;if(previousKind==='letter')letterBody=$('#templateBody').value;else invoiceBody=$('#templateBody').value;
    $('#templateInvoiceFields').hidden=kind!=='invoice';$('#templateTitle').value=kind==='invoice'?t('Invoice','فاتورة'):t('A note for you','رسالة إليك');$('#templateBodyLabel').textContent=kind==='invoice'?t('Notes / payment details','ملاحظات / تفاصيل الدفع'):t('Letter body','نص الخطاب');$('#templateBody').value=kind==='invoice'?invoiceBody:letterBody;previousKind=kind;previewIndex=0;updatePreview();
  };
  document.querySelector('.template-fields').addEventListener('input',schedulePreview);
  $('#templateLanguage').onchange=()=>{const rtl=$('#templateLanguage').value==='ar';['templateTitle','templateAuthor','templateBody','templateRecipient'].forEach(id=>$('#'+id).dir=rtl?'rtl':'ltr');schedulePreview();};
  $('#templatePrevious').onclick=()=>{previewIndex--;showPreview();};$('#templateNext').onclick=()=>{previewIndex++;showPreview();};
  $('#templateExport').onclick=async()=>{
    clearTimeout(previewTimer);if(!updatePreview())return;
    const exportCanvases=[...canvases],data=values(),button=$('#templateExport');button.disabled=true;status(t('Creating PDF…','جارٍ إنشاء PDF…'));
    try{
      const doc=await PDFLib.PDFDocument.create();
      for(const pageCanvas of exportCanvases){const image=await doc.embedPng(pageCanvas.toDataURL('image/png'));const page=doc.addPage([595.28,841.89]);page.drawImage(image,{x:0,y:0,width:595.28,height:841.89});}
      doc.setTitle(data.title);if(data.author)doc.setAuthor(data.author);doc.setProducer('Waraq PDF Studio');doc.setSubject(data.kind==='invoice'?'Invoice generated locally':'Letter generated locally');
      const filename=(data.title||'waraq-document').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,100);
      download(await doc.save(),filename+'.pdf','application/pdf');status(t('PDF downloaded.','تم تنزيل PDF.'));msg?.('Your new document is ready.','المستند الجديد جاهز.');
    }catch(error){console.error('Template export failed',error);status(t('Could not create the PDF. Shorten the document and try again.','تعذر إنشاء PDF. اختصر المستند وحاول مجدداً.'),true);}
    finally{if(button.isConnected)button.disabled=false;}
  };
  ['templateTitle','templateAuthor','templateBody','templateRecipient'].forEach(id=>$('#'+id).dir=uiArabic?'rtl':'ltr');
  clearTimeout(previewTimer);updatePreview();
}
