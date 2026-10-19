const assert=require('node:assert/strict');
const PDFLib=require('../dist/vendor/pdf-lib.min.js');
(async()=>{
  const {bookletOrder,placementForPage,imposePDF,differencePixels,grayscalePixels}=await import(require('node:url').pathToFileURL(require('node:path').join(require('node:path').join(__dirname,'..'),'dist/more-tools.js')));
  assert.deepEqual(bookletOrder(8),[[7,0],[1,6],[5,2],[3,4]]);
  assert.deepEqual(bookletOrder(5),[[null,0],[1,null],[null,2],[3,4]]);
  assert.deepEqual(bookletOrder(4,true),[[0,3],[2,1]]);
  assert.throws(()=>bookletOrder(0));
  for(const rotation of [0,90,180,270]){
    const p=placementForPage({width:200,height:400},rotation,{x:10,y:20,width:300,height:300});
    assert.equal(p.width,150);assert.equal(p.height,300);assert.equal(p.rotation,-rotation);
    const rad=p.rotation*Math.PI/180,points=[[0,0],[p.width,0],[0,p.height],[p.width,p.height]].map(([x,y])=>[p.x+x*Math.cos(rad)-y*Math.sin(rad),p.y+x*Math.sin(rad)+y*Math.cos(rad)]);
    assert.ok(Math.min(...points.map(([x])=>x))>=10-1e-9);assert.ok(Math.max(...points.map(([x])=>x))<=310+1e-9);
    assert.ok(Math.min(...points.map(([,y])=>y))>=20-1e-9);assert.ok(Math.max(...points.map(([,y])=>y))<=320+1e-9);
  }
  const source=await PDFLib.PDFDocument.create();
  for(let i=0;i<5;i++){const page=source.addPage([200,400]);page.drawText(`Original searchable page ${i+1}`,{x:20,y:200,size:10});if(i===1)page.setRotation(PDFLib.degrees(90));if(i===2)page.setCropBox(10,20,170,340);}
  const bytes=await source.save();
  const resized=await PDFLib.PDFDocument.load(await imposePDF(PDFLib,bytes,{paper:'letter'}));assert.equal(resized.getPageCount(),5);assert.equal(resized.getPage(0).getWidth(),612);assert.equal(resized.getPage(0).getHeight(),792);
  const nup=await PDFLib.PDFDocument.load(await imposePDF(PDFLib,bytes,{columns:2,rows:2,landscape:true}));assert.equal(nup.getPageCount(),2);assert.equal(nup.getPage(0).getWidth(),841.89);
  const booklet=await PDFLib.PDFDocument.load(await imposePDF(PDFLib,bytes,{booklet:true}));assert.equal(booklet.getPageCount(),4);
  const resources=booklet.getPage(0).node.Resources().lookup(PDFLib.PDFName.of('XObject'),PDFLib.PDFDict);assert.equal(resources.keys().length,1,'Blank padded booklet slot has no content');
  assert.equal(source.getPageCount(),5);assert.equal(source.getPage(1).getRotation().angle,90);
  const blank=await PDFLib.PDFDocument.create();blank.addPage([200,400]);
  assert.equal((await PDFLib.PDFDocument.load(await imposePDF(PDFLib,await blank.save(),{booklet:true}))).getPageCount(),2);
  await assert.rejects(()=>imposePDF(PDFLib,bytes,{columns:4,rows:4,margin:100,gap:101}));
  const before=Uint8ClampedArray.from([255,255,255,255,0,0,0,255]),after=Uint8ClampedArray.from([255,255,255,255,100,100,100,255]);
  assert.equal(differencePixels(before,after,30).changed,1);assert.equal(differencePixels(before,after,30).ratio,.5);assert.equal(differencePixels(before,after,150).changed,0);
  assert.equal(differencePixels(before,before).changed,0);assert.throws(()=>differencePixels(before,new Uint8ClampedArray(4)));
  const gray=grayscalePixels(Uint8ClampedArray.from([255,0,0,255,0,255,0,80]));assert.deepEqual([...gray],[76,76,76,255,150,150,150,80]);
  console.log('PASS: booklet pairing and blank padding, RTL order, four rotated fit placements, resize, 4-up sheets, vector content embedding, original preservation, invalid layouts, visual diff threshold and grayscale conversion');
})().catch((error)=>{console.error(error);process.exitCode=1;});
