// Crop with the mouse: drag a box on a large preview of the page. The box is kept as fractions of the page as it is
// shown (after rotation), so one box can be applied to several pages; core.js turns it into each page's crop box.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

/** Crop box in PDF user space from a box drawn on the page as displayed. `rect` = {l,t,r,b} fractions cut from
 *  each displayed edge; `box` = the page's current crop box {x,y,width,height}; `rotation` = 0/90/180/270. */
export function cropToUserSpace(rect,box,rotation){
  const {l,t,r,b}=rect,{x,y,width:w,height:h}=box,rot=((rotation%360)+360)%360;
  // which user-space edge each displayed edge cuts (a /Rotate turns the page clockwise for display)
  const cut={0:{x0:l,x1:r,y0:b,y1:t},90:{x0:t,x1:b,y0:l,y1:r},180:{x0:r,x1:l,y0:t,y1:b},270:{x0:b,x1:t,y0:r,y1:l}}[rot]||{x0:l,x1:r,y0:b,y1:t};
  return {x:x+cut.x0*w,y:y+cut.y0*h,width:w*(1-cut.x0-cut.x1),height:h*(1-cut.y0-cut.y1)};
}

export async function openCrop(ctx){
  const {t,modal,msg}=ctx,pages=ctx.pages(),targets=ctx.active(),first=targets[0];
  if(!first)return;
  modal(t('Crop pages','اقتصاص الصفحات'),`
    <p class="pw-muted">${t('Drag on the page to draw the area to keep. Drag inside the box to move it, or its corners and edges to resize. Hold Shift to keep the shape.','اسحب على الصفحة لرسم المنطقة التي تريد إبقاءها. اسحب داخل المربع لنقله، أو من زواياه وحوافه لتغيير حجمه. اضغط Shift للحفاظ على الشكل.')}</p>
    <div class="crop-stage" id="cropStage"><img id="cropImg" alt=""><div class="crop-shade" id="cropShade"></div><div class="crop-box" id="cropBox" tabindex="0">${['nw','n','ne','e','se','s','sw','w'].map((h)=>`<span class="crop-h crop-${h}" data-h="${h}"></span>`).join('')}</div></div>
    <p class="crop-size" id="cropSize" aria-live="polite"></p>
    <div class="crop-actions">
      <button type="button" class="primary" data-apply="page">${t('Apply to this page','تطبيق على هذه الصفحة')}</button>
      ${ctx.selectedCount()>1?`<button type="button" data-apply="selected">${t(`Apply to ${targets.length} selected pages`,`تطبيق على ${targets.length} صفحات محددة`)}</button>`:''}
      ${pages.length>1?`<button type="button" data-apply="all">${t(`Apply to all ${pages.length} pages`,`تطبيق على كل الصفحات (${pages.length})`)}</button>`:''}
      <button type="button" data-apply="reset">${t('Remove crop','إزالة الاقتصاص')}</button>
    </div>`);
  const stage=document.querySelector('#cropStage'),img=document.querySelector('#cropImg'),box=document.querySelector('#cropBox'),shade=document.querySelector('#cropShade'),size=document.querySelector('#cropSize');
  // page as displayed, at a size that fits the dialog (thumbnail first, then a sharp render)
  let pt={w:595,h:842};
  if(first.source!==null){
    const page=await ctx.sources()[first.source].viewer.getPage(first.index+1),v=page.getViewport({scale:1,rotation:first.rotation});pt={w:v.width,h:v.height};
    if(first.thumb)img.src=first.thumb;
    const fit=Math.min(1100/v.width,1100/v.height,3),vp=page.getViewport({scale:fit,rotation:first.rotation}),c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
    page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise.then(()=>{img.src=c.toDataURL('image/png');c.width=0;}).catch(()=>{});
  }else img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842"><rect width="595" height="842" fill="white"/></svg>');
  stage.style.aspectRatio=pt.w+' / '+pt.h;
  // no box until one is drawn (an existing crop is shown so it can be adjusted)
  let rect=first.cropRect?{...first.cropRect}:null;
  const applyButtons=[...document.querySelectorAll('.crop-actions [data-apply]:not([data-apply="reset"])')];
  const draw=()=>{
    applyButtons.forEach((b)=>{b.disabled=!rect;});box.hidden=!rect;
    if(!rect){shade.style.clipPath='none';shade.style.opacity='0';size.textContent=t('Drag on the page to choose the area to keep.','اسحب على الصفحة لاختيار المنطقة التي تريد إبقاءها.');return;}
    shade.style.opacity='';
    Object.assign(box.style,{left:rect.l*100+'%',top:rect.t*100+'%',right:rect.r*100+'%',bottom:rect.b*100+'%'});
    shade.style.clipPath=`polygon(0 0,100% 0,100% 100%,0 100%,0 0,${rect.l*100}% ${rect.t*100}%,${rect.l*100}% ${(1-rect.b)*100}%,${(1-rect.r)*100}% ${(1-rect.b)*100}%,${(1-rect.r)*100}% ${rect.t*100}%,${rect.l*100}% ${rect.t*100}%)`;
    const mm=(p)=>Math.round(p*25.4/72);
    size.textContent=t(`Kept area: ${mm(pt.w*(1-rect.l-rect.r))} × ${mm(pt.h*(1-rect.t-rect.b))} mm`,`المنطقة المحفوظة: ${mm(pt.w*(1-rect.l-rect.r))} × ${mm(pt.h*(1-rect.t-rect.b))} مم`);
  };
  draw();
  const MIN=0.03;let drag=null;
  stage.addEventListener('pointerdown',(e)=>{
    if(e.button!==0)return;e.preventDefault();stage.setPointerCapture(e.pointerId);
    const s=stage.getBoundingClientRect(),fx=(e.clientX-s.left)/s.width,fy=(e.clientY-s.top)/s.height,h=e.target.dataset?.h;
    const inside=!!rect&&fx>rect.l&&fx<1-rect.r&&fy>rect.t&&fy<1-rect.b;
    drag={mode:h?h:inside?'move':'new',fx,fy,start:{...rect},s};
    if(drag.mode==='new'){rect={l:fx,t:fy,r:1-fx,b:1-fy};drag.mode='se';drag.start={...rect};draw();}
  });
  stage.addEventListener('pointermove',(e)=>{
    if(!drag)return;const {s,start}=drag;let fx=clamp((e.clientX-s.left)/s.width,0,1),fy=clamp((e.clientY-s.top)/s.height,0,1);
    const dx=fx-drag.fx,dy=fy-drag.fy;let n={...start};
    if(drag.mode==='move'){const w=1-start.l-start.r,h=1-start.t-start.b;n.l=clamp(start.l+dx,0,1-w);n.t=clamp(start.t+dy,0,1-h);n.r=1-n.l-w;n.b=1-n.t-h;}
    else{
      if(drag.mode.includes('w'))n.l=clamp(fx,0,1-start.r-MIN);
      if(drag.mode.includes('e'))n.r=clamp(1-fx,0,1-start.l-MIN);
      if(drag.mode.includes('n'))n.t=clamp(fy,0,1-start.b-MIN);
      if(drag.mode.includes('s'))n.b=clamp(1-fy,0,1-start.t-MIN);
      if(e.shiftKey&&drag.mode.length===2){ // keep the shape of the starting box
        const ratio=((1-start.l-start.r)*s.width)/((1-start.t-start.b)*s.height),w=(1-n.l-n.r)*s.width,hh=w/ratio/s.height;
        if(drag.mode.includes('s'))n.b=clamp(1-n.t-hh,0,1);else n.t=clamp(1-n.b-hh,0,1);
      }
    }
    rect=n;draw();
  });
  const end=()=>{drag=null;};stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
  box.addEventListener('keydown',(e)=>{if(!rect)return;const step=e.shiftKey?0.02:0.005,mv={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];if(!mv)return;e.preventDefault();const dx=document.dir==='rtl'?-mv[0]:mv[0];const w=1-rect.l-rect.r,h=1-rect.t-rect.b;rect.l=clamp(rect.l+dx,0,1-w);rect.t=clamp(rect.t+mv[1],0,1-h);rect.r=1-rect.l-w;rect.b=1-rect.t-h;draw();});
  document.querySelector('.crop-actions').addEventListener('click',(e)=>{
    const how=e.target.closest('[data-apply]')?.dataset.apply;if(!how)return;
    if(how!=='reset'&&!rect)return;
    const list=how==='page'?[first]:how==='selected'?targets:pages;ctx.snapshot();
    if(how==='reset'){for(const p of targets)delete p.cropRect;}
    else for(const p of list){p.cropRect={...rect};p.crop=0;}
    document.querySelector('#dialog').close();ctx.render();
    msg(how==='reset'?'Crop removed. Undo is available.':`Cropped ${list.length} page${list.length>1?'s':''}. Undo is available.`,how==='reset'?'أُزيل الاقتصاص. يمكنك التراجع.':`تم اقتصاص ${list.length} صفحة. يمكنك التراجع.`);
  });
}
