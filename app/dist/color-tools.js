/* Colors & gradient: adds a native PDF gradient (an axial or radial shading) to pages with a blend mode.
   Pages are not rasterized: text stays searchable and selectable, and vectors, links and forms are kept. */
const $=(selector)=>document.querySelector(selector);

export const GRADIENT_PRESETS=[
  ['waraq',['#0f766e','#a7f3d0'],'Waraq','ورق'],
  ['sunset',['#f97316','#ec4899','#8b5cf6'],'Sunset','غروب'],
  ['ocean',['#0ea5e9','#1e3a8a'],'Ocean','محيط'],
  ['gold',['#fde68a','#b45309'],'Desert gold','ذهب الصحراء'],
  ['rose',['#fecdd3','#be123c'],'Rose','وردي'],
  ['night',['#312e81','#0f172a'],'Night','ليل']
];
// Effect id -> [PDF blend mode, CSS mix-blend-mode for the preview].
export const BLENDS={tint:['Multiply','multiply'],recolor:['Color','color'],wash:['Normal','normal'],lighten:['Screen','screen'],contrast:['Overlay','overlay'],soft:['SoftLight','soft-light']};

export function hexToRgb(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(String(hex).trim());if(!m)throw new Error('Invalid color');
  const n=parseInt(m[1],16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];
}

/** "all", "" or ranges such as "1-3, 5, 8-" -> sorted zero-based page indexes. */
export function parsePages(text,count){
  if(!Number.isSafeInteger(count)||count<1)throw new Error('Invalid page count');
  const value=String(text??'').trim().toLowerCase().replace(/[٠-٩]/g,(c)=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,(c)=>String(c.charCodeAt(0)-1776)).replace(/،/g,',');
  if(!value||value==='all'||value==='الكل')return Array.from({length:count},(_,i)=>i);
  const set=new Set();
  for(const part of value.split(',').map((s)=>s.trim())){
    const m=/^(?:(\d+)(?:\s*-\s*(\d*))?|-\s*(\d+))$/.exec(part);if(!m)throw new Error('Invalid page range');
    const start=m[3]!==undefined?1:Number(m[1]),end=m[3]!==undefined?Number(m[3]):m[2]!==undefined?Number(m[2]||count):start;
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<1||end>count||start>end)throw new Error('Page range is outside the document');
    for(let p=start;p<=end;p++)set.add(p-1);
  }
  return [...set].sort((a,b)=>a-b);
}

/** Gradient geometry in visual page space (x right, y up, origin bottom-left), matching CSS gradients. */
export function gradientGeometry({width,height},{style='linear',angle=180,area='full',band=20}={}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Invalid page dimensions');
  if(!['linear','radial'].includes(style)||!['full','top','bottom'].includes(area))throw new Error('Invalid gradient geometry');
  if(!Number.isFinite(Number(angle))||!Number.isFinite(Number(band))||Number(band)<1||Number(band)>100)throw new Error('Invalid gradient angle or band');
  const b=Number(band)/100;
  const rect=area==='top'?{x:0,y:height*(1-b),w:width,h:height*b}:area==='bottom'?{x:0,y:0,w:width,h:height*b}:{x:0,y:0,w:width,h:height};
  const cx=rect.x+rect.w/2,cy=rect.y+rect.h/2;
  if(style==='radial')return {rect,radial:true,center:[cx,cy],radius:Math.hypot(rect.w,rect.h)/2};
  // CSS angle: 0deg points up, clockwise. The line length makes the corners land exactly on 0% and 100%.
  const a=(Number(angle)%360)*Math.PI/180,dx=Math.sin(a),dy=Math.cos(a),half=(Math.abs(rect.w*dx)+Math.abs(rect.h*dy))/2;
  return {rect,radial:false,start:[cx-dx*half,cy-dy*half],end:[cx+dx*half,cy+dy*half]};
}

// Maps visual page coordinates to PDF user space, honouring the CropBox offset and the /Rotate entry.
function visualToUser(box,rotation,visual,[x,y]){
  const u=x/visual.width,v=y/visual.height;
  const [s,t]=rotation===90?[1-v,u]:rotation===180?[1-u,1-v]:rotation===270?[v,1-u]:[u,v];
  return [box.x+s*box.width,box.y+t*box.height];
}

function colorFunction(context,colors){
  const rgb=colors.map(hexToRgb),piece=(c0,c1)=>({FunctionType:2,Domain:[0,1],C0:c0,C1:c1,N:1});
  if(rgb.length===2)return context.obj(piece(rgb[0],rgb[1]));
  const parts=rgb.slice(1).map((c,i)=>piece(rgb[i],c)),bounds=parts.slice(1).map((_,i)=>(i+1)/parts.length);
  return context.obj({FunctionType:3,Domain:[0,1],Functions:parts,Bounds:bounds,Encode:parts.flatMap(()=>[0,1])});
}

const num=(n)=>(Math.round(n*1000)/1000).toString();

export async function applyColorEffect(PDFLib,bytes,options={}){
  const {PDFDocument,PDFName,PDFDict,PDFArray}=PDFLib;
  if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('Invalid color options');
  const colors=options.colors??['#0f766e','#a7f3d0'];if(!Array.isArray(colors)||colors.length<2||colors.length>3)throw new Error('Choose two or three colors');
  colors.forEach(hexToRgb);
  const effect=options.effect??'tint';if(!Object.hasOwn(BLENDS,effect))throw new Error('Unknown effect');const blend=BLENDS[effect];
  const opacity=Number(options.opacity??0.6);if(!Number.isFinite(opacity)||opacity<0||opacity>1||options.opacity==='')throw new Error('Opacity must be between zero and one');
  if(options.placement!==undefined&&!['top','behind'].includes(options.placement))throw new Error('Invalid gradient placement');
  const behind=options.placement==='behind'&&effect==='wash';
  const doc=await PDFDocument.load(new Uint8Array(bytes).slice(),{updateMetadata:false}),context=doc.context;
  const indexes=parsePages(options.pages,doc.getPageCount());
  const gs=context.register(context.obj({Type:'ExtGState',ca:opacity,CA:opacity,BM:blend[0]}));
  const fn=context.register(colorFunction(context,colors));
  const sub=(res,key)=>{const existing=res.lookup(PDFName.of(key)),d=existing instanceof PDFDict?existing.clone(context):context.obj({});res.set(PDFName.of(key),d);return d;};
  const uniqueName=(dict,prefix)=>{let suffix=0,name;do{name=PDFName.of(prefix+suffix++);}while(dict.has(name));return name;};
  for(const index of indexes){
    const page=doc.getPage(index),leaf=page.node,crop=page.getCropBox(),media=page.getMediaBox(),rotation=((page.getRotation().angle%360)+360)%360;
    if(![0,90,180,270].includes(rotation))throw new Error('Unsupported page rotation');
    // Readers display the intersection of CropBox and MediaBox. If they do not
    // intersect, fall back to MediaBox, as PDF.js does for malformed CropBoxes.
    const left=Math.max(crop.x,media.x),bottom=Math.max(crop.y,media.y),right=Math.min(crop.x+crop.width,media.x+media.width),top=Math.min(crop.y+crop.height,media.y+media.height);
    const box=right>left&&top>bottom?{x:left,y:bottom,width:right-left,height:top-bottom}:media;
    const visual=rotation%180?{width:box.height,height:box.width}:{width:box.width,height:box.height};
    const g=gradientGeometry(visual,options),map=(p)=>visualToUser(box,rotation,visual,p);
    const c1=map([g.rect.x,g.rect.y]),c2=map([g.rect.x+g.rect.w,g.rect.y+g.rect.h]);
    const shading=g.radial
      ?{ShadingType:3,ColorSpace:'DeviceRGB',Coords:[...map(g.center),0,...map(g.center),g.radius],Function:fn,Extend:[true,true]}
      :{ShadingType:2,ColorSpace:'DeviceRGB',Coords:[...map(g.start),...map(g.end)],Function:fn,Extend:[true,true]};
    // Page resources (and their subdictionaries) can be inherited or shared.
    // Clone the touched dictionaries before writing, so another page's gradient
    // cannot overwrite this one and unselected pages remain untouched.
    const inherited=leaf.getInheritableAttribute(PDFName.of('Resources'));
    const originalResources=inherited?context.lookup(inherited):context.obj({});
    if(!(originalResources instanceof PDFDict))throw new Error('Invalid page resources');
    const Resources=originalResources.clone(context);leaf.set(PDFName.of('Resources'),Resources);
    const states=sub(Resources,'ExtGState'),shadings=sub(Resources,'Shading'),stateName=uniqueName(states,'WaraqGs'),shadingName=uniqueName(shadings,'WaraqSh');
    states.set(stateName,gs);
    shadings.set(shadingName,context.register(context.obj(shading)));
    const x=Math.min(c1[0],c2[0]),y=Math.min(c1[1],c2[1]),w=Math.abs(c2[0]-c1[0]),h=Math.abs(c2[1]-c1[1]);
    const ops=`q ${stateName.toString()} gs ${num(x)} ${num(y)} ${num(w)} ${num(h)} re W n ${shadingName.toString()} sh Q\n`;
    const own=context.register(context.stream(ops));
    const contents=leaf.get(PDFName.of('Contents')),existing=contents?context.lookup(contents):undefined;
    // Contents arrays can also be indirect objects shared by several pages.
    const list=context.obj(existing instanceof PDFArray?existing.asArray():contents?[contents]:[]);leaf.set(PDFName.of('Contents'),list);
    if(behind)list.insert(0,own);
    else{
      // Wrap the existing content in q/Q so a transform it leaves behind cannot move the gradient.
      if(list.size()){list.insert(0,context.register(context.stream('q\n')));list.push(context.register(context.stream('Q\n')));}
      list.push(own);
    }
  }
  return doc.save();
}

// Visible page box (CropBox within MediaBox) and its rotation, shared by the background modes.
function visibleBox(page){
  const crop=page.getCropBox(),media=page.getMediaBox(),rotation=((page.getRotation().angle%360)+360)%360;
  if(![0,90,180,270].includes(rotation))throw new Error('Unsupported page rotation');
  const left=Math.max(crop.x,media.x),bottom=Math.max(crop.y,media.y),right=Math.min(crop.x+crop.width,media.x+media.width),top=Math.min(crop.y+crop.height,media.y+media.height);
  const box=right>left&&top>bottom?{x:left,y:bottom,width:right-left,height:top-bottom}:media;
  return {box,rotation,visual:rotation%180?{width:box.height,height:box.width}:{width:box.width,height:box.height}};
}

/** Dark reading: inverts the page (white paper -> black, black text -> white) and warms it with a tone.
    Stays vector; photos are inverted too, so this is meant for reading copies. */
export async function applyDarkReading(PDFLib,bytes,{tone='#e8e2d4',pages}={}){
  const {PDFDocument,BlendMode,rgb}=PDFLib,[r,g,b]=hexToRgb(tone);
  const doc=await PDFDocument.load(new Uint8Array(bytes).slice(),{updateMetadata:false});
  for(const index of parsePages(pages,doc.getPageCount())){
    const page=doc.getPage(index),{box}=visibleBox(page),area={x:box.x,y:box.y,width:box.width,height:box.height};
    page.drawRectangle({...area,color:rgb(1,1,1),blendMode:BlendMode.Difference});
    page.drawRectangle({...area,color:rgb(r,g,b),blendMode:BlendMode.Multiply});
  }
  return doc.save();
}

/** Letterhead: places an image on every chosen page. Multiply makes its white areas transparent, so a letterhead
    with a white background sits "behind" the text without hiding it. fit: cover | width-top | width-bottom. */
export async function applyLetterhead(PDFLib,bytes,{image,imageType,fit='cover',opacity=1,pages,blend='multiply'}={}){
  const {PDFDocument,BlendMode,degrees}=PDFLib;
  if(!(image instanceof Uint8Array)||!image.length)throw new Error('Choose an image');
  if(!['cover','width-top','width-bottom'].includes(fit))throw new Error('Invalid fit');
  const doc=await PDFDocument.load(new Uint8Array(bytes).slice(),{updateMetadata:false});
  const img=imageType==='png'?await doc.embedPng(image):await doc.embedJpg(image);
  for(const index of parsePages(pages,doc.getPageCount())){
    const page=doc.getPage(index),{box,rotation,visual}=visibleBox(page);
    let w=visual.width,h=visual.height,x=0,y=0;
    if(fit!=='cover'){h=visual.width*img.height/img.width;w=visual.width;y=fit==='width-top'?visual.height-h:0;}
    const [ux,uy]=visualToUser(box,rotation,visual,[x,y]);
    page.drawImage(img,{x:ux,y:uy,width:w,height:h,rotate:degrees(rotation),opacity:Math.min(Math.max(Number(opacity)||1,0.05),1),blendMode:blend==='normal'?BlendMode.Normal:BlendMode.Multiply});
  }
  return doc.save();
}

export function cssGradient(colors,{style='linear',angle=180}={}){
  return style==='radial'?`radial-gradient(circle farthest-corner at center, ${colors.join(', ')})`:`linear-gradient(${Number(angle)||0}deg, ${colors.join(', ')})`;
}

export async function runColor(ctx){
  const {t}=ctx,bytes=await ctx.getBytes();
  const presetButtons=GRADIENT_PRESETS.map(([id,c,en,ar])=>`<button type="button" class="gradient-preset" data-preset="${id}" title="${t(en,ar)}" aria-label="${t(en,ar)}" style="background:${cssGradient(c,{angle:135})}"></button>`).join('');
  ctx.modal(t('Colors & gradient','الألوان والتدرج'),`
  <p>${t('Color your pages, add a letterhead, or make a dark reading copy. Text stays searchable and selectable, and vector graphics, links and forms are kept.','لوّن صفحاتك أو أضف ورقاً رسمياً أو أنشئ نسخة للقراءة الليلية. يبقى النص قابلاً للبحث والتحديد، وتُحفظ الرسومات المتجهة والروابط والنماذج.')}</p>
  <div class="gradient-modes" role="tablist">${[['gradient','Gradient','تدرج'],['solid','Solid color','لون واحد'],['letterhead','Letterhead','ورق رسمي'],['dark','Dark reading','قراءة ليلية']].map(([m,en,ar],i)=>`<button type="button" role="tab" data-gmode="${m}" aria-selected="${i===0}">${t(en,ar)}</button>`).join('')}</div>
  <div class="gradient-layout">
   <div class="gradient-preview" id="gradPreview"><canvas id="gradCanvas" aria-hidden="true"></canvas><div id="gradOverlay"></div><div id="gradOverlay2"></div></div>
   <div>
    <div class="gradient-presets" data-m="gradient" role="group" aria-label="${t('Presets','قوالب جاهزة')}">${presetButtons}</div>
    <div class="advanced-grid">
     <label data-m="letterhead">${t('Letterhead image (PNG or JPG)','صورة الورق الرسمي (PNG أو JPG)')}<input id="gradImage" type="file" accept="image/png,image/jpeg"></label>
     <label data-m="letterhead">${t('Fit','الملاءمة')}<select id="gradFit"><option value="cover">${t('Whole page','الصفحة كاملة')}</option><option value="width-top">${t('Full width, top','بعرض الصفحة، في الأعلى')}</option><option value="width-bottom">${t('Full width, bottom','بعرض الصفحة، في الأسفل')}</option></select></label>
     <label data-m="dark">${t('Paper tone','لون الورق')}<input id="gradTone" type="color" value="#e8e2d4"></label>
     <label data-m="gradient solid"><span id="gradC1Label">${t('Start color','لون البداية')}</span><input id="gradC1" type="color" value="#0f766e"></label>
     <label data-m="gradient">${t('End color','لون النهاية')}<input id="gradC3" type="color" value="#a7f3d0"></label>
     <label data-m="gradient"><span><input id="gradMidOn" type="checkbox"> ${t('Middle color','لون أوسط')}</span><input id="gradC2" type="color" value="#facc15" disabled></label>
     <label data-m="gradient">${t('Style','النمط')}<select id="gradStyle"><option value="linear">${t('Linear','خطي')}</option><option value="radial">${t('Radial','دائري')}</option></select></label>
     <label data-m="gradient">${t('Angle','الزاوية')} <output id="gradAngleOut">180°</output><input id="gradAngle" type="range" min="0" max="345" step="15" value="180"></label>
     <label data-m="gradient solid">${t('Effect','التأثير')}<select id="gradEffect">
      <option value="tint">${t('Background tint (text stays dark)','تلوين الخلفية (يبقى النص داكناً)')}</option>
      <option value="recolor">${t('Recolor content (duotone)','إعادة تلوين المحتوى (لونان)')}</option>
      <option value="wash">${t('Color wash','طبقة لونية')}</option>
      <option value="lighten">${t('Lighten','تفتيح')}</option>
      <option value="contrast">${t('Vivid contrast','تباين حيوي')}</option>
      <option value="soft">${t('Soft light','ضوء ناعم')}</option></select></label>
     <label data-m="gradient solid letterhead">${t('Strength','القوة')} <output id="gradOpacityOut">60%</output><input id="gradOpacity" type="range" min="5" max="100" step="5" value="60"></label>
     <label data-m="gradient solid">${t('Area','المنطقة')}<select id="gradArea"><option value="full">${t('Whole page','الصفحة كاملة')}</option><option value="top">${t('Top band (header)','شريط علوي (ترويسة)')}</option><option value="bottom">${t('Bottom band (footer)','شريط سفلي (تذييل)')}</option></select></label>
     <label id="gradBandLabel" data-m="gradient solid" hidden>${t('Band height','ارتفاع الشريط')} <output id="gradBandOut">20%</output><input id="gradBand" type="range" min="5" max="50" step="5" value="20"></label>
     <label id="gradPlacementLabel" data-m="gradient solid" hidden>${t('Placement','الموضع')}<select id="gradPlacement"><option value="top">${t('Over the content','فوق المحتوى')}</option><option value="behind">${t('Behind the content','خلف المحتوى')}</option></select></label>
     <label>${t('Pages','الصفحات')}<input id="gradPages" value="all" dir="ltr" placeholder="all, 1-3, 5"></label>
    </div>
   </div>
  </div>
  <p id="gradHint" class="gradient-hint"></p><p id="gradError" role="alert"></p>
  <button id="gradExport" class="primary">${t('Apply','تطبيق')}</button>`);
  let gmode='gradient',image=null,imageType='',imageUrl='';
  document.querySelectorAll('[data-gmode]').forEach((b)=>b.onclick=()=>{gmode=b.dataset.gmode;document.querySelectorAll('[data-gmode]').forEach((x)=>x.setAttribute('aria-selected',String(x===b)));update();});
  $('#gradImage').onchange=async(e)=>{const f=e.target.files[0];if(!f)return;image=new Uint8Array(await f.arrayBuffer());imageType=/png/i.test(f.type+f.name)?'png':'jpg';if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=URL.createObjectURL(f);update();};
  ensureStyles();
  const read=()=>({
    mode:gmode,tone:$('#gradTone').value,fit:$('#gradFit').value,
    colors:gmode==='solid'?[$('#gradC1').value,$('#gradC1').value]:[$('#gradC1').value,...($('#gradMidOn').checked?[$('#gradC2').value]:[]),$('#gradC3').value],
    style:$('#gradStyle').value,angle:Number($('#gradAngle').value),effect:$('#gradEffect').value,opacity:Number($('#gradOpacity').value)/100,
    area:$('#gradArea').value,band:Number($('#gradBand').value),placement:$('#gradPlacement').value,pages:$('#gradPages').value
  });
  const hints={tint:['Best for coloring the paper: white areas take the gradient, dark text stays readable.','الأفضل لتلوين الورقة: تأخذ المساحات البيضاء التدرج ويبقى النص الداكن مقروءاً.'],recolor:['Gives text, lines and photos the gradient colors. White stays white.','يمنح النص والخطوط والصور ألوان التدرج. يبقى الأبيض أبيض.'],wash:['A plain see-through layer. "Behind the content" can be hidden by pages that have their own white background.','طبقة شفافة عادية. قد يُخفى خيار "خلف المحتوى" في الصفحات ذات الخلفية البيضاء الخاصة.'],lighten:['Brightens dark areas toward the gradient colors.','يفتّح المناطق الداكنة نحو ألوان التدرج.'],contrast:['Adds strong, saturated color and contrast.','يضيف لوناً مشبعاً وتبايناً قوياً.'],soft:['A gentle tone that keeps the page natural.','لون هادئ يحافظ على طبيعة الصفحة.']};
  const update=()=>{
    const o=read(),overlay=$('#gradOverlay'),overlay2=$('#gradOverlay2');
    document.querySelectorAll('#dialog [data-m]').forEach((el)=>{const show=el.dataset.m.split(' ').includes(o.mode);if(!show)el.hidden=true;else if(!['gradBandLabel','gradPlacementLabel'].includes(el.id))el.hidden=false;});
    $('#gradC1Label').textContent=o.mode==='solid'?t('Color','اللون'):t('Start color','لون البداية');
    overlay2.style.cssText='';
    $('#gradC2').disabled=!$('#gradMidOn').checked;
    $('#gradAngle').disabled=o.style==='radial';$('#gradAngleOut').textContent=o.angle+'°';
    $('#gradOpacityOut').textContent=Math.round(o.opacity*100)+'%';$('#gradBandOut').textContent=o.band+'%';
    const shaped=o.mode==='gradient'||o.mode==='solid';
    $('#gradBandLabel').hidden=!shaped||o.area==='full';$('#gradPlacementLabel').hidden=!shaped||o.effect!=='wash';
    $('#gradHint').textContent=o.mode==='letterhead'?t('Use a letterhead with a white background: white areas become see-through, so your text stays visible.','استخدم ورقاً رسمياً بخلفية بيضاء: تصبح المساحات البيضاء شفافة فيبقى نصك ظاهراً.'):o.mode==='dark'?t('For comfortable reading at night. Photos are inverted too, so keep your original for printing.','للقراءة المريحة ليلاً. تنعكس الصور أيضاً، فاحتفظ بالأصل للطباعة.'):t(...hints[o.effect]);
    if(o.mode==='letterhead'){overlay.style.cssText=`position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;opacity:${o.opacity};background:${imageUrl?`url(${imageUrl}) no-repeat`:'none'};background-size:${o.fit==='cover'?'100% 100%':'100% auto'};background-position:${o.fit==='width-bottom'?'bottom':'top'}`;return;}
    if(o.mode==='dark'){overlay.style.cssText='position:absolute;inset:0;pointer-events:none;background:#fff;mix-blend-mode:difference';overlay2.style.cssText=`position:absolute;inset:0;pointer-events:none;background:${o.tone};mix-blend-mode:multiply`;return;}
    overlay.style.cssText='';
    overlay.style.background=cssGradient(o.colors,o);overlay.style.opacity=o.opacity;
    overlay.style.mixBlendMode=o.effect==='wash'&&o.placement==='behind'?'multiply':BLENDS[o.effect][1];
    overlay.style.top=o.area==='bottom'?(100-o.band)+'%':'0';overlay.style.height=o.area==='full'?'100%':o.band+'%';
  };
  document.querySelectorAll('#dialog input,#dialog select').forEach((e)=>e.addEventListener('input',update));
  document.querySelectorAll('.gradient-preset').forEach((b)=>b.onclick=()=>{
    const c=GRADIENT_PRESETS.find((p)=>p[0]===b.dataset.preset)[1];
    $('#gradC1').value=c[0];$('#gradC3').value=c[c.length-1];$('#gradMidOn').checked=c.length>2;if(c.length>2)$('#gradC2').value=c[1];update();
  });
  update();
  renderPreview(ctx,bytes).catch(()=>{});
  $('#gradExport').onclick=()=>{
    const o=read();
    if(o.mode==='letterhead'&&!image){$('#gradError').textContent=t('Choose a letterhead image first.','اختر صورة الورق الرسمي أولاً.');return;}
    if(!/^\s*(all|(\d+\s*(-\s*\d*)?|-\s*\d+)(\s*,\s*(\d+\s*(-\s*\d*)?|-\s*\d+))*)?\s*$/i.test(o.pages)){$('#gradError').textContent=t('Use page numbers such as 1-3, 5 or "all".','استخدم أرقام صفحات مثل 1-3، 5 أو "all".');return;}
    $('#dialog').close();
    ctx.task(async()=>{
      let out;
      try{out=o.mode==='dark'?await applyDarkReading(ctx.PDFLib,bytes,o):o.mode==='letterhead'?await applyLetterhead(ctx.PDFLib,bytes,{...o,image,imageType}):await applyColorEffect(ctx.PDFLib,bytes,o);}
      catch(e){if(/range|outside/i.test(e.message)){ctx.msg('Those pages are not in this document.','هذه الصفحات غير موجودة في المستند.',true);return;}throw e;}
      ctx.download(out,`${ctx.filename()}-colors.pdf`,'application/pdf');
      ctx.msg('Your PDF is ready. Source files are unchanged.','ملف PDF جاهز. لم تتغير الملفات الأصلية.');
    });
  };
}

async function renderPreview(ctx,bytes){
  const viewer=await ctx.pdfjsLib.getDocument({data:new Uint8Array(bytes).slice(),isEvalSupported:false}).promise;
  try{
    const page=await viewer.getPage(1),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,440/base.width)}),canvas=$('#gradCanvas');
    if(!canvas)return;canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
  }finally{viewer.destroy();}
}

function ensureStyles(){
  if(document.getElementById('gradient-tool-style'))return;
  const style=document.createElement('style');style.id='gradient-tool-style';
  style.textContent=`.gradient-layout{display:grid;grid-template-columns:minmax(140px,220px) minmax(0,1fr);gap:20px;align-items:start}
.gradient-preview{position:relative;isolation:isolate;background:#fff;border:1px solid var(--line,#d6d9d2);border-radius:8px;overflow:hidden;line-height:0}
.gradient-preview canvas{width:100%;height:auto;display:block;min-height:120px}
.gradient-preview #gradOverlay{position:absolute;left:0;right:0;pointer-events:none}
.gradient-modes{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}
.gradient-modes button{width:auto;margin:0;padding:7px 14px;border-radius:999px;font-size:13px}
.gradient-modes button[aria-selected="true"]{background:var(--teal,#15775d);color:#fff;border-color:var(--teal,#15775d)}
.gradient-presets{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.gradient-preset{width:36px;height:36px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px var(--line,#c9ccc4);cursor:pointer;padding:0}
.gradient-preset:focus-visible{outline:3px solid var(--accent,#0f766e);outline-offset:2px}
.gradient-hint{color:var(--muted,#5b6159);margin:14px 0 4px}
.gradient-layout label output{font-variant-numeric:tabular-nums;opacity:.75}
@media (max-width:640px){.gradient-layout{grid-template-columns:1fr}.gradient-preview{max-width:220px}}`;
  document.head.append(style);
}
