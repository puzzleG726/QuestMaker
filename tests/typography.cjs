const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const modules=process.env.QUESTMAKER_TEST_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(modules,'playwright'));

(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const text=key=>page.locator('#sheet [data-text="'+key+'"]');
  const open=async type=>{if(await page.locator('#editorView').isVisible())await page.locator('#homeButton').click();await page.locator('[data-open="'+type+'"]').click();};
  const select=async(key,start=null,end=null)=>{
    await text(key).evaluate((el,{start,end})=>{el.focus();const r=document.createRange();r.selectNodeContents(el);if(start===null)r.collapse(true);else{r.setStart(el.firstChild,start);r.setEnd(el.firstChild,end);}getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));},{start,end});
  };
  const size=async value=>{await page.locator('#fontSize').fill(String(value));await page.waitForTimeout(60);};
  const sizes=key=>text(key).evaluate(el=>{const nodes=[],w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);while(w.nextNode())if(w.currentNode.textContent.trim())nodes.push(getComputedStyle(w.currentNode.parentElement).fontSize);return nodes;});
  const equalSize=async(key,value)=>assert((await sizes(key)).every(s=>s===value+'px'),key+' should render at '+value+'px');
  try{
    await page.goto('file://'+path.resolve('index.html'));
    await open(0);await select('rank-title-0');await size(34);await equalSize('rank-title-0',34);
    await page.locator('#cols').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#cols').dispatchEvent('change');await equalSize('rank-title-0',34);
    await open(1);await open(0);await equalSize('rank-title-0',34);
    for(const [type,key] of [[0,'rank-title-0'],[1,'grid-caption-0'],[2,'title'],[2,'node-name-0'],[3,'person-0']]){
      await open(type);await select(key);await size(24);await equalSize(key,24);
      await page.locator('#textStyle').selectOption('title1');await equalSize(key,40);
      await page.locator('#textStyle').selectOption('body');await equalSize(key,18);
    }
    for(const [type,key] of [[0,'rank-0-0'],[1,'grid-0'],[2,'node-1'],[3,'portrait-0']]){
      await open(type);await page.locator('#sheet [data-image="'+key+'"]').click();await page.locator('#addFrameText').click();
      const id='frame-'+key;await text(id).fill('大小文字');await select(id,0,2);
      await page.locator('#fontSize').fill('');await page.locator('#fontSize').pressSequentially('32');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'fontSize','Size input keeps keyboard focus');
      assert.deepEqual(await sizes(id),['32px','18px']);
      await size(30);assert.deepEqual(await sizes(id),['30px','18px']);
      await select(id);await size(22);await equalSize(id,22);
      await page.locator('#textPlacement').selectOption('above');await equalSize(id,22);
      await select(id);await page.locator('#textStyle').selectOption('title2');await equalSize(id,26);
      await page.locator('#undoButton').click();await equalSize(id,22);
      await page.locator('#redoButton').click();await equalSize(id,26);
      await open((type+1)%4);await open(type);await equalSize(id,26);
    }
    await page.setViewportSize({width:390,height:844});await select('frame-portrait-0');await size(20);await equalSize('frame-portrait-0',20);
    assert.deepEqual(errors,[]);
    console.log('PASS: manual rank sizes, all template presets, partial and whole-box font sizes, input focus, anchored text, undo/redo, rerender persistence, mobile.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
