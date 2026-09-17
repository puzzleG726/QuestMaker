const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs/promises');
const modules=process.env.QUESTMAKER_TEST_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(modules,'playwright'));
const sharp=require(path.join(modules,'sharp'));
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1200},acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const out='/tmp/questmaker-layouts';await fs.mkdir(out,{recursive:true});
  const open=async n=>{if(await page.locator('#editorView').isVisible())await page.locator('#homeButton').click();await page.locator('[data-open="'+n+'"]').click();await page.waitForTimeout(70);};
  const num=async(s,v)=>{if(await page.locator(s).getAttribute('type')==='range')await page.locator(s).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},String(v));else await page.locator(s).fill(String(v));await page.locator(s).dispatchEvent('change');await page.waitForTimeout(70);};
  const color=async(s,v)=>page.locator(s).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},v);
  const bg=s=>page.locator(s).evaluate(e=>getComputedStyle(e).backgroundColor);
  const drag=async(s,x,y)=>{const b=await page.locator(s).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(x,y,{steps:12});await page.mouse.up();await page.waitForTimeout(80);};
  const download=async name=>{await page.locator('#exportButton').click();const wait=page.waitForEvent('download');await page.locator('#downloadButton').click();const file=await wait;await file.saveAs(path.join(out,name));const stats=await sharp(path.join(out,name)).stats();assert(stats.channels.some(c=>c.stdev>10));return sharp(path.join(out,name)).metadata();};
  try{
    await page.goto('file://'+path.resolve('index.html'));await open(3);
    assert.equal(await page.locator('#sheet .shared-scale-title').count(),3);
    assert.equal(await page.locator('[data-theme]').count(),2);
    await color('[data-theme="0"]','#ee3355');await color('[data-theme="1"]','#22aacc');
    assert.equal(await bg('#sheet [data-knob="voice-0"]'),'rgb(238, 51, 85)');assert.equal(await bg('#sheet [data-knob="voice-1"]'),'rgb(34, 170, 204)');
    const choice='#sheet [data-check="choices-0-0"]',cycle=[];
    for(let i=0;i<4;i++){await page.locator(choice).click();cycle.push(await bg(choice));}
    assert.deepEqual(cycle,['rgb(230, 127, 133)','rgb(137, 185, 199)','rgb(214, 186, 107)','rgba(0, 0, 0, 0)']);
    await page.locator('#addCheckOption').click();assert.equal(await page.locator('#sheet [data-component="choices"] .choice').count(),8);
    await page.locator('#sheet [data-text="choices-0-choice-0"]').click();await num('#optionCount',6);assert.equal(await page.locator('#sheet [data-component="choices"] .choice').count(),12);
    await page.locator('#sheet [data-knob="voice-0"]').click();await page.locator('#knobShape').selectOption('rectangle');await num('#knobLength',54);
    assert.equal(await page.locator('#sheet [data-knob="voice-0"]').evaluate(e=>e.offsetWidth),54);
    await page.locator('#knobShape').selectOption('circle');assert.equal(await page.locator('#sheet [data-knob="voice-0"]').evaluate(e=>getComputedStyle(e).borderRadius),'50%');
    await page.locator('#knobShape').selectOption('heart');assert.equal(await page.locator('#sheet [data-knob="voice-0"] svg').count(),1);
    await color('#knobColor','#e00088');await color('[data-theme="0"]','#119955');assert.equal(await page.locator('#sheet [data-knob="voice-0"]').evaluate(e=>getComputedStyle(e).color),'rgb(224, 0, 136)');
    await page.locator('#resetKnobColor').click();assert.equal(await page.locator('#sheet [data-knob="voice-0"]').evaluate(e=>getComputedStyle(e).color),'rgb(17, 153, 85)');
    await page.screenshot({path:path.join(out,'compat-dual.png'),fullPage:true});await download('compat-dual-export.png');
    await page.locator('#people').selectOption('1');await page.waitForTimeout(80);
    assert.equal(await page.locator('[data-theme]').count(),1);
    const area=await page.locator('#sheet [data-image="portrait-0"]').evaluate(e=>e.offsetWidth*e.offsetHeight);assert(area/(624*832)>.2&&area/(624*832)<.27);
    const portrait=await page.locator('#sheet [data-image="portrait-0"]').boundingBox(),scale=await page.locator('#sheet [data-component="voice"]').boundingBox();assert(portrait.x>scale.x+scale.width);
    await page.screenshot({path:path.join(out,'compat-single.png'),fullPage:true});await download('compat-single-export.png');
    await page.locator('#sheet [data-text="title"]').click();await page.locator('#addText').click();
    const text=page.locator('#sheet [data-kind="text"] .rich');assert.equal(await text.getAttribute('data-preset'),'title2');
    const id=await text.evaluate(e=>e.closest('[data-component]').dataset.component);await page.locator('#componentSlot').selectOption('left');
    assert.equal(await text.evaluate(e=>e.offsetWidth),await page.locator('#sheet [data-component="voice"]').evaluate(e=>e.offsetWidth));
    await page.locator('#sheet [data-drag-block="'+id+'"]').scrollIntoViewIfNeeded();
    // Keep source and destination visible while testing a widget reorder.
    await page.setViewportSize({width:1440,height:2600});await page.evaluate(()=>scrollTo(0,0));
    const target=await page.locator('#sheet [data-component="pace"]').boundingBox();
    await drag('#sheet [data-drag-block="'+id+'"]',target.x+10,target.y+3);
    const order=await page.locator('#sheet [data-component]').evaluateAll(es=>es.map(e=>e.dataset.component));assert(order.includes(id)&&order.indexOf(id)<order.indexOf('pace'));
    assert.equal(await page.locator('#sheet [data-component="'+id+'"] .rich').evaluate(e=>e.offsetWidth),await page.locator('#sheet .compat-body').evaluate(e=>e.offsetWidth));
    await page.locator('#undoButton').click();await page.locator('#redoButton').click();assert.equal(await page.locator('#sheet [data-kind="text"]').count(),1);
    await page.locator('#editLegends').click();for(let i=0;i<3;i++)await page.locator('[data-delete-legend]').first().click();
    await page.locator(choice).click();assert.equal(await bg(choice),'rgb(17, 153, 85)');await page.locator(choice).click();assert.equal(await page.locator(choice).getAttribute('aria-checked'),'false');

    await open(2);await num('#nodeCount',24);
    const overlaps=await page.locator('#sheet .relation-map').evaluate(map=>{const boxes=[...map.querySelectorAll('[data-image],.node-name')].map(el=>({name:el.dataset.image||el.dataset.text,r:el.getBoundingClientRect()}));return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>1&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>1).map(b=>a.name+':'+b.name));});
    assert.deepEqual(overlaps,[],'24-node labels/images do not intersect');
    await page.locator('#showLabels').uncheck();assert.equal(await page.locator('#sheet .node-name').count(),0);await page.locator('#showLabels').check();
    await page.locator('#linkMode').click();await page.locator('#sheet [data-image="node-0"]').click();await page.locator('#sheet [data-image="node-9"]').click();
    assert(await page.locator('#lineToolbar').isVisible());assert.equal(await page.locator('#selectionProperties #edgeWidth').count(),0);
    await color('#edgeColor','#ef3355');await page.locator('#edgeStart').selectOption('circle');await page.locator('#edgeEnd').selectOption('bar');await num('#edgeWidth',6);
    assert.equal(await page.locator('#sheet .edge-line').getAttribute('stroke'),'#ef3355');
    const oldPath=await page.locator('#sheet .edge-line').getAttribute('d'),center=await page.locator('#sheet [data-edge-handle="center"]').boundingBox();await drag('#sheet [data-edge-handle="center"]',center.x+100,center.y-30);assert.notEqual(await page.locator('#sheet .edge-line').getAttribute('d'),oldPath);
    const end=await page.locator('#sheet [data-image="node-12"]').boundingBox();await drag('#sheet [data-edge-handle="end"]',end.x+end.width/2,end.y+end.height/2);
    const attached=await page.locator('#sheet [data-edge-handle="end"]').boundingBox(),distance=Math.hypot(attached.x+attached.width/2-end.x-end.width/2,attached.y+attached.height/2-end.y-end.height/2);assert(Math.abs(distance-end.width/66*37)<2,'Endpoint attaches 4px outside the 33px avatar radius at the current zoom');
    await page.locator('#edgeText').click();await page.locator('#sheet .edge-text .rich').fill('一起冒险');await num('#fontSize',24);assert.equal(await page.locator('#sheet .edge-text .rich').evaluate(e=>getComputedStyle(e).fontSize),'24px');
    await page.screenshot({path:path.join(out,'relation-24.png'),fullPage:true});const meta=await download('relation-export.png');assert.equal(meta.width,meta.height);

    await open(0);await page.locator('#sheet [data-image="rank-0-0"]').click();const picker=page.waitForEvent('filechooser');await page.locator('#replaceImage').click();const image=await sharp({create:{width:80,height:120,channels:3,background:'#3a99bb'}}).png().toBuffer();await (await picker).setFiles([{name:'one.png',mimeType:'image/png',buffer:image},{name:'two.png',mimeType:'image/png',buffer:image}]);
    await page.waitForFunction(()=>document.querySelectorAll('#sheet .rank-picture').length===2);await page.waitForTimeout(100);
    const containment=()=>page.locator('#sheet .rank-picture').evaluateAll(es=>{const r=document.querySelector('#sheet [data-frame="rank-0-0"]').getBoundingClientRect();return es.every(e=>{const b=e.getBoundingClientRect();return b.top>=r.top-.5&&b.bottom<=r.bottom+.5;});});
    assert(await containment());let img=await page.locator('#sheet .rank-picture').first().boundingBox(),frame=await page.locator('#sheet [data-frame="rank-0-0"]').boundingBox();assert(Math.abs(img.x-frame.x)<1&&Math.abs(img.height-frame.height)<1);
    await page.locator('#sheet .rank-picture').first().click();await page.locator('[data-picture-align="right"]').click();const right=await page.locator('#sheet .rank-picture').last().boundingBox();assert(Math.abs(right.x+right.width-frame.x-frame.width)<1);
    await page.locator('[data-picture-align="center"]').click();assert(await containment());
    await num('#rankHeight',500);assert(await containment());
    await page.screenshot({path:path.join(out,'rank.png'),fullPage:true});await download('rank-export.png');
    await page.setViewportSize({width:390,height:844});for(const mode of [0,2,3]){await open(mode);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'mobile-'+mode+'.png'),fullPage:true});}
    assert.deepEqual(errors,[]);console.log('PASS: theme palettes, checkbox cycles/options, knob shapes, widget reorder/text, single layout, 24-node overlap, line toolbar/handles/text/export, aligned full-height rank photos, mobile.');
  }catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
