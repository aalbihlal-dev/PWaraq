const assert = require('node:assert/strict');
const fs = require('node:fs');
const PDFLib = require('../dist/vendor/pdf-lib.min.js');

(async () => {
  const {parsePageRanges,exportPageRange,editMetadata,mapToPdfBox,createImageOnlyPdf,describeForm,fillForm} = await import(require('node:url').pathToFileURL(require('node:path').join(require('node:path').join(__dirname,'..'),'dist/advanced.js')));
  assert.deepEqual(parsePageRanges('1, 3-5, 2',5),[0,2,3,4,1]);
  assert.deepEqual(parsePageRanges('٥-٣،١،١',5),[4,3,2,0,0]);
  assert.deepEqual(parsePageRanges('۲–۱',5),[1,0]);
  assert.deepEqual(parsePageRanges('الكل',3),[0,1,2]);
  for (const value of ['0','6','1,,2','1.5','1-','<script>','-1','2;3']) assert.throws(()=>parsePageRanges(value,5));
  assert.throws(()=>parsePageRanges('1',0));

  const source = await PDFLib.PDFDocument.create();
  source.addPage([200,400]);source.addPage([300,500]);source.addPage([400,600]);
  source.setTitle('CONFIDENTIAL TITLE');source.setAuthor('CONFIDENTIAL AUTHOR');
  const xml=source.context.register(source.context.stream('<metadata>CONFIDENTIAL XMP</metadata>',{Type:'Metadata',Subtype:'XML'}));
  source.catalog.set(PDFLib.PDFName.of('Metadata'),xml);
  const bytes=await source.save();
  const extracted=await PDFLib.PDFDocument.load(await exportPageRange(PDFLib,bytes,'3-2,1,1'));
  assert.deepEqual(extracted.getPages().map((page)=>page.getWidth()),[400,300,200,200]);
  assert.equal(source.getPageCount(),3);
  const updated=await PDFLib.PDFDocument.load(await editMetadata(PDFLib,bytes,{title:'عنوان عربي',author:'Writer',subject:'Subject',keywords:'one, اثنان'}),{updateMetadata:false});
  assert.equal(updated.getTitle(),'عنوان عربي');assert.equal(updated.getAuthor(),'Writer');assert.equal(updated.getKeywords(),'one اثنان');
  assert.equal(updated.catalog.has(PDFLib.PDFName.of('Metadata')),false);
  const stripped=await PDFLib.PDFDocument.load(await editMetadata(PDFLib,bytes,{},true),{updateMetadata:false});
  assert.equal(stripped.context.trailerInfo.Info,undefined);
  assert.equal(stripped.catalog.has(PDFLib.PDFName.of('Metadata')),false);
  assert.equal(stripped.getPageCount(),3);
  assert.equal(stripped.context.enumerateIndirectObjects().some(([,obj])=>obj.toString().includes('CONFIDENTIAL')),false,'Removed metadata should not survive as orphan objects');

  const normal={width:200,height:400,convertToPdfPoint:(x,y)=>[x,400-y]};
  assert.deepEqual(mapToPdfBox(normal,{x:.1,y:.2,w:.3,h:.1}),{x:20,y:280,width:60,height:40,angle:0});
  const rotated={width:400,height:200,convertToPdfPoint:(x,y)=>[y,x]};
  assert.deepEqual(mapToPdfBox(rotated,{x:.1,y:.2,w:.3,h:.1}),{x:60.00000000000001,y:40,width:120,height:20.000000000000007,angle:90});

  // A fresh image-only document cannot retain the source document's object graph.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  const imageBytes=await createImageOnlyPdf(PDFLib,[{bytes:png,width:200,height:400}]);
  const imageDoc=await PDFLib.PDFDocument.load(imageBytes,{updateMetadata:false});
  assert.equal(imageDoc.getPageCount(),1);assert.equal(imageDoc.getPage(0).getWidth(),200);
  assert.equal(imageDoc.getForm().getFields().length,0);assert.equal(imageDoc.getTitle(),undefined);
  assert.equal(imageDoc.catalog.has(PDFLib.PDFName.of('Names')),false);
  assert.equal(imageDoc.catalog.has(PDFLib.PDFName.of('Metadata')),false);
  assert.equal(imageDoc.context.enumerateIndirectObjects().some(([,obj])=>obj.toString().includes('CONFIDENTIAL')),false);
  await assert.rejects(()=>createImageOnlyPdf(PDFLib,[]));

  const originalForm=await PDFLib.PDFDocument.create(),page=originalForm.addPage([400,500]),form=originalForm.getForm();
  const name=form.createTextField('Name');name.setText('Old name');name.addToPage(page,{x:30,y:400,width:200,height:30});
  const arabic=form.createTextField('Arabic');arabic.addToPage(page,{x:30,y:350,width:200,height:30});
  const checkbox=form.createCheckBox('Agreed');checkbox.addToPage(page,{x:30,y:300,width:20,height:20});
  const dropdown=form.createDropdown('Choice');dropdown.addOptions(['One','Two']);dropdown.select('One');dropdown.addToPage(page,{x:30,y:250,width:150,height:30});
  const radio=form.createRadioGroup('Radio');radio.addOptionToPage('Yes',page,{x:30,y:200,width:20,height:20});radio.addOptionToPage('No',page,{x:60,y:200,width:20,height:20});
  const originalBytes=await originalForm.save();
  assert.deepEqual(describeForm(PDFLib,originalForm).map(({type})=>type),['text','text','checkbox','dropdown','radio']);
  let imageCalls=0;
  const filled=await PDFLib.PDFDocument.load(await fillForm(PDFLib,originalBytes,{Name:'New name',Arabic:'عبد الله',Agreed:true,Choice:'Two',Radio:'Yes'},async(text,width,height)=>{assert.equal(text,'عبد الله');assert.ok(width>0&&height>0);imageCalls++;return png;}));
  assert.equal(imageCalls,1,'Arabic field uses a shaped browser text image');
  assert.equal(filled.getPageCount(),1);assert.equal(filled.getForm().getFields().length,0,'Exported forms are flattened');
  const unchanged=await PDFLib.PDFDocument.load(originalBytes);assert.equal(unchanged.getForm().getTextField('Name').getText(),'Old name');assert.equal(unchanged.getForm().getCheckBox('Agreed').isChecked(),false);
  console.log('PASS: Arabic/English/reversed/repeated page ranges, range validation, metadata edit and physical removal, rotated placement, clean image-only PDF, checkbox/radio/dropdown/text form filling, Arabic field appearance callback, form flattening and original preservation');
})().catch((error)=>{console.error(error);process.exitCode=1;});
