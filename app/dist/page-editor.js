/* Page editor: move, resize or delete the photos already on a page; edit existing text; add text, images and
   white-out boxes. Existing photos are moved losslessly by rewriting where the page draws them (no re-encoding).
   Replaced text is removed for real by the MuPDF engine when it is available; otherwise it is covered with the
   page's own background colour and the user is told that the old text can still be found by search or copy. */
import {engineAvailable,processWithEngine} from './integrations.js';
const $=(s,root=document)=>root.querySelector(s);

// ---------- matrices: [a,b,c,d,e,f], points as row vectors (PDF convention) ----------
export const mul=(A,B)=>[A[0]*B[0]+A[1]*B[2],A[0]*B[1]+A[1]*B[3],A[2]*B[0]+A[3]*B[2],A[2]*B[1]+A[3]*B[3],A[4]*B[0]+A[5]*B[2]+B[4],A[4]*B[1]+A[5]*B[3]+B[5]];
export const inv=(m)=>{const det=m[0]*m[3]-m[1]*m[2];if(!det)throw new Error('Singular matrix');return [m[3]/det,-m[1]/det,-m[2]/det,m[0]/det,(m[2]*m[5]-m[3]*m[4])/det,(m[1]*m[4]-m[0]*m[5])/det];};
export const apply=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
const bbox=(pts)=>{const xs=pts.map((p)=>p[0]),ys=pts.map((p)=>p[1]);return {x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)};};
/** Page-space affine that maps rectangle `from` onto rectangle `to` (both {x0,y0,x1,y1}). */
export function rectToRect(from,to){const sx=(to.x1-to.x0)/(from.x1-from.x0),sy=(to.y1-to.y0)/(from.y1-from.y0);return [sx,0,0,sy,to.x0-from.x0*sx,to.y0-from.y0*sy];}

// ---------- content stream scanning (only what is needed to find image placements) ----------
const DELIM=/[\s\/\[\]<>(){}%]/;
export function scanContent(src){
  const ops=[];let i=0,operands=[];const n=src.length;
  const skipString=()=>{let depth=1;i++;while(i<n&&depth){const c=src[i];if(c==='\\'){i+=2;continue;}if(c==='(')depth++;else if(c===')')depth--;i++;}};
  while(i<n){
    const c=src[i];
    if(c===' '||c==='\n'||c==='\r'||c==='\t'||c==='\f'||c==='\0'){i++;continue;}
    if(c==='%'){while(i<n&&src[i]!=='\n'&&src[i]!=='\r')i++;continue;}
    const start=i;
    if(c==='('){skipString();operands.push({t:'str',s:start});continue;}
    if(c==='<'){
      if(src[i+1]==='<'){let depth=0;while(i<n){if(src[i]==='<'&&src[i+1]==='<'){depth++;i+=2;}else if(src[i]==='>'&&src[i+1]==='>'){depth--;i+=2;if(!depth)break;}else if(src[i]==='(')skipString();else i++;}operands.push({t:'dict',s:start});continue;}
      const close=src.indexOf('>',i);i=close<0?n:close+1;operands.push({t:'hex',s:start});continue;
    }
    if(c==='['||c===']'||c==='{'||c==='}'){i++;operands.push({t:c,s:start});continue;}
    if(c==='/'){i++;while(i<n&&!DELIM.test(src[i]))i++;operands.push({t:'name',v:src.slice(start+1,i),s:start});continue;}
    while(i<n&&!DELIM.test(src[i]))i++;
    if(i===start){i++;continue;} // stray delimiter such as ')' or '>'
    const word=src.slice(start,i);
    if(/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)){operands.push({t:'num',v:parseFloat(word),s:start});continue;}
    if(word==='BI'){ // inline image: data runs from ID to a whitespace-delimited EI
      const id=src.indexOf('ID',i);let j=id<0?n:id+3;
      while(j<n){const k=src.indexOf('EI',j);if(k<0){j=n;break;}if(/\s/.test(src[k-1])&&(k+2>=n||/\s/.test(src[k+2]))){j=k+2;break;}j=k+2;}
      i=j;operands=[];continue;
    }
    ops.push({op:word,operands,start:operands.length?operands[0].s:start,end:i});operands=[];
  }
  return ops;
}

function decodeContents(PDFLib,doc,page){
  const {PDFArray,PDFRawStream,PDFName,decodePDFRawStream}=PDFLib,context=doc.context;
  const raw=page.node.get(PDFName.of('Contents'));if(!raw)return '';
  const value=context.lookup(raw),refs=value instanceof PDFArray?value.asArray():[raw];
  let out='';
  for(const ref of refs){const stream=context.lookup(ref);if(!stream)continue;const bytes=stream instanceof PDFRawStream?decodePDFRawStream(stream).decode():stream.getContents();for(let k=0;k<bytes.length;k+=8192)out+=String.fromCharCode(...bytes.subarray(k,k+8192));out+='\n';}
  return out;
}
function imageNames(PDFLib,page){
  const {PDFName,PDFDict,PDFStream}=PDFLib,res=page.node.Resources(),names=new Set();
  const xobjects=res?.lookupMaybe?.(PDFName.of('XObject'),PDFDict);
  if(xobjects)for(const key of xobjects.keys()){const x=xobjects.lookup(key);if(x instanceof PDFStream&&x.dict.get(PDFName.of('Subtype'))?.toString()==='/Image')names.add(key.decodeText?key.decodeText():key.toString().slice(1));}
  return names;
}
/** Photos drawn directly on a page: [{index, name, start, end, ctm, rect}] with rect in PDF user space. */
export function findPageImages(PDFLib,doc,pageIndex){
  const page=doc.getPage(pageIndex),src=decodeContents(PDFLib,doc,page),names=imageNames(PDFLib,page),found=[];
  let ctm=[1,0,0,1,0,0];const stack=[];
  for(const o of scanContent(src)){
    if(o.op==='q')stack.push(ctm);
    else if(o.op==='Q')ctm=stack.pop()||[1,0,0,1,0,0];
    else if(o.op==='cm'){const v=o.operands.filter((x)=>x.t==='num').map((x)=>x.v);if(v.length===6)ctm=mul(v,ctm);}
    else if(o.op==='Do'){const name=o.operands.find((x)=>x.t==='name')?.v;if(name&&names.has(name)){const r=bbox([[0,0],[1,0],[0,1],[1,1]].map((p)=>apply(ctm,p)));if(r.x1-r.x0>1&&r.y1-r.y0>1)found.push({index:found.length,name,start:o.start,end:o.end,ctm,rect:r});}}
  }
  return {src,images:found};
}

/** Applies edits to one page. edits: {moves:[{index,to:{x0,y0,x1,y1}}], deletes:[index], covers:[{x0,y0,x1,y1,color:[r,g,b]}],
    texts:[{x,y,size,color:[r,g,b],lines:[..],bold,rotation}], images:[{bytes,type,x0,y0,x1,y1,rotation}]} — all in PDF user space. */
export async function applyPageEdits(PDFLib,doc,pageIndex,edits){
  const {PDFName,StandardFonts,rgb,degrees}=PDFLib,page=doc.getPage(pageIndex),context=doc.context;
  const {moves=[],deletes=[],covers=[],texts=[],images=[]}=edits;
  if(moves.length||deletes.length){
    const {src,images:placed}=findPageImages(PDFLib,doc,pageIndex),changes=[];
    for(const m of moves){const img=placed[m.index];if(!img)throw new Error('Image not found');const T=rectToRect(img.rect,m.to),M=mul(mul(img.ctm,T),inv(img.ctm));changes.push({start:img.start,end:img.end,text:`q ${M.map((v)=>+v.toFixed(6)).join(' ')} cm ${src.slice(img.start,img.end)} Q`});}
    for(const d of deletes){const img=placed[d];if(!img)throw new Error('Image not found');changes.push({start:img.start,end:img.end,text:''});}
    let out=src;for(const c of changes.sort((a,b)=>b.start-a.start))out=out.slice(0,c.start)+c.text+out.slice(c.end);
    const bytes=new Uint8Array(out.length);for(let k=0;k<out.length;k++)bytes[k]=out.charCodeAt(k)&255;
    page.node.set(PDFName.of('Contents'),context.register(context.flateStream(bytes)));
  }
  for(const c of covers)page.drawRectangle({x:c.x0,y:c.y0,width:c.x1-c.x0,height:c.y1-c.y0,color:rgb(...c.color)});
  const fonts={},FACES={sans:['Helvetica','HelveticaBold'],serif:['TimesRoman','TimesRomanBold'],mono:['Courier','CourierBold']};
  for(const tx of texts){
    const face=(FACES[tx.family]||FACES.sans)[tx.bold?1:0],font=fonts[face]||=await doc.embedFont(StandardFonts[face]);
    tx.lines.forEach((line,i)=>{
      const offset=[0,-i*tx.size*1.25],r=(tx.rotation||0)*Math.PI/180,dx=offset[0]*Math.cos(r)-offset[1]*Math.sin(r),dy=offset[0]*Math.sin(r)+offset[1]*Math.cos(r);
      if(line)page.drawText(line,{x:tx.x+dx,y:tx.y+dy,size:tx.size,font,color:rgb(...tx.color),rotate:degrees(tx.rotation||0)});
    });
  }
  for(const im of images){
    const embedded=im.type==='png'?await doc.embedPng(im.bytes):await doc.embedJpg(im.bytes);
    page.drawImage(embedded,{x:im.x,y:im.y,width:im.width,height:im.height,rotate:degrees(im.rotation||0)});
  }
}
export const latinOnly=(text)=>!/[^\x20-\x7E\xA0-\xFF\n]/.test(text);

/** Bold and family (sans / serif / mono) of a pdf.js text run, from the embedded font's name. */
export function fontOf(page,fontName,style){
  let name='';try{if(page.commonObjs.has(fontName))name=String(page.commonObjs.get(fontName)?.name||'');}catch{}
  const all=(name+' '+(style?.fontFamily||'')).toLowerCase();
  return {bold:/bold|black|heavy|semibold|demi/.test(all),family:/courier|mono|consol/.test(all)?'mono':/times|serif|georgia|garamond|cambria|minion/.test(all)&&!/sans/.test(all)?'serif':'sans'};
}
// ======================= UI =======================
export async function runPageEditor(ctx,startPage=1){
  const {t}=ctx,PDFLib=ctx.PDFLib,bytes=await ctx.getBytes();
  let doc=await PDFLib.PDFDocument.load(bytes,{updateMetadata:false});const viewer=await ctx.pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
  const count=doc.getPageCount();let pageNo=Math.min(Math.max(1,startPage),count),state=null,selected=null,history=[];
  const edits=new Map(); // pageNo -> {images:[...], texts:[...], newObjects:[...]}
  const engine=engineAvailable('eraseAreas');
  const root=document.createElement('div');root.className='pe-root';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
  root.innerHTML=`<div class="pe-bar" role="toolbar">
    <strong class="pe-title">${t('Edit page','تحرير الصفحة')}</strong>
    <span class="pe-group"><button type="button" data-a="prev" class="pw-icon" aria-label="${t('Previous page','الصفحة السابقة')}">${ctx.icon(document.dir==='rtl'?'arrow-right':'arrow-left')}</button><span id="pePage" class="pw-muted"></span><button type="button" data-a="next" class="pw-icon" aria-label="${t('Next page','الصفحة التالية')}">${ctx.icon(document.dir==='rtl'?'arrow-left':'arrow-right')}</button></span>
    <span class="pe-group"><button type="button" data-a="text" aria-label="${t('Add text','إضافة نص')}">${ctx.icon('stamp')}<span>${t('Add text','إضافة نص')}</span></button><button type="button" data-a="image" aria-label="${t('Add image','إضافة صورة')}">${ctx.icon('images')}<span>${t('Add image','إضافة صورة')}</span></button><button type="button" data-a="box" aria-label="${t('White-out box','مربع تغطية بيضاء')}">${ctx.icon('blank')}<span>${t('White-out','تغطية بيضاء')}</span></button><input type="file" id="peImage" accept="image/png,image/jpeg" hidden></span>
    <span class="pe-group pe-props" id="peProps" hidden><label>${t('Size','الحجم')}<input id="peSize" type="number" min="6" max="96" step="1"></label><label>${t('Color','اللون')}<input id="peColor" type="color"></label><label class="pe-check"><input id="peBold" type="checkbox">${t('Bold','عريض')}</label></span>
    <span class="pe-group"><button type="button" data-a="delete" id="peDelete" disabled aria-label="${t('Delete selected','حذف المحدد')}">${ctx.icon('delete')}<span>${t('Delete','حذف')}</span></button><button type="button" data-a="undo" id="peUndo" disabled aria-label="${t('Undo','تراجع')}">${ctx.icon('undo')}<span>${t('Undo','تراجع')}</span></button></span>
    <span class="pe-group pe-end"><button type="button" data-a="cancel">${t('Cancel','إلغاء')}</button><button type="button" data-a="apply" class="primary">${t('Apply changes','تطبيق التغييرات')}</button></span>
  </div>
  <p class="pe-hint" id="peHint"></p>
  <div class="pe-stage-wrap"><div class="pe-stage" id="peStage"><canvas id="peCanvas"></canvas><div class="pe-layer" id="peLayer"></div></div></div>`;
  document.body.append(root);document.body.classList.add('pe-open');
  const stage=$('#peStage',root),layer=$('#peLayer',root),canvas=$('#peCanvas',root);
  let viewport=null,pageRotation=0,editorRenderId=null;
  const hint=(en,ar)=>{$('#peHint',root).textContent=t(en,ar);};
  hint('Drag photos to move them, use the corner to resize. Double-click text to change it. Changes are applied when you press Apply.','اسحب الصور لنقلها، واستخدم الزاوية لتغيير حجمها. انقر نقراً مزدوجاً على النص لتغييره. تُطبّق التغييرات عند الضغط على «تطبيق».');
  const pdfRect=(r)=>{const a=viewport.convertToPdfPoint(r.x,r.y),b=viewport.convertToPdfPoint(r.x+r.w,r.y+r.h);return {x0:Math.min(a[0],b[0]),y0:Math.min(a[1],b[1]),x1:Math.max(a[0],b[0]),y1:Math.max(a[1],b[1])};};
  const viewRect=(r)=>{const pts=[[r.x0,r.y0],[r.x1,r.y0],[r.x0,r.y1],[r.x1,r.y1]].map((p)=>viewport.convertToViewportPoint(...p)),b=bbox(pts);return {x:b.x0,y:b.y0,w:b.x1-b.x0,h:b.y1-b.y0};};
  const snapshot=()=>{history.push(JSON.stringify(state,(k,v)=>k==='bytes'?undefined:v));if(history.length>50)history.shift();$('#peUndo',root).disabled=false;};
  const hexToRgb=(h)=>[1,3,5].map((i)=>parseInt(h.slice(i,i+2),16)/255);

  async function loadPage(n){
    commitOpen?.();saveState();pageNo=n;selected=null;history=[];$('#peUndo',root).disabled=true;
    const page=await viewer.getPage(n);pageRotation=page.rotate||0;
    const base=page.getViewport({scale:1}),wrap=$('.pe-stage-wrap',root),scale=Math.min(3,Math.max(0.4,Math.min((wrap.clientWidth-40)/base.width,(wrap.clientHeight-40)/base.height)));
    viewport=page.getViewport({scale});const ratio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
    stage.style.width=viewport.width+'px';stage.style.height=viewport.height+'px';
    const er=ctx.engineRender,base1=page.getViewport({scale:1});
    if(er&&!er.enabled())await er.ready?.();
    if(er?.enabled()&&er.isHeavy(bytes.length,count,base1.width*base1.height)){ // CAD-size page: MuPDF draws the background
      editorRenderId||=await er.upload(bytes);const img=new Image();img.src=er.url(editorRenderId,n,canvas.width);await img.decode();canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    }else await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:null}).promise;
    if(edits.has(n))state=edits.get(n);
    else{
      let images=[];try{images=findPageImages(PDFLib,doc,n-1).images.map((im)=>({kind:'photo',index:im.index,orig:im.rect,rect:viewRect(im.rect),deleted:false}));}catch{}
      const content=await page.getTextContent();
      const texts=content.items.filter((it)=>it.str.trim()&&Math.abs(it.transform[1])<0.01).map((it,i)=>{const size=Math.hypot(it.transform[0],it.transform[1]),x0=it.transform[4],y0=it.transform[5]-size*0.25,f=fontOf(page,it.fontName,content.styles?.[it.fontName]);return {kind:'text',id:'t'+i,orig:{x0,y0,x1:x0+it.width,y1:y0+size*1.2},str:it.str,size:Math.max(6,Math.round(size)),edited:null,bold:f.bold,family:f.family};});
      state={images,texts,added:[]};
    }
    $('#pePage',root).textContent=t(`Page ${n} of ${count}`,`الصفحة ${n} من ${count}`);
    draw();
  }
  function saveState(){if(state)edits.set(pageNo,state);}
  function sampleColor(r){ // page colour just left of / around the text, read from the rendered page
    const g=canvas.getContext('2d'),ratio=canvas.width/viewport.width,v=viewRect(r),x=Math.max(0,Math.floor((v.x-3)*ratio)),y=Math.floor((v.y+v.h/2)*ratio);
    const d=g.getImageData(x,Math.min(canvas.height-1,Math.max(0,y)),1,1).data;return [d[0]/255,d[1]/255,d[2]/255];
  }
  function sampleInk(r,bg){ // the text's own colour: the drawn pixel inside its box that differs most from the background
    const g=canvas.getContext('2d'),ratio=canvas.width/viewport.width,v=viewRect(r);
    const x=Math.max(0,Math.floor(v.x*ratio)),y=Math.max(0,Math.floor(v.y*ratio)),w=Math.max(1,Math.min(canvas.width-x,Math.ceil(v.w*ratio))),h=Math.max(1,Math.min(canvas.height-y,Math.ceil(v.h*ratio)));
    const d=g.getImageData(x,y,w,h).data,b=(bg||[1,1,1]).map((c)=>c*255);let best=-1,ink=[0,0,0];
    for(let i=0;i<d.length;i+=4){const dist=Math.abs(d[i]-b[0])+Math.abs(d[i+1]-b[1])+Math.abs(d[i+2]-b[2]);if(dist>best){best=dist;ink=[d[i],d[i+1],d[i+2]];}}
    return '#'+ink.map((c)=>c.toString(16).padStart(2,'0')).join('');
  }
  const FAMILY={sans:'Helvetica,Arial,Tajawal,sans-serif',serif:'"Times New Roman",Times,serif',mono:'"Courier New",Courier,monospace'};
  function startTextEdit(tx){if(tx.edited!==null)return;tx.cover=sampleColor(tx.orig);tx.color=tx.color||sampleInk(tx.orig,tx.cover);}
  // Selection without rebuilding the boxes: rebuilding while a photo is being dragged would drop the drag.
  function select(item,el){selected=item;layer.querySelectorAll('.is-selected').forEach((x)=>x.classList.remove('is-selected'));el?.classList.add('is-selected');syncControls();}
  function syncControls(){
    $('#peDelete',root).disabled=!selected||selected.kind==='text';
    const textSel=selected&&(selected.type==='text'||selected.kind==='text'),props=$('#peProps',root);props.hidden=!textSel;
    if(textSel){$('#peSize',root).value=selected.size;$('#peColor',root).value=selected.color||'#000000';$('#peBold',root).checked=!!selected.bold;}
  }
  function box(item,cls,label){
    const el=document.createElement('div');el.className='pe-obj '+cls+(selected===item?' is-selected':'');el.tabIndex=0;el.setAttribute('aria-label',label);
    const r=item.rect;Object.assign(el.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});
    el.onpointerdown=(e)=>startDrag(e,item,el,false);
    if(item.kind!=='text'){const h=document.createElement('span');h.className='pe-handle';h.onpointerdown=(e)=>{e.stopPropagation();startDrag(e,item,el,true);};el.append(h);}
    el.onkeydown=(e)=>{if(e.key==='Delete'||e.key==='Backspace'){removeSelected();e.preventDefault();}const step=e.shiftKey?10:1,mv={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];if(mv&&item.kind!=='text'){snapshot();item.rect.x+=mv[0];item.rect.y+=mv[1];draw();e.preventDefault();}};
    layer.append(el);return el;
  }
  function draw(){
    layer.replaceChildren();
    for(const im of state.images)if(!im.deleted)box(im,'pe-photo',t('Photo','صورة'));
    for(const tx of state.texts){
      const v=viewRect(tx.orig),el=document.createElement('div');el.className='pe-text'+(tx.edited!==null?' is-edited':'');Object.assign(el.style,{left:v.x+'px',top:v.y+'px',width:v.w+'px',height:v.h+'px'});el.title=t('Double-click to edit','انقر نقراً مزدوجاً للتحرير');
      if(tx.edited!==null){el.textContent=tx.edited;Object.assign(el.style,{fontSize:tx.size*viewport.scale+'px',color:tx.color||'#000',fontWeight:tx.bold?'700':'400',fontFamily:FAMILY[tx.family]||FAMILY.sans,background:`rgb(${(tx.cover||[1,1,1]).map((c)=>Math.round(c*255)).join(',')})`});el.dir='auto';}
      if(selected===tx)el.classList.add('is-selected');
      el.onclick=()=>select(tx,el);el.ondblclick=()=>editExisting(tx,el);layer.append(el);
    }
    for(const a of state.added){
      const el=box(a,'pe-added pe-'+a.type,a.type==='text'?t('Text','نص'):a.type==='image'?t('Image','صورة'):t('White-out','تغطية'));
      if(a.type==='text'){el.textContent=a.text;el.dir='auto';Object.assign(el.style,{fontSize:a.size*viewport.scale+'px',color:a.color,fontWeight:a.bold?'700':'400'});el.ondblclick=()=>editAdded(a,el);const h=document.createElement('span');h.className='pe-handle';h.onpointerdown=(e)=>{e.stopPropagation();startDrag(e,a,el,true);};el.append(h);}
      if(a.type==='image'){el.style.backgroundImage=`url(${a.url})`;}
    }
    syncControls();
  }
  function startDrag(e,item,el,resize){
    e.preventDefault();select(item,el);const start={x:e.clientX,y:e.clientY,r:{...item.rect}};let moved=false;
    el.setPointerCapture?.(e.pointerId);
    const move=(ev)=>{const dx=ev.clientX-start.x,dy=ev.clientY-start.y;if(!moved&&Math.hypot(dx,dy)<3)return;if(!moved){snapshot();moved=true;}
      if(resize){let w=Math.max(12,start.r.w+dx),h=Math.max(12,start.r.h+dy);if(item.kind==='photo'||item.type==='image'){const k=Math.max(w/start.r.w,h/start.r.h);w=start.r.w*k;h=start.r.h*k;}item.rect={...item.rect,w,h};}
      else item.rect={...item.rect,x:start.r.x+dx,y:start.r.y+dy};
      Object.assign(el.style,{left:item.rect.x+'px',top:item.rect.y+'px',width:item.rect.w+'px',height:item.rect.h+'px'});};
    const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);draw();layer.querySelector('.is-selected')?.focus();};
    el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  }
  let commitOpen=null; // commits a text box that is still open (Apply, page change)
  function inlineEditor(rect,value,size,onDone,singleLine=false,look={}){
    const ta=document.createElement('textarea');ta.className='pe-inline';ta.value=value;ta.dir='auto';Object.assign(ta.style,{left:rect.x+'px',top:rect.y+'px',width:Math.max(rect.w,120)+'px',height:Math.max(rect.h,size*viewport.scale*1.6)+'px',fontSize:size*viewport.scale+'px'},look.color?{color:look.color}:{},look.bold?{fontWeight:'700'}:{},look.family?{fontFamily:look.family}:{});
    layer.append(ta);ta.focus();ta.select();
    const finish=(save)=>{if(!ta.isConnected)return;commitOpen=null;const v=ta.value;ta.remove();if(save)onDone(v);draw();};
    commitOpen=()=>finish(true);
    ta.onblur=()=>finish(true);ta.onkeydown=(e)=>{if(e.key==='Escape'){e.stopPropagation();finish(false);}if(e.key==='Enter'&&(e.ctrlKey||e.metaKey||(singleLine&&!e.shiftKey))){e.preventDefault();finish(true);}};
  }
  function editExisting(tx,el){selected=tx;const v=viewRect(tx.orig);inlineEditor(v,tx.edited??tx.str,tx.size,(value)=>{if(value===(tx.edited??tx.str))return;snapshot();startTextEdit(tx);tx.edited=value;},true,{color:tx.color||sampleInk(tx.orig,sampleColor(tx.orig)),bold:tx.bold,family:FAMILY[tx.family]});}
  function editAdded(a){inlineEditor(a.rect,a.text,a.size,(value)=>{snapshot();a.text=value;if(!value.trim())state.added=state.added.filter((x)=>x!==a);});}
  function removeSelected(){if(!selected)return;snapshot();if(selected.kind==='photo')selected.deleted=true;else state.added=state.added.filter((x)=>x!==selected);selected=null;draw();}
  const centerRect=(w,h)=>({x:(viewport.width-w)/2,y:(viewport.height-h)/3,w,h});
  root.querySelector('.pe-bar').addEventListener('click',async(e)=>{
    const a=e.target.closest('[data-a]')?.dataset.a;if(!a)return;
    if(a==='prev'&&pageNo>1)await loadPage(pageNo-1);if(a==='next'&&pageNo<count)await loadPage(pageNo+1);
    if(a==='text'){snapshot();const item={type:'text',text:t('New text','نص جديد'),size:14,color:'#1f2a28',bold:false,rect:centerRect(200*viewport.scale/1.2,28*viewport.scale)};state.added.push(item);selected=item;draw();editAdded(item);}
    if(a==='box'){snapshot();const item={type:'box',rect:centerRect(160*viewport.scale,40*viewport.scale)};state.added.push(item);selected=item;draw();}
    if(a==='image')$('#peImage',root).click();
    if(a==='delete')removeSelected();
    if(a==='undo'&&history.length){const prev=JSON.parse(history.pop());const keepBytes=new Map(state.added.filter((x)=>x.bytes).map((x)=>[x.url,x.bytes]));prev.added.forEach((x)=>{if(x.url)x.bytes=keepBytes.get(x.url);});state=prev;selected=null;$('#peUndo',root).disabled=!history.length;draw();}
    if(a==='cancel')close();
    if(a==='apply')await applyAll();
  });
  $('#peImage',root).onchange=async(e)=>{const f=e.target.files[0];e.target.value='';if(!f)return;const data=new Uint8Array(await f.arrayBuffer()),url=URL.createObjectURL(f),img=new Image();img.src=url;await img.decode().catch(()=>{});const w=Math.min(viewport.width*0.5,img.naturalWidth||200),h=w*((img.naturalHeight||1)/(img.naturalWidth||1));snapshot();const item={type:'image',bytes:data,url,mime:/png/i.test(f.type)?'png':'jpg',rect:centerRect(w,h)};state.added.push(item);selected=item;draw();};
  for(const id of ['peSize','peColor','peBold'])$('#'+id,root).oninput=()=>{if(!selected||(selected.type!=='text'&&selected.kind!=='text'))return;snapshot();if(selected.kind==='text'){startTextEdit(selected);if(selected.edited===null)selected.edited=selected.str;}selected.size=Number($('#peSize',root).value)||14;selected.color=$('#peColor',root).value;selected.bold=$('#peBold',root).checked;draw();};
  layer.onpointerdown=(e)=>{if(e.target===layer){selected=null;draw();}};
  const onKey=(e)=>{if(e.key==='Escape'&&!e.target.closest?.('.pe-inline'))close();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.target.closest?.('textarea,input')){e.preventDefault();root.querySelector('[data-a="undo"]').click();}};
  document.addEventListener('keydown',onKey);
  function close(){document.removeEventListener('keydown',onKey);root.remove();document.body.classList.remove('pe-open');viewer.destroy();}

  function textImage(text,size,color,bold,rect){ // non-Latin text (e.g. Arabic) is drawn by the browser so shaping is correct
    const k=4,w=Math.ceil(rect.w/viewport.scale*k),h=Math.ceil(rect.h/viewport.scale*k),c=document.createElement('canvas');c.width=Math.max(w,4);c.height=Math.max(h,4);
    const g=c.getContext('2d'),rtl=/[֐-ࣿ]/.test(text);g.font=`${bold?700:400} ${size*k}px Tajawal, Tahoma, Arial`;g.fillStyle=color;g.textBaseline='top';g.direction=rtl?'rtl':'ltr';g.textAlign=rtl?'right':'left';
    text.split('\n').forEach((line,i)=>g.fillText(line,rtl?c.width-2:2,i*size*k*1.25+size*k*0.1));
    return new Promise((res)=>c.toBlob(async(b)=>res(new Uint8Array(await b.arrayBuffer())),'image/png'));
  }
  async function applyAll(){
    commitOpen?.();saveState();
    const btn=root.querySelector('[data-a="apply"]');btn.disabled=true;btn.textContent=t('Applying…','جارٍ التطبيق…');
    try{
      // 1) With the engine, the old words are really removed first (on the untouched file)…
      const erase=[];
      if(engine)for(const [n,st] of edits)for(const tx of st.texts)if(tx.edited!==null)erase.push({page:n,rect:[tx.orig.x0,tx.orig.y0,tx.orig.x1,tx.orig.y1]});
      let erased=false;
      if(erase.length){
        try{const r=await processWithEngine('eraseAreas',bytes,ctx.filename()+'.pdf',{areas:erase});doc=await PDFLib.PDFDocument.load(r.bytes,{updateMetadata:false});erased=true;}
        catch{ctx.msg('The engine could not remove the old text, so it was covered instead.','تعذر على المحرك إزالة النص القديم، لذا تمت تغطيته بدلاً من ذلك.',true);}
      }
      // 2) …then moves, deletions and the new text are applied on top, so the new words can never be erased.
      for(const [n,st] of edits){
        const page=await viewer.getPage(n),vp=page.getViewport({scale:1});const prev=viewport;viewport=page.getViewport({scale:prev&&n===pageNo?prev.scale:1});
        const scale=viewport.scale,toPdf=(r)=>pdfRect(r),rot=page.rotate||0,e={moves:[],deletes:[],covers:[],texts:[],images:[]};
        for(const im of st.images){if(im.deleted)e.deletes.push(im.index);else{const now=toPdf(im.rect);if(Math.abs(now.x0-im.orig.x0)+Math.abs(now.y0-im.orig.y0)+Math.abs(now.x1-im.orig.x1)+Math.abs(now.y1-im.orig.y1)>0.5)e.moves.push({index:im.index,to:now});}}
        const addText=async(text,size,color,bold,rect,family='sans')=>{
          if(latinOnly(text)){const anchor=viewport.convertToPdfPoint(rect.x,rect.y+size*scale*0.95);e.texts.push({x:anchor[0],y:anchor[1],size,color:hexToRgb(color),bold,family,lines:text.split('\n'),rotation:rot});}
          else{const r=toPdf(rect),png=await textImage(text,size,color,bold,rect);const a=viewport.convertToPdfPoint(rect.x,rect.y+rect.h);e.images.push({bytes:png,type:'png',x:a[0],y:a[1],width:rect.w/scale,height:rect.h/scale,rotation:rot,_r:r});}
        };
        for(const tx of st.texts)if(tx.edited!==null){
          if(!erased)e.covers.push({...tx.orig,color:tx.cover||[1,1,1]});
          if(tx.edited.trim()){const v=viewRect(tx.orig);const lines=tx.edited.split('\n').length;await addText(tx.edited,tx.size,tx.color||'#000000',!!tx.bold,{x:v.x,y:v.y,w:Math.max(v.w,tx.edited.length*tx.size*0.55*scale),h:lines*tx.size*1.3*scale},tx.family);}
        }
        for(const a of st.added){
          if(a.type==='box')e.covers.push({...toPdf(a.rect),color:[1,1,1]});
          if(a.type==='image'){const p=viewport.convertToPdfPoint(a.rect.x,a.rect.y+a.rect.h);e.images.push({bytes:a.bytes,type:a.mime,x:p[0],y:p[1],width:a.rect.w/scale,height:a.rect.h/scale,rotation:rot});}
          if(a.type==='text'&&a.text.trim())await addText(a.text,a.size,a.color,a.bold,a.rect);
        }
        await applyPageEdits(PDFLib,doc,n-1,e);viewport=prev;
      }
      const out=await doc.save();
      close();
      await ctx.download(out,`${ctx.filename()}-edited.pdf`,'application/pdf');
      const covered=!erased&&[...edits.values()].some((st)=>st.texts.some((x)=>x.edited!==null));
      (ctx.notice||ctx.msg)(covered?'Page edited. Replaced text was covered; the old words can still be found by search or copy. Use “Redact matching text” to remove them for good.':'Page edited.',covered?'تم تحرير الصفحة. غُطّي النص المستبدل، وقد تظهر الكلمات القديمة عند البحث أو النسخ. استخدم «تنقيح نص مطابق» لإزالتها نهائياً.':'تم تحرير الصفحة.');
    }catch(err){console.error(err);btn.disabled=false;btn.textContent=t('Apply changes','تطبيق التغييرات');hint('These changes could not be applied to this PDF. Nothing was changed.','تعذر تطبيق هذه التغييرات على هذا الملف. لم يتغير شيء.');}
  }
  await loadPage(pageNo);
  if(!engine)$('#peHint',root).textContent+=' '+t('Without an engine, replaced text is covered, not removed.','دون محرك، يُغطّى النص المستبدل ولا يُحذف.');
}
