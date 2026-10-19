const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const bundled=path.join(require('node:path').join(__dirname,'..'),'dist/vendor/pdf-lib.min.js');
const PDFLib=require(fs.existsSync(bundled)?bundled:path.resolve(require('node:path').join(__dirname,'..'),'../../waraq/dist/vendor/pdf-lib.min.js'));
(async()=>{
  const {applyColorEffect,parsePages,gradientGeometry,hexToRgb,cssGradient}=await import(require('node:url').pathToFileURL(require('node:path').join(require('node:path').join(__dirname,'..'),'dist/color-tools.js')));
  const {PDFDocument,PDFName,PDFArray,PDFDict,StandardFonts,degrees}=PDFLib;

  assert.deepEqual(parsePages('all',4),[0,1,2,3]);
  assert.deepEqual(parsePages('',2),[0,1]);
  assert.deepEqual(parsePages('3, 1-2, 2',5),[0,1,2]);
  assert.deepEqual(parsePages('4-',5),[3,4]);
  assert.deepEqual(parsePages('-2',5),[0,1]);
  assert.deepEqual(parsePages('١-٢،٤',5),[0,1,3]);
  assert.deepEqual(parsePages('الكل',2),[0,1]);
  for(const bad of ['0','6','3-2','x','1--2','1 2',',','1,,2','1,',',1','9007199254740992'])assert.throws(()=>parsePages(bad,5),bad);
  for(const bad of [0,-1,NaN,Infinity,1.5])assert.throws(()=>parsePages('all',bad));
  assert.deepEqual(hexToRgb('#ff0080').map((n)=>Math.round(n*255)),[255,0,128]);
  assert.throws(()=>hexToRgb('red'));
  assert.equal(cssGradient(['#000','#fff'],{angle:90}),'linear-gradient(90deg, #000, #fff)');

  // Angle 180 = top to bottom; 90 = left to right; corners land on 0% and 100% like CSS.
  let g=gradientGeometry({width:100,height:200},{angle:180});
  assert.deepEqual(g.start.map((n)=>Math.round(n)+0),[50,200]);assert.deepEqual(g.end.map((n)=>Math.round(n)+0),[50,0]);
  g=gradientGeometry({width:100,height:200},{angle:90});
  assert.deepEqual(g.start.map((n)=>Math.round(n)+0),[0,100]);assert.deepEqual(g.end.map((n)=>Math.round(n)+0),[100,100]);
  g=gradientGeometry({width:100,height:200},{area:'top',band:25});
  assert.deepEqual(g.rect,{x:0,y:150,w:100,h:50});
  g=gradientGeometry({width:300,height:400},{style:'radial'});
  assert.equal(g.radius,250);
  for(const bad of [{style:'conic'},{area:'side'},{angle:NaN},{angle:Infinity},{band:0},{band:101}])assert.throws(()=>gradientGeometry({width:100,height:200},bad));

  // Build a source PDF: one text page, one rotated page with a CropBox offset, one blank page.
  const src=await PDFDocument.create(),font=await src.embedFont(StandardFonts.Helvetica);
  src.addPage([300,400]).drawText('Waraq gradient test',{x:30,y:300,size:18,font});
  const rotated=src.addPage([400,300]);rotated.setRotation(degrees(90));rotated.setCropBox(50,20,300,260);rotated.drawText('Rotated',{x:60,y:60,size:14,font});
  src.addPage([200,200]);
  const bytes=await src.save();

  for(const effect of ['tint','recolor','wash','lighten','contrast','soft'])for(const style of ['linear','radial']){
    const out=await applyColorEffect(PDFLib,bytes,{colors:['#0f766e','#facc15','#a7f3d0'],effect,style,angle:135,opacity:0.5,placement:'behind'});
    const doc=await PDFDocument.load(out);assert.equal(doc.getPageCount(),3);
    for(const page of doc.getPages()){
      const res=page.node.Resources(),gs=res.lookup(PDFName.of('ExtGState'),PDFDict),sh=res.lookup(PDFName.of('Shading'),PDFDict);
      const gsDict=gs.lookup(gs.keys()[0],PDFDict),shDict=sh.lookup(sh.keys()[0],PDFDict);
      assert.equal(gsDict.get(PDFName.of('ca')).asNumber(),0.5);
      assert.equal(shDict.get(PDFName.of('ShadingType')).asNumber(),style==='radial'?3:2);
      const fn=shDict.lookup(PDFName.of('Function'),PDFDict);assert.equal(fn.get(PDFName.of('FunctionType')).asNumber(),3,'three colors use a stitching function');
      const contents=page.node.Contents();assert.ok(contents instanceof PDFArray);
      const streams=contents.asArray().map((r)=>Buffer.from(doc.context.lookup(r).getContents()).toString('latin1'));
      const own=streams.findIndex((s)=>/\/WaraqSh\w+ sh/.test(s));assert.ok(own>=0,'gradient stream present');
      if(effect==='wash')assert.equal(own,0,'behind places the gradient first');else assert.equal(own,streams.length-1,'other effects draw on top');
    }
  }

  // Only the selected pages change, and the source text survives (no rasterizing).
  const one=await PDFDocument.load(await applyColorEffect(PDFLib,bytes,{pages:'2',area:'bottom',band:20}));
  assert.equal(one.getPage(0).node.Resources().lookup(PDFName.of('Shading')),undefined);
  assert.ok(one.getPage(1).node.Resources().lookup(PDFName.of('Shading'),PDFDict));
  const firstText=one.getPage(0).node.Contents();assert.ok(firstText);
  // The rotated page's clip rectangle stays inside its CropBox.
  const rotStreams=one.getPage(1).node.Contents().asArray().map((r)=>Buffer.from(one.context.lookup(r).getContents()).toString('latin1')).join('');
  const [x,y,w,h]=rotStreams.match(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re W n/).slice(1).map(Number);
  assert.ok(x>=50&&y>=20&&x+w<=350.001&&y+h<=280.001,'clip inside CropBox');
  assert.ok(Math.abs(x-290)<0.01&&Math.abs(w-60)<0.01&&Math.abs(h-260)<0.01,'bottom band of a 90-degree page is a 20% strip along the user-space right edge');

  // Shared inherited resources and shared content arrays must not cross-contaminate pages.
  const shared=await PDFDocument.create(),sharedPages=[shared.addPage([100,200]),shared.addPage([300,400]),shared.addPage([500,600])];
  const inherited=shared.context.obj({ExtGState:{Existing:{Type:'ExtGState',ca:1}},Shading:{Existing:{ShadingType:2,ColorSpace:'DeviceRGB',Coords:[0,0,0,10],Function:{FunctionType:2,Domain:[0,1],C0:[0,0,0],C1:[1,1,1],N:1},Extend:[true,true]}}});
  const resourcesRef=shared.context.register(inherited);
  const originalStream=shared.context.register(shared.context.stream('2 0 0 2 3 4 cm\n'));
  const contentsRef=shared.context.register(shared.context.obj([originalStream]));
  for(const page of sharedPages){page.node.set(PDFName.of('Resources'),resourcesRef);page.node.set(PDFName.of('Contents'),contentsRef);}
  const sharedOut=await PDFDocument.load(await applyColorEffect(PDFLib,await shared.save(),{pages:'1,2',angle:180}));
  const untouched=sharedOut.getPage(2);assert.equal(untouched.node.Resources().lookup(PDFName.of('Shading'),PDFDict).keys().length,1,'unselected shared resources are untouched');
  assert.equal(untouched.node.Contents().size(),1,'unselected shared Contents is untouched');
  for(const [index,height]of[[0,200],[1,400]]){
    const dictionary=sharedOut.getPage(index).node.Resources().lookup(PDFName.of('Shading'),PDFDict);
    const name=dictionary.keys().find((key)=>key.toString().startsWith('/WaraqSh'));
    const coords=dictionary.lookup(name,PDFDict).lookup(PDFName.of('Coords'),PDFArray).asArray().map((value)=>value.asNumber());
    assert.ok(Math.abs(coords[1]-height)<.001,'each page keeps its own gradient geometry');
    const streams=sharedOut.getPage(index).node.Contents().asArray().map((ref)=>Buffer.from(sharedOut.context.lookup(ref).getContents()).toString('latin1'));
    assert.equal(streams[0],'q\n');assert.equal(streams[streams.length-2],'Q\n','original transform is restored before the effect');
  }

  // A CropBox partially outside the MediaBox is clipped to what PDF viewers show.
  const clipped=await PDFDocument.create(),clippedPage=clipped.addPage([100,200]);clippedPage.setCropBox(-50,20,200,300);
  const clippedOut=await PDFDocument.load(await applyColorEffect(PDFLib,await clipped.save()));
  const clipContents=clippedOut.getPage(0).node.Contents().asArray().map((ref)=>Buffer.from(clippedOut.context.lookup(ref).getContents()).toString('latin1')).join('');
  assert.match(clipContents,/0 20 100 180 re W n/);

  // Visual bottom bands and 0-degree gradient direction remain correct for all rotations.
  for(const rotation of [0,90,180,270]){
    const source=await PDFDocument.create(),page=source.addPage([400,500]);page.setCropBox(20,30,200,300);page.setRotation(degrees(rotation));
    const result=await PDFDocument.load(await applyColorEffect(PDFLib,await source.save(),{area:'bottom',band:20,angle:0,opacity:0}));
    const resources=result.getPage(0).node.Resources(),dictionary=resources.lookup(PDFName.of('Shading'),PDFDict),shading=dictionary.lookup(dictionary.keys()[0],PDFDict);
    const coords=shading.lookup(PDFName.of('Coords'),PDFArray).asArray().map((value)=>value.asNumber());
    const [sx,sy,ex,ey]=coords;
    if(rotation===0)assert.ok(ey>sy&&Math.abs(ex-sx)<.001);
    if(rotation===90)assert.ok(ex<sx&&Math.abs(ey-sy)<.001);
    if(rotation===180)assert.ok(ey<sy&&Math.abs(ex-sx)<.001);
    if(rotation===270)assert.ok(ex>sx&&Math.abs(ey-sy)<.001);
    const state=resources.lookup(PDFName.of('ExtGState'),PDFDict);assert.equal(state.lookup(state.keys()[0],PDFDict).lookup(PDFName.of('ca')).asNumber(),0,'zero opacity is preserved');
  }

  await assert.rejects(applyColorEffect(PDFLib,bytes,{pages:'9'}));
  await assert.rejects(applyColorEffect(PDFLib,bytes,{effect:'nope'}));
  for(const bad of [{effect:'__proto__'},{opacity:NaN},{opacity:Infinity},{opacity:-.1},{opacity:1.1},{opacity:''},{colors:'#ff0000'},{colors:['#ff0000']},{colors:['#000000','#111111','#222222','#333333']},{placement:'unknown'},{area:'side'},{style:'conic'}])await assert.rejects(applyColorEffect(PDFLib,bytes,bad));
  console.log('PASS: color ranges/input validation, Arabic digits, all blends/shading types, crop intersections, all rotations, shared-resource/content isolation, transform restoration and source content preservation');
})().catch((e)=>{console.error(e);process.exit(1);});
