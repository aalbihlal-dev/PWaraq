/* Additional local browser tools. No service or account is required. */
const $=(selector)=>document.querySelector(selector);
const escape=(value)=>String(value).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PAPER={a4:[595.276,841.89],a3:[841.89,1190.551],letter:[612,792],legal:[612,1008]};

export function bookletOrder(pageCount,rtl=false){
  if(!Number.isInteger(pageCount)||pageCount<1||pageCount>1000)throw new Error('Invalid page count');
  const padded=Math.ceil(pageCount/4)*4,result=[];
  for(let sheet=0;sheet<padded/4;sheet++){
    for(const pair of [[padded-1-sheet*2,sheet*2],[sheet*2+1,padded-2-sheet*2]])result.push((rtl?pair.reverse():pair).map((index)=>index<pageCount?index:null));
  }
  return result;
}

export function placementForPage(crop,rotation,cell){
  const angle=((rotation%360)+360)%360;
  if(![0,90,180,270].includes(angle)||![crop.width,crop.height,cell.width,cell.height].every((n)=>Number.isFinite(n)&&n>0))throw new Error('Invalid page placement');
  const width=angle%180?crop.height:crop.width,height=angle%180?crop.width:crop.height;
  const scale=Math.min(cell.width/width,cell.height/height),left=cell.x+(cell.width-width*scale)/2,bottom=cell.y+(cell.height-height*scale)/2;
  let x=left,y=bottom;
  if(angle===90)y+=crop.width*scale;
  if(angle===180){x+=crop.width*scale;y+=crop.height*scale;}
  if(angle===270)x+=crop.height*scale;
  return {x,y,width:crop.width*scale,height:crop.height*scale,rotation:-angle};
}

export async function imposePDF(PDFLib,bytes,{paper='a4',landscape=false,columns=1,rows=1,margin=18,gap=10,booklet=false,rtl=false}={}){
  if(!PAPER[paper]||![columns,rows].every((n)=>Number.isInteger(n)&&n>=1&&n<=4)||!Number.isFinite(margin)||margin<0||margin>100||!Number.isFinite(gap)||gap<0||gap>100)throw new Error('Invalid page layout');
  const source=await PDFLib.PDFDocument.load(new Uint8Array(bytes).slice(),{updateMetadata:false}),output=await PDFLib.PDFDocument.create();
  if(booklet){columns=2;rows=1;landscape=true;}
  const [short,long]=PAPER[paper],size=landscape?[long,short]:[short,long];
  const cellWidth=(size[0]-margin*2-gap*(columns-1))/columns,cellHeight=(size[1]-margin*2-gap*(rows-1))/rows;
  if(cellWidth<=0||cellHeight<=0)throw new Error('Margins leave no room for pages');
  const groups=booklet?bookletOrder(source.getPageCount(),rtl):Array.from({length:Math.ceil(source.getPageCount()/(columns*rows))},(_,sheet)=>Array.from({length:columns*rows},(_,position)=>{const index=sheet*columns*rows+position;return index<source.getPageCount()?index:null;}));
  for(const group of groups){
    const sheet=output.addPage(size);
    for(let position=0;position<group.length;position++){
      const index=group[position];if(index===null)continue;
      const page=source.getPage(index),crop=page.getCropBox();
      // A blank PDF page may have no content stream at all.
      if(!page.node.Contents())continue;
      const embedded=await output.embedPage(page,{left:crop.x,bottom:crop.y,right:crop.x+crop.width,top:crop.y+crop.height});
      const row=Math.floor(position/columns),logicalColumn=position%columns,column=rtl&&!booklet?columns-1-logicalColumn:logicalColumn;
      const cell={x:margin+column*(cellWidth+gap),y:size[1]-margin-(row+1)*cellHeight-row*gap,width:cellWidth,height:cellHeight};
      const placed=placementForPage(crop,page.getRotation().angle,cell);
      sheet.drawPage(embedded,{x:placed.x,y:placed.y,width:placed.width,height:placed.height,rotate:PDFLib.degrees(placed.rotation)});
    }
  }
  output.setProducer('Waraq PDF Studio');return output.save();
}

export function differencePixels(before,after,threshold=24){
  if(before.length!==after.length||before.length%4||!Number.isFinite(threshold)||threshold<0||threshold>255)throw new Error('Invalid comparison pixels');
  const pixels=new Uint8ClampedArray(before.length);let changed=0;
  for(let i=0;i<before.length;i+=4){
    const difference=Math.max(Math.abs(before[i]-after[i]),Math.abs(before[i+1]-after[i+1]),Math.abs(before[i+2]-after[i+2]));
    if(difference>threshold){pixels[i]=197;pixels[i+1]=39;pixels[i+2]=74;changed++;}
    else{const gray=Math.round((after[i]*.299+after[i+1]*.587+after[i+2]*.114)*.38+255*.62);pixels[i]=pixels[i+1]=pixels[i+2]=gray;}
    pixels[i+3]=255;
  }
  return {pixels,changed,total:before.length/4,ratio:before.length?changed/(before.length/4):0};
}

export function grayscalePixels(pixels){
  if(pixels.length%4)throw new Error('Invalid image pixels');
  const result=new Uint8ClampedArray(pixels);
  for(let i=0;i<result.length;i+=4){const gray=Math.round(result[i]*.299+result[i+1]*.587+result[i+2]*.114);result[i]=result[i+1]=result[i+2]=gray;}
  return result;
}

const downloadPDF=(ctx,bytes,suffix)=>{ctx.download(bytes,`${ctx.filename()}-${suffix}.pdf`,'application/pdf');ctx.msg('Your PDF is ready. Source files are unchanged.','ملف PDF جاهز. لم تتغير الملفات الأصلية.');};
const paperOptions=(ctx)=>`<option value="a4">A4</option><option value="letter">${ctx.t('Letter','رسالة')}</option><option value="a3">A3</option><option value="legal">${ctx.t('Legal','قانوني')}</option>`;

async function layoutTool(id,ctx){
  const booklet=id==='booklet',resize=id==='resize';
  const titles={resize:['Resize pages','تغيير حجم الصفحات'],nup:['Multiple pages per sheet','صفحات متعددة في الورقة'],booklet:['Create a folded booklet','إنشاء كتيب مطوي']};
  const bytes=await ctx.getBytes();
  ctx.modal(ctx.t(...titles[id]),`<p>${ctx.t('Fit the visible page content onto new sheets while preserving vectors and text. Interactive fields, annotations, links and digital signatures are not carried over. Fill and flatten forms first.','ضع محتوى الصفحات المرئي داخل أوراق جديدة مع الاحتفاظ بالنص والرسومات المتجهة. لا تُنقل الحقول التفاعلية والتعليقات والروابط والتوقيعات الرقمية. عبّئ النماذج وسطحها أولاً.')}</p>${booklet?`<p>${ctx.t('Pages are reordered for folding, with blank pages added to reach a multiple of four. Print the resulting landscape PDF double-sided, at actual size, flipping on the short edge. Test one sheet on your printer first.','تُرتب الصفحات للطي وتُضاف صفحات فارغة ليصبح العدد من مضاعفات أربعة. اطبع الملف الأفقي على الوجهين بالحجم الفعلي مع التقليب على الحافة القصيرة. جرّب ورقة واحدة أولاً.')}</p>`:''}<div class="advanced-grid"><label>${ctx.t('Sheet size','حجم الورقة')}<select id="layoutPaper">${paperOptions(ctx)}</select></label>${!booklet?`<label>${ctx.t('Orientation','الاتجاه')}<select id="layoutOrientation"><option value="portrait">${ctx.t('Portrait','عمودي')}</option><option value="landscape" ${!resize?'selected':''}>${ctx.t('Landscape','أفقي')}</option></select></label>`:''}${!resize&&!booklet?`<label>${ctx.t('Pages per sheet','الصفحات في الورقة')}<select id="layoutGrid"><option value="2,1">2</option><option value="2,2">4</option><option value="3,2">6</option><option value="3,3">9</option></select></label>`:''}<label>${ctx.t('Outside margin (mm)','الهامش الخارجي (مم)')}<input id="layoutMargin" type="number" min="0" max="30" step="1" value="8"></label>${!resize?`<label>${ctx.t('Reading order','ترتيب القراءة')}<select id="layoutDirection"><option value="ltr">${ctx.t('Left to right','من اليسار إلى اليمين')}</option><option value="rtl">${ctx.t('Right to left','من اليمين إلى اليسار')}</option></select></label>`:''}</div><p class="advanced-error" id="layoutError" role="alert"></p><button class="primary" id="layoutExport">${ctx.t('Download PDF','تنزيل PDF')}</button>`);
  if($('#layoutDirection'))$('#layoutDirection').value=ctx.t('ltr','rtl');
  $('#layoutExport').onclick=()=>{
    const margin=Number($('#layoutMargin').value);if(!Number.isFinite(margin)||margin<0||margin>30){$('#layoutError').textContent=ctx.t('Use a margin from 0 to 30 mm.','استخدم هامشاً من ٠ إلى ٣٠ مم.');return;}
    const [columns,rows]=resize?[1,1]:booklet?[2,1]:$('#layoutGrid').value.split(',').map(Number);
    const options={paper:$('#layoutPaper').value,landscape:booklet||$('#layoutOrientation')?.value==='landscape',columns,rows,margin:margin*72/25.4,gap:12,booklet,rtl:$('#layoutDirection')?.value==='rtl'};
    $('#dialog').close();ctx.task(async()=>downloadPDF(ctx,await imposePDF(ctx.PDFLib,bytes,options),id));
  };
}

async function grayscaleTool(ctx){
  const bytes=await ctx.getBytes();
  ctx.modal(ctx.t('Convert to grayscale','التحويل إلى الرمادي'),`<p>${ctx.t('Create a grayscale, image-only copy. Text search, links, interactive forms, annotations as separate objects, and digital signatures are lost. Visible annotations are included in the page image.','أنشئ نسخة رمادية من الصور فقط. يفقد الناتج البحث النصي والروابط والنماذج التفاعلية والتعليقات ككائنات منفصلة والتوقيعات الرقمية. تُضمّن التعليقات المرئية في صورة الصفحة.')}</p><label>${ctx.t('Resolution','الدقة')}<select id="grayScale"><option value="1.5">${ctx.t('Standard','قياسية')}</option><option value="2.5">${ctx.t('Detailed','دقيقة')}</option></select></label><button id="grayExport" class="primary">${ctx.t('Download grayscale PDF','تنزيل PDF رمادي')}</button>`);
  $('#grayExport').onclick=()=>{const preferred=Number($('#grayScale').value);$('#dialog').close();ctx.task(async()=>{
    const viewer=await ctx.pdfjsLib.getDocument({data:new Uint8Array(bytes).slice(),isEvalSupported:false}).promise,doc=await ctx.PDFLib.PDFDocument.create();
    try{
      for(let number=1;number<=viewer.numPages;number++){
        ctx.msg(`Converting page ${number} / ${viewer.numPages}…`,`جارٍ تحويل الصفحة ${number} / ${viewer.numPages}…`);
        const page=await viewer.getPage(number),natural=page.getViewport({scale:1}),scale=Math.min(preferred,Math.sqrt(8000000/(natural.width*natural.height)),4000/Math.max(natural.width,natural.height)),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const pen=canvas.getContext('2d');
        await page.render({canvasContext:pen,viewport,background:'rgb(255,255,255)'}).promise;
        const data=pen.getImageData(0,0,canvas.width,canvas.height);data.data.set(grayscalePixels(data.data));pen.putImageData(data,0,0);
        const image=await doc.embedPng(canvas.toDataURL('image/png')),output=doc.addPage([natural.width,natural.height]);output.drawImage(image,{x:0,y:0,width:natural.width,height:natural.height});canvas.width=0;canvas.height=0;page.cleanup();
      }
      downloadPDF(ctx,await doc.save(),'grayscale');
    }finally{await viewer.destroy();}
  });};
}

async function compareTool(ctx){
  const sources=ctx.getSources?.()||[];
  if(!sources.length){ctx.msg('Open at least one PDF to compare.','افتح ملف PDF واحداً على الأقل للمقارنة.',true);return;}
  const sourceOptions=sources.map((source,index)=>`<option value="${index}">${escape(source.name)}</option>`).join('');
  ctx.modal(ctx.t('Compare PDF pages','مقارنة صفحات PDF'),`<div class="advanced-editor"><p>${ctx.t('Compare the visible pixels of two original documents at the same physical scale. This is a visual check, not a semantic or text comparison; scanning shifts and font rendering can create differences. Use the page numbers to align documents after inserted pages.','قارن البكسلات المرئية في مستندين أصليين بالمقياس نفسه. هذه مقارنة مرئية وليست مقارنة دلالية أو نصية؛ قد يسبب انزياح المسح أو عرض الخطوط اختلافات. استخدم أرقام الصفحات لمحاذاة المستندين بعد إدراج صفحات.')}</p><div class="advanced-grid"><label>${ctx.t('Before document','المستند السابق')}<select id="compareBefore">${sourceOptions}</select></label><label>${ctx.t('After document','المستند اللاحق')}<select id="compareAfter">${sourceOptions}<option value="file">${ctx.t('Choose another PDF below','اختر ملف PDF آخر أدناه')}</option></select></label><label>${ctx.t('Other PDF (optional)','ملف PDF آخر (اختياري)')}<input id="compareFile" type="file" accept="application/pdf"></label><label>${ctx.t('Sensitivity','الحساسية')}<select id="compareThreshold"><option value="12">${ctx.t('High','عالية')}</option><option value="30" selected>${ctx.t('Balanced','متوازنة')}</option><option value="60">${ctx.t('Low','منخفضة')}</option></select></label><label>${ctx.t('Before page','الصفحة السابقة')}<input id="comparePageBefore" type="number" min="1" value="1"></label><label>${ctx.t('After page','الصفحة اللاحقة')}<input id="comparePageAfter" type="number" min="1" value="1"></label></div><button id="compareRun" class="primary">${ctx.t('Compare pages','مقارنة الصفحات')}</button><p id="compareStatus" aria-live="polite"></p><p id="compareError" class="advanced-error" role="alert"></p><div class="advanced-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${[['Before','السابق'],['After','اللاحق'],['Difference','الاختلاف']].map(([en,ar])=>`<div><h3>${ctx.t(en,ar)}</h3><canvas id="compare${en}Canvas" style="width:100%;height:auto;border:1px solid var(--line)" aria-label="${ctx.t(en,ar)}"></canvas></div>`).join('')}</div><button id="compareDownload" disabled>${ctx.t('Download difference image','تنزيل صورة الاختلاف')}</button><p>${ctx.t('Red pixels differ beyond the chosen threshold. A blank area pads the smaller page. The percentage refers to this rendered preview, not document meaning or total content.','تختلف البكسلات الحمراء بأكثر من الحد المختار. تُملأ المساحة حول الصفحة الأصغر باللون الأبيض. تخص النسبة هذه المعاينة المرئية وليس معنى المستند أو كل محتواه.')}</p></div>`);
  $('#compareAfter').value=sources.length>1?'1':'file';
  let file=null,running=false,closed=false,viewers=[],renders=[];
  const dialog=$('#dialog');dialog.addEventListener('close',()=>{closed=true;renders.forEach((task)=>task.cancel());viewers.forEach((viewer)=>viewer.destroy().catch(()=>{}));},{once:true});
  $('#compareFile').onchange=(event)=>{file=event.target.files[0]||null;if(file)$('#compareAfter').value='file';};
  $('#compareDownload').onclick=()=>$('#compareDifferenceCanvas').toBlob((blob)=>{if(blob)ctx.download(blob,`${ctx.filename()}-difference.png`,'image/png');},'image/png');
  $('#compareRun').onclick=async()=>{
    if(running)return;running=true;$('#compareRun').disabled=true;$('#compareDownload').disabled=true;$('#compareError').textContent='';$('#compareStatus').textContent=ctx.t('Rendering and comparing…','جارٍ العرض والمقارنة…');
    try{
      const numberA=Number($('#comparePageBefore').value),numberB=Number($('#comparePageAfter').value),threshold=Number($('#compareThreshold').value);
      if(![numberA,numberB].every((n)=>Number.isInteger(n)&&n>0))throw new Error(ctx.t('Choose positive whole page numbers.','اختر أرقام صفحات صحيحة موجبة.'));
      const choiceB=$('#compareAfter').value;
      if(choiceB==='file'&&(!file||file.size>50*1024*1024))throw new Error(ctx.t('Choose a second PDF smaller than 50 MB.','اختر ملف PDF ثانياً أصغر من ٥٠ ميجابايت.'));
      const bytesA=await sources[Number($('#compareBefore').value)].getBytes(),bytesB=choiceB==='file'?new Uint8Array(await file.arrayBuffer()):await sources[Number(choiceB)].getBytes();
      for(const bytes of [bytesA,bytesB])viewers.push(await ctx.pdfjsLib.getDocument({data:new Uint8Array(bytes).slice(),isEvalSupported:false}).promise);
      if(numberA>viewers[0].numPages||numberB>viewers[1].numPages)throw new Error(ctx.t(`Page numbers must be within ${viewers[0].numPages} and ${viewers[1].numPages} pages.`,`يجب أن تكون أرقام الصفحات ضمن ${viewers[0].numPages} و${viewers[1].numPages} صفحة.`));
      const pages=await Promise.all([viewers[0].getPage(numberA),viewers[1].getPage(numberB)]),natural=pages.map((page)=>page.getViewport({scale:1}));
      const width=Math.max(...natural.map((page)=>page.width)),height=Math.max(...natural.map((page)=>page.height)),scale=Math.min(1.5,1200/Math.max(width,height));
      const canvases=[$('#compareBeforeCanvas'),$('#compareAfterCanvas')];
      for(let i=0;i<2;i++){
        if(closed)return;
        const canvas=canvases[i],pen=canvas.getContext('2d');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);pen.fillStyle='#fff';pen.fillRect(0,0,canvas.width,canvas.height);
        const viewport=pages[i].getViewport({scale}),task=pages[i].render({canvasContext:pen,viewport,background:'rgb(255,255,255)'});renders.push(task);await task.promise;
      }
      if(closed)return;
      const data=canvases.map((canvas)=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));
      const result=differencePixels(data[0].data,data[1].data,threshold),output=$('#compareDifferenceCanvas');output.width=canvases[0].width;output.height=canvases[0].height;const pen=output.getContext('2d'),image=pen.createImageData(output.width,output.height);image.data.set(result.pixels);pen.putImageData(image,0,0);
      $('#compareStatus').textContent=ctx.t(`${(result.ratio*100).toFixed(2)}% of preview pixels differ. Before: ${numberA} / ${viewers[0].numPages}; after: ${numberB} / ${viewers[1].numPages}.`,`${(result.ratio*100).toFixed(2)}٪ من بكسلات المعاينة مختلفة. السابق: ${numberA} / ${viewers[0].numPages}؛ اللاحق: ${numberB} / ${viewers[1].numPages}.`);$('#compareDownload').disabled=false;
    }catch(error){if(!closed){$('#compareError').textContent=error.message||ctx.t('Could not compare these documents.','تعذرت مقارنة المستندين.');$('#compareStatus').textContent='';}}
    finally{for(const viewer of viewers)await viewer.destroy().catch(()=>{});viewers=[];renders=[];running=false;if(!closed)$('#compareRun').disabled=false;}
  };
}

/** IDs: resize, nup, booklet, compare, grayscale. */
export async function runMore(id,ctx){
  if(['resize','nup','booklet'].includes(id))return layoutTool(id,ctx);
  if(id==='compare')return compareTool(ctx);
  if(id==='grayscale')return grayscaleTool(ctx);
  return false;
}
