const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const modules=process.env.QUESTMAKER_TEST_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(modules,'playwright'));
const sharp=require(path.join(modules,'sharp'));

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const text=key=>page.locator('#sheet [data-text="'+key+'"]');
  const open=async n=>{if(await page.locator('#editorView').isVisible())await page.locator('#homeButton').click();await page.locator('[data-open="'+n+'"]').click();};
  const select=async(key,start,end)=>{
    await text(key).dispatchEvent('pointerdown');
    await text(key).evaluate((el,{start,end})=>{
      el.focus();const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];let offset=0;
      while(w.nextNode()){nodes.push({node:w.currentNode,start:offset,end:offset+w.currentNode.length});offset+=w.currentNode.length;}
      const a=nodes.find(n=>start>=n.start&&start<=n.end),b=nodes.find(n=>end>=n.start&&end<=n.end),r=document.createRange();r.setStart(a.node,start-a.start);r.setEnd(b.node,end-b.start);
      getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));
    },{start,end});
  };
  const colors=key=>text(key).evaluate(el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),result=[];while(w.nextNode())for(const c of w.currentNode.textContent)result.push({c,color:getComputedStyle(w.currentNode.parentElement).color});return result;});
  const begin=async(key,keyboard=false)=>{
    if(!keyboard)await page.locator('#textColor').dispatchEvent('pointerdown');
    await page.locator('#textColor').focus();
    // Native color dialogs may collapse or clear the document selection after focus moves.
    await text(key).evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));});
  };
  const paint=async(value,event='input')=>{await page.locator('#textColor').evaluate((el,{value,event})=>{el.value=value;el.dispatchEvent(new Event(event,{bubbles:true}));},{value,event});await page.waitForTimeout(50);};
  try{
    await page.goto('file://'+path.resolve('index.html'));await open(1);
    await text('title').fill('关于我的喜欢。');const base=await colors('title');
    await select('title',2,4);await begin('title');await paint('#ee3355');
    let result=await colors('title');assert.deepEqual(result.map(v=>v.color),base.map((v,i)=>i>=2&&i<4?'rgb(238, 51, 85)':v.color),'Opening a color picker must not turn a partial edit into a whole-box edit');
    await paint('#119955');await page.evaluate(()=>{getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'));});await paint('#2288ee','change');result=await colors('title');assert.deepEqual(result.map(v=>v.color),base.map((v,i)=>i>=2&&i<4?'rgb(34, 136, 238)':v.color));
    await select('title',4,6);await begin('title',true);await paint('#aa22cc');
    const before=await colors('title');assert.equal(before[2].color,'rgb(34, 136, 238)');assert.equal(before[4].color,'rgb(170, 34, 204)');assert.equal(before[0].color,base[0].color);
    await page.locator('#undoButton').click();assert.equal((await colors('title'))[4].color,base[4].color);await page.locator('#redoButton').click();assert.deepEqual(await colors('title'),before);
    await page.locator('#rows').fill('2');await page.locator('#rows').dispatchEvent('change');assert.deepEqual(await colors('title'),before);
    // A range across existing spans changes only those characters and preserves other formatting.
    await select('title',3,5);await page.locator('#fontSize').fill('28');await page.locator('#fontSize').dispatchEvent('change');await page.locator('#boldButton').click();
    await select('title',3,5);await begin('title');await paint('#d97706');
    result=await colors('title');assert.equal(result[2].color,'rgb(34, 136, 238)');assert.equal(result[3].color,'rgb(217, 119, 6)');assert.equal(result[4].color,'rgb(217, 119, 6)');assert.equal(result[5].color,'rgb(170, 34, 204)');
    assert(await text('title').evaluate(el=>[...el.querySelectorAll('span')].some(s=>s.style.fontSize==='28px')));
    await text('grid-caption-0').fill('第一段\n第二段');await select('grid-caption-0',0,3);await begin('grid-caption-0');await paint('#e03050');const secondOffset=(await text('grid-caption-0').textContent()).indexOf('第二段');await select('grid-caption-0',secondOffset,secondOffset+3);await begin('grid-caption-0');await paint('#3060e0');
    assert.equal((await colors('grid-caption-0'))[0].color,'rgb(224, 48, 80)');assert.equal((await colors('grid-caption-0'))[secondOffset].color,'rgb(48, 96, 224)');assert((await text('grid-caption-0').innerText()).includes('\n'));
    await page.screenshot({path:'/tmp/questmaker-rich-color.png',fullPage:true});
    await page.locator('#exportButton').click();const wait=page.waitForEvent('download');await page.locator('#downloadButton').click();await (await wait).saveAs('/tmp/questmaker-rich-color-export.png');
    const pixels=await sharp('/tmp/questmaker-rich-color-export.png').removeAlpha().raw().toBuffer();let red=0,blue=0;for(let i=0;i<pixels.length;i+=3){if(Math.abs(pixels[i]-224)<5&&Math.abs(pixels[i+1]-48)<5&&Math.abs(pixels[i+2]-80)<5)red++;if(Math.abs(pixels[i]-48)<5&&Math.abs(pixels[i+1]-96)<5&&Math.abs(pixels[i+2]-224)<5)blue++;}assert(red>50&&blue>50,'Export preserves both paragraph colors');
    for(const [mode,frame] of [[0,'rank-0-0'],[1,'grid-0'],[2,'node-0'],[3,'portrait-0']]){
      await open(mode);await page.locator('#sheet [data-image="'+frame+'"]').click();await page.locator('#addFrameText').click();const key='frame-'+frame;
      await text(key).fill('第一段第二段');const original=await colors(key);await select(key,0,3);await begin(key);await paint('#f04060');assert.deepEqual((await colors(key)).map(v=>v.color),original.map((v,i)=>i<3?'rgb(240, 64, 96)':v.color));
      await select(key,3,6);await begin(key);await paint('#3060e0');const expected=await colors(key);await open((mode+1)%4);await open(mode);assert.deepEqual(await colors(key),expected);
    }
    await page.setViewportSize({width:390,height:844});await select('frame-portrait-0',1,2);await begin('frame-portrait-0');await paint('#229944');assert.equal((await colors('frame-portrait-0'))[1].color,'rgb(34, 153, 68)');
    await select('frame-portrait-0',0,0);await begin('frame-portrait-0');await paint('#8833aa');assert((await colors('frame-portrait-0')).every(c=>c.color==='rgb(136, 51, 170)'),'A deliberate caret-only edit still supports whole-box color');
    assert.deepEqual(errors,[]);console.log('PASS: native-picker focus loss, repeated color input/change, disjoint and cross-span colors, typography preservation, all editors, undo/redo, rerender and mobile.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
