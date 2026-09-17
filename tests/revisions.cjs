const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const modules=process.env.QUESTMAKER_TEST_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(modules,'playwright'));
const sharp=require(path.join(modules,'sharp'));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const output='/tmp/questmaker-revisions';await fs.mkdir(output,{recursive:true});
 const num=async(s,v)=>{await page.locator(s).fill(String(v));await page.locator(s).dispatchEvent('change')};
 const open=async n=>{if(await page.locator('#editorView').isVisible())await page.locator('#homeButton').click();await page.locator('[data-open="'+n+'"]').click()};
 const drag=async(locator,x,y)=>{const b=await locator.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(x,y,{steps:12});await page.mouse.up();await page.waitForTimeout(70)};
 const exportPNG=async name=>{await page.locator('#exportButton').click();const wait=page.waitForEvent('download');await page.locator('#downloadButton').click();const d=await wait;await d.saveAs(path.join(output,name));return sharp(path.join(output,name)).metadata()};
 try{
  await page.goto('file://'+path.resolve('index.html'));
  await open(2);
  assert.equal(await page.locator('#legendCount').count(),0);
  assert.deepEqual(await page.locator('[data-legend-name]').evaluateAll(es=>es.map(e=>e.value)),['本命','可以接受','CB','雷']);
  assert.equal(await page.locator('#sheet').evaluate(e=>e.offsetWidth===e.offsetHeight),true);
  await page.locator('#linkMode').click();
  await page.locator('#sheet [data-image="node-0"]').click();await page.locator('#sheet [data-image="node-3"]').click();
  await page.locator('#sheet .edge-hit').click({force:true});
  await num('#edgeWidth',7);
  const center=await page.locator('#sheet [data-edge-handle="center"]').boundingBox();
  await drag(page.locator('#sheet [data-edge-handle="center"]'),center.x+80,center.y);
  await page.locator('#edgeStart').selectOption('arrow');await page.locator('#edgeText').click();await page.locator('#sheet .edge-text .rich').fill('一起冒险');
  assert.equal(await page.locator('#sheet .edge-line').getAttribute('stroke-width'),'7');
  assert((await page.locator('#sheet .edge-line').getAttribute('d')).includes(' Q '));
  assert.equal(await page.locator('#sheet .edge-text .rich').textContent(),'一起冒险');
  await page.locator('#edgeLegend').selectOption('code-2');
  const color=await page.locator('#sheet .edge-line').getAttribute('stroke');
  await page.locator('#undoButton').click();await page.locator('#redoButton').click();assert.equal(await page.locator('#sheet .edge-line').getAttribute('stroke'),color);
  await page.locator('#editLegends').click();
  await page.locator('[data-drag-legend="code-2"]').scrollIntoViewIfNeeded();
  const row=await page.locator('[data-legend-row="code-0"]').boundingBox();
  await drag(page.locator('[data-drag-legend="code-2"]'),row.x+row.width/2,row.y+row.height/2);
  assert.equal(await page.locator('[data-legend-row]').first().getAttribute('data-legend-row'),'code-2');
  assert.equal(await page.locator('#sheet .edge-line').getAttribute('stroke'),color);
  await page.locator('[data-delete-legend="code-1"]').click();await page.locator('#addLegend').click();
  assert.equal(await page.locator('[data-legend-row]').count(),4);
  await page.locator('#legendPosition').selectOption('bottom-left');
  assert(await page.locator('#sheet .corner-legend.bottom-left').isVisible());
  const square=await exportPNG('relation.png');assert.equal(square.width,await page.locator('#sheet').evaluate(e=>e.offsetWidth*2));assert.equal(square.height,await page.locator('#sheet').evaluate(e=>e.offsetHeight*2));
  await page.locator('#legendPosition').selectOption('top-right');
  await page.screenshot({path:path.join(output,'relation-desktop.png'),fullPage:true});

  await open(1);await num('#rows',1);
  await page.locator('#sheet [data-image="grid-0"]').click();await page.locator('#addFrameText').click();
  await page.locator('#sheet [data-text="frame-grid-0"]').fill('大字小字');
  await page.locator('#sheet [data-text="frame-grid-0"]').evaluate(el=>{el.focus();const r=document.createRange();r.setStart(el.firstChild,0);r.setEnd(el.firstChild,2);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'))});
  await num('#fontSize',32);await page.locator('#boldButton').click();
  assert(await page.locator('#sheet [data-text="frame-grid-0"]').evaluate(el=>[...el.querySelectorAll('span')].some(s=>s.style.fontSize==='32px')));
  await page.locator('#sheet [data-image="grid-0"]').click({position:{x:8,y:8}});await page.locator('#addFrameText').click();
  await page.locator('#sheet [data-image="grid-0"]').click({position:{x:8,y:8}});assert(await page.locator('#addFrameText').isDisabled());
  await page.locator('#sheet [data-text="title"]').click();await page.locator('#addText').click();
  const free=page.locator('#sheet .flow-text');assert.equal(await free.count(),1);
  const target=await page.locator('#sheet [data-frame="grid-1"]').boundingBox();
  await drag(free.locator('[data-drag-text]'),target.x+target.width/2,target.y-28);
  assert.equal(await page.locator('#sheet .frame-group .above-text').count(),1);
  const width=await page.locator('#sheet .above-text').evaluate(el=>el.offsetWidth);
  assert.equal(width,await page.locator('#sheet [data-frame="grid-1"]').evaluate(el=>el.offsetWidth));
  const tops=await page.locator('#sheet [data-frame]').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().top));assert(Math.max(...tops)-Math.min(...tops)<1);
  await page.locator('#undoButton').click();assert.equal(await page.locator('#sheet .above-text').count(),0);
  await page.locator('#redoButton').click();assert.equal(await page.locator('#sheet .above-text').count(),1);
  await num('#rows',2);assert.equal(await page.locator('#sheet .above-text').count(),1);
  await page.screenshot({path:path.join(output,'text-desktop.png'),fullPage:true});
  await exportPNG('text.png');

  await open(0);
  assert((await page.locator('#sheet .sheet-title').innerText()).includes('受害角色'));
  assert.deepEqual(await page.locator('#sheet .rank-number').allTextContents(),['1','2','3','4','5']);
  const image=await sharp({create:{width:80,height:120,channels:3,background:'#7fa9bf'}}).png().toBuffer();
  await page.locator('#sheet [data-image="rank-0-0"]').click();
  const picker=page.waitForEvent('filechooser');await page.locator('#replaceImage').click();
  await (await picker).setFiles([{name:'a.png',mimeType:'image/png',buffer:image},{name:'b.png',mimeType:'image/png',buffer:image}]);
  await page.waitForFunction(()=>document.querySelectorAll('#sheet .rank-picture').length===2);
  const imageBounds=await page.locator('#sheet .rank-picture').first().boundingBox();assert(Math.abs(imageBounds.width/imageBounds.height-2/3)<.02);
  await page.locator('#sheet .rank-picture').first().click();await page.locator('#pictureBoundary').selectOption('boundary');
  const line=await page.locator('#sheet [data-divider="0"]').boundingBox();
  await drag(page.locator('#sheet .rank-picture').first(),imageBounds.x+imageBounds.width/2,line.y+line.height/2);
  assert.equal(await page.locator('#pictureBoundary').inputValue(),'boundary');
  await num('#cols',2);
  const widthBefore=await page.locator('#sheet').evaluate(e=>e.offsetWidth);
  const right=await page.locator('#sheet [data-resize="width"]').boundingBox();
  await drag(page.locator('#sheet [data-resize="width"]'),right.x+100,right.y+50);
  assert((await page.locator('#sheet').evaluate(e=>e.offsetWidth))>widthBefore);
  const col=await page.locator('#sheet [data-resize="col"]').first().boundingBox();
  await drag(page.locator('#sheet [data-resize="col"]').first(),col.x+100,col.y+80);
  const horizontal=await page.locator('#sheet [data-divider="0"]').boundingBox();
  await drag(page.locator('#sheet [data-divider="0"]'),horizontal.x+250,horizontal.y+1800);
  const heights=await page.locator('#sheet .rank-row').evaluateAll(es=>es.map(e=>e.offsetHeight));assert(heights.every(h=>h>=80&&h<=500));
  assert.equal(await page.locator('#sheet .row-divider').count(),4);
  await num('#rankHeight',800);
  await page.screenshot({path:path.join(output,'rank-desktop.png'),fullPage:true});
  const rankExport=await exportPNG('rank.png');assert.equal(rankExport.width,await page.locator('#sheet').evaluate(e=>e.offsetWidth*2));
  for(const [type,key] of [[0,'rank-1-0'],[2,'node-2'],[3,'portrait-0']]){
    await open(type);
    if(type===3){await page.locator('#sheet [data-image="'+key+'"]').click();await page.locator('#addFrameText').click();await page.locator('#textPlacement').selectOption('free');}
    else{await page.locator('#sheet [data-text="title"]').click();await page.locator('#addText').click();await page.locator('#textPlacement').selectOption('free');}
    await page.locator('#sheet [data-frame="'+key+'"]').scrollIntoViewIfNeeded();
    const before=await page.locator('#sheet [data-frame="'+key+'"]').boundingBox();
    await drag(page.locator('#sheet .free-text [data-drag-text]').last(),before.x+before.width/2,before.y-28);
    const group=page.locator('#sheet [data-frame="'+key+'"]').locator('..');
    assert.equal(await group.locator('.above-text').count(),1,'above-frame snapping in mode '+type);
    assert.equal(await group.locator('.above-text').evaluate(e=>e.offsetWidth),await page.locator('#sheet [data-frame="'+key+'"]').evaluate(e=>e.offsetWidth));
    if(type===2){const after=await page.locator('#sheet [data-frame="'+key+'"]').boundingBox();assert(Math.abs(before.y-after.y)<1);}
    if(type===0){const box=await page.locator('#sheet [data-frame="'+key+'"]').boundingBox(),row=await page.locator('#sheet [data-row="1"]').boundingBox();assert(box.y+box.height<=row.y+row.height+1);}
  }
  for(const viewport of [{width:390,height:844},{width:320,height:844}]){
    await page.setViewportSize(viewport);for(const type of [0,1,2,3]){await open(type);await page.waitForTimeout(60);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
  }
  await open(2);await page.screenshot({path:path.join(output,'relation-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: legend reorder/delete/add, square relationship export, line editing, partial text styles, two text areas, drag snapping, multi-image rows, crossing borders, resize limits, mobile layout.');
 }catch(error){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
