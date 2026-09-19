const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const modules=process.env.QUESTMAKER_TEST_MODULES||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(modules,'playwright'));
const sharp=require(path.join(modules,'sharp'));
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1200}}), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      const parse=JSON.parse;
      JSON.parse=function(...args){
        const result=parse.apply(this,args);
        if(result?.type===2&&Array.isArray(result.participants)) window.relationSnapshot=parse.call(this,args[0]);
        return result;
      };
      const stringify=JSON.stringify;
      JSON.stringify=function(value,...args){
        const result=stringify.call(this,value,...args);
        if(value?.type===2&&Array.isArray(value.participants)) window.relationSnapshot=JSON.parse(result);
        return result;
      };
    });
    const files=[];
    for(let i=0;i<25;i++) files.push({name:(25-i)+'.png',mimeType:'image/png',buffer:await sharp({create:{width:60+i,height:80,channels:3,background:{r:20+i*8,g:50,b:120}}}).png().toBuffer()});
    const state=()=>page.evaluate(()=>window.relationSnapshot);
    const nodes=()=>page.locator('#sheet .relation-node').evaluateAll(els=>els.map(el=>({id:Number(el.dataset.participantId),src:el.querySelector('img')?.src||null,name:el.querySelector('.node-name')?.textContent,left:parseFloat(el.style.left),top:parseFloat(el.style.top)})));
    const count=async n=>{
      await page.locator('#nodeCount').evaluate((el,n)=>{el.value=n;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},n);
    };
    const upload=async(selector,images,confirm=true)=>{
      page.once('dialog',dialog=>confirm?dialog.accept():dialog.dismiss());
      const chooser=page.waitForEvent('filechooser');await page.locator(selector).click();await (await chooser).setFiles(images);
      await page.waitForFunction(()=>!document.querySelector('#batchAvatars')?.disabled);
      page.removeAllListeners('dialog');
    };
    const circular=async()=>{
      const result=await page.locator('#sheet .relation-map').evaluate(map=>{
        const cx=map.clientWidth/2,cy=map.clientHeight/2;
        return [...map.querySelectorAll('.relation-node')].map(el=>{const x=parseFloat(el.style.left)-cx,y=parseFloat(el.style.top)-cy;return {radius:Math.hypot(x,y),angle:Math.atan2(y,x)};});
      });
      assert(Math.abs(result[0].angle+Math.PI/2)<1e-6);
      assert(result.every(p=>Math.abs(p.radius-result[0].radius)<.002));
      for(let i=1;i<result.length;i++) assert(Math.abs((result[i].angle-result[i-1].angle+2*Math.PI)%(2*Math.PI)-2*Math.PI/result.length)<.00002);
    };
    await page.goto('file://'+path.resolve('index.html'));await page.locator('[data-open="2"]').click();
    assert.equal((await state()).participants.length,8);assert.equal((await state()).nodeCount,undefined);
    await page.evaluate(()=>{window.relationRenders=0;new MutationObserver(records=>{window.relationRenders+=records.filter(r=>r.target.id==='sheet'&&r.addedNodes.length>0).length;}).observe(document.querySelector('#sheet'),{childList:true});});
    await upload('#batchAvatars',files.slice(0,13));
    assert.equal(await page.evaluate(()=>window.relationRenders),1,'One render for the complete batch');
    const first=await nodes();assert.equal(first.length,13);assert.equal(await page.locator('#nodeCount').inputValue(),'13');
    const colors=await page.locator('#sheet .relation-node img').evaluateAll(async imgs=>Promise.all(imgs.map(async img=>{await img.decode();const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,1,1);return ctx.getImageData(0,0,1,1).data[0];})));
    assert.deepEqual(colors,Array.from({length:13},(_,i)=>20+i*8));await circular();
    await page.screenshot({path:'/tmp/questmaker-participants-desktop.png',fullPage:true});
    assert.equal(Object.keys((await state()).images).filter(key=>key.startsWith('node-')).length,0,'No second serialized image store');
    await count(16);let current=await nodes();assert.deepEqual(current.slice(0,13).map(n=>[n.id,n.src,n.name]),first.map(n=>[n.id,n.src,n.name]));assert(current.slice(13).every(n=>!n.src));await circular();
    await count(13);assert.deepEqual((await nodes()).map(n=>[n.id,n.src,n.name]),first.map(n=>[n.id,n.src,n.name]));await circular();
    await count(12);assert.equal(await page.locator('#nodeCount').inputValue(),'13');assert.equal((await nodes()).length,13);
    await page.locator('#undoButton').click();assert.equal((await nodes()).length,16);await page.locator('#redoButton').click();assert.equal((await nodes()).length,13);
    await page.locator('#sheet [data-text="node-name-3"]').fill('角色 D');
    await page.locator('#sheet [data-image="node-3"]').click();
    await page.locator('#imageShape [data-option="circle"]').click();await page.locator('#imageFit').selectOption('contain');
    const beforeReplace=await nodes();await upload('#replaceImage',[files[20]]);
    current=await nodes();assert.deepEqual(current.map(n=>[n.id,n.name,n.left,n.top]),beforeReplace.map(n=>[n.id,n.name,n.left,n.top]));
    assert.notEqual(current[3].src,beforeReplace[3].src);assert.equal((await state()).participants[3].name.html,'角色 D');
    assert.equal((await state()).participants[3].image.fit,'contain');
    await page.locator('#cropImage').click();await page.locator('#applyCrop').click();assert.equal((await state()).participants[3].id,3);
    await count(15);const appended=(await nodes()).at(-1);assert(appended.id>=16,'Removed IDs are not reused');
    await page.locator('#linkMode').click();await page.locator('#sheet [data-image="node-0"]').click();await page.locator('#sheet [data-image="node-'+appended.id+'"]').click();
    const edges=(await state()).edges;assert.equal(edges[0].to,appended.id);assert.equal(await page.locator('#sheet .edge-line').count(),1);
    await count(18);assert.deepEqual((await state()).edges,edges);await count(15);assert.deepEqual((await state()).edges,edges);assert.equal(await page.locator('#sheet .edge-line').count(),1);
    const beforeCancel=await nodes();await upload('#batchAvatars',files.slice(0,3),false);assert.deepEqual(await nodes(),beforeCancel);
    await upload('#batchAvatars',files.slice(0,2));assert.deepEqual(await nodes(),beforeCancel);
    await upload('#batchAvatars',files);assert.deepEqual(await nodes(),beforeCancel);
    await upload('#batchAvatars',[files[0],{name:'broken.png',mimeType:'image/png',buffer:Buffer.from('bad')},files[2]]);assert.deepEqual(await nodes(),beforeCancel);
    await upload('#batchAvatars',files.slice(0,24));assert.equal((await nodes()).length,24);assert.equal(await page.locator('#nodeCount').inputValue(),'24');assert.deepEqual((await state()).edges,edges);await circular();
    await page.locator('#undoButton').click();assert.deepEqual(await nodes(),beforeCancel);
    await page.locator('#redoButton').click();assert.equal((await nodes()).length,24);
    await upload('#batchAvatars',files.slice(0,3));assert.equal((await nodes()).length,3);assert.deepEqual((await state()).edges,edges);await circular();
    await page.locator('#undoButton').click();assert.equal((await nodes()).length,24);
    await page.locator('#redoButton').click();assert.equal((await nodes()).length,3);
    await page.evaluate(()=>{
      const read=FileReader.prototype.readAsDataURL;
      FileReader.prototype.readAsDataURL=function(file){
        FileReader.prototype.readAsDataURL=read;
        window.releaseAvatarRead=()=>read.call(this,file);
      };
    });
    page.once('dialog',dialog=>dialog.accept());
    const pending=page.waitForEvent('filechooser');await page.locator('#batchAvatars').click();await (await pending).setFiles(files.slice(0,5));
    await page.waitForFunction(()=>Boolean(window.releaseAvatarRead));
    await count(6);const changedDuringImport=await nodes();await page.evaluate(()=>window.releaseAvatarRead());
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('角色内容已更改'));
    assert.deepEqual(await nodes(),changedDuringImport,'Slow imports never overwrite intervening participant edits');
    await page.setViewportSize({width:390,height:844});assert(await page.locator('#batchAvatars').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:'/tmp/questmaker-participants-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1200});
    await page.reload();await page.locator('[data-open="2"]').click();
    await upload('#batchAvatars',files.slice(0,16));
    for(const id of [2,7,14]) {
      await page.locator('#sheet [data-image="node-'+id+'"]').click();
      await page.locator('#removeImage').click();
    }
    await page.locator('#linkMode').click();
    await page.locator('#sheet [data-image="node-1"]').click();
    await page.locator('#sheet [data-image="node-15"]').click();
    const beforeCompact=await state(), compactEdges=beforeCompact.edges;
    await count(12);
    assert.deepEqual((await state()).participants,beforeCompact.participants,'Insufficient empty slots must not partially remove participants');
    assert.equal(await page.locator('#nodeCount').inputValue(),'16');
    await count(15);
    const fifteen=(await state()).participants;
    assert.deepEqual(fifteen,beforeCompact.participants.filter(p=>p.id!==14),'Remove the last available empty slot first');
    await count(13);
    const thirteen=(await state()).participants;
    assert.deepEqual(thirteen,beforeCompact.participants.filter(p=>![2,7,14].includes(p.id)),'Middle empty removal preserves participant identity, content and order');
    assert.deepEqual((await state()).edges,compactEdges);
    assert.equal(await page.locator('#sheet .edge-line').count(),1);await circular();
    await page.locator('#undoButton').click();assert.deepEqual((await state()).participants,fifteen);
    await page.locator('#redoButton').click();assert.deepEqual((await state()).participants,thirteen);
    await count(12);assert.equal(await page.locator('#nodeCount').inputValue(),'13');
    assert.deepEqual((await state()).participants,thirteen);
    await count(15);
    const extra=(await state()).participants.slice(13);
    assert(extra.every(p=>p.id>15));
    await page.locator('#sheet [data-text="node-name-'+extra[0].id+'"]').fill('保留名称');
    await page.locator('#linkMode').click();await page.locator('#sheet [data-image="node-1"]').click();
    await page.locator('#sheet [data-image="node-'+extra[1].id+'"]').click();
    const protectedRoles=(await state()).participants;
    await count(13);assert.equal(await page.locator('#nodeCount').inputValue(),'15');
    assert.deepEqual((await state()).participants,protectedRoles,'Image-free named or connected roles are not empty slots');
    assert.deepEqual(errors,[]);
    console.log('PASS: participant source of truth, ordered atomic 13/24-image batches, uniform layout, append/shrink protection, stable IDs/name/crop/fit, unchanged line records, invalid/cancelled import, undo/redo and mobile.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
