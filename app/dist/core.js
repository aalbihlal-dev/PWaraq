/* PDF composition shared by the app and its integration tests. */
(function(root){
// Same rule as crop-tool.js: fractions cut from each displayed edge -> crop box in PDF user space.
function cropToUserSpace(rect,box,rotation){
 const {l,t,r,b}=rect,{x,y,width:w,height:h}=box,rot=((rotation%360)+360)%360;
 const cut={0:{x0:l,x1:r,y0:b,y1:t},90:{x0:t,x1:b,y0:l,y1:r},180:{x0:r,x1:l,y0:t,y1:b},270:{x0:b,x1:t,y0:r,y1:l}}[rot]||{x0:l,x1:r,y0:b,y1:t};
 return {x:x+cut.x0*w,y:y+cut.y0*h,width:w*(1-cut.x0-cut.x1),height:h*(1-cut.y0-cut.y1)};
}
async function compose(items, sources, options={}) {
 const {PDFDocument,degrees,StandardFonts,rgb}=root.PDFLib;
 if(!items.length) throw new Error('No pages selected');
 const output=await PDFDocument.create();
 const font=options.numbers?await output.embedFont(StandardFonts.Helvetica):null;
 for(let i=0;i<items.length;i++){
  const item=items[i];let page;
  if(item.source===null)page=output.addPage([595.28,841.89]);
  else { [page]=await output.copyPages(sources[item.source].doc,[item.index]);output.addPage(page); }
  page.setRotation(degrees(item.rotation));
  if(item.cropRect){const b=page.getCropBox(),c=cropToUserSpace(item.cropRect,b,item.rotation);page.setCropBox(c.x,c.y,c.width,c.height);}
  else if(item.crop){const b=page.getCropBox(),m=item.crop;page.setCropBox(b.x+m,b.y+m,b.width-2*m,b.height-2*m);}
  if(options.numbers)page.drawText(String(i+1),{x:page.getWidth()/2,y:18,size:11,font,color:rgb(.2,.3,.25)});
  if(options.stamp){const img=await output.embedPng(options.stamp.bytes);const width=Math.min(options.stamp.width,page.getWidth()-40);const height=width*img.height/img.width;page.drawImage(img,{x:(page.getWidth()-width)/2,y:options.stamp.position==='bottom'?35:(page.getHeight()-height)/2,width,height,opacity:options.stamp.opacity});}
 }
 output.setProducer('Waraq PDF Studio');
 return output.save();
}
root.WaraqCore={compose};
})(globalThis);
