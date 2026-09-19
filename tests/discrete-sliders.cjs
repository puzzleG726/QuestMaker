const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const modules = process.env.QUESTMAKER_TEST_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = require(path.join(modules, 'playwright'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const out = '/tmp/questmaker-discrete-sliders';
  await fs.mkdir(out, { recursive: true });
  try {
    for (const width of [1440, 320, 390]) {
      const mobile = width < 650;
      const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: mobile, isMobile: mobile });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const open = async type => {
        if (await page.locator('#editorView').isVisible()) await page.locator('#homeButton').click();
        await page.locator('[data-open="' + type + '"]').click();
      };
      const field = id => page.locator('#' + id).locator('..');
      const geometry = async id => {
        const result = await page.locator('#' + id).evaluate(input => {
          const control = input.parentElement, r = input.getBoundingClientRect();
          const output = control.querySelector('output').getBoundingClientRect();
          const ends = [...control.querySelectorAll('.discrete-min,.discrete-max')].map(el => {const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top};});
          const expected = r.left + 22 + (r.width - 44) * (input.value - input.min) / (input.max - input.min);
          return { error: Math.abs((output.left + output.right) / 2 - expected), outputTop: output.top, outputBottom: output.bottom, left:r.left, right:r.right, height:r.height, ends, thumb:getComputedStyle(input,'::-webkit-slider-thumb').width };
        });
        assert(result.error < 1);assert(result.height >= 44);
        assert(result.left >= 0 && result.right <= width);
        assert(result.ends.every(end => end.left >= 0 && end.right <= width && end.top > result.outputBottom));
        assert.equal(await field(id).locator('output').innerText(), await page.locator('#' + id).inputValue());
      };
      await page.goto('file://' + path.resolve('index.html'));
      for (const [type, specs] of [[2,[['nodeCount',3,24]]],[1,[['rows',1,6],['cols',1,5]]],[0,[['rows',1,12],['cols',1,4]]]]) {
        await open(type);
        for (const [id, min, max] of specs) {
          const input = page.locator('#' + id);
          assert.deepEqual(await input.evaluate(el => [el.type,Number(el.min),Number(el.max),Number(el.step)]), ['range',min,max,1]);
          assert.equal(await field(id).locator('.discrete-min').innerText(),String(min));
          assert.equal(await field(id).locator('.discrete-max').innerText(),String(max));
          const tickCount = await field(id).locator('.discrete-rail span').count();
          assert(tickCount <= 7);if(max-min<=6)assert.equal(tickCount,max-min-1);
          await input.focus();await page.keyboard.press('Home');await geometry(id);
          for (let value=min+1;value<=max;value++) {
            await page.keyboard.press('ArrowRight');
            assert.equal(await input.inputValue(),String(value));
            assert(await input.evaluate(el=>el===document.activeElement));
          }
          await geometry(id);
          if(id==='nodeCount') assert.equal(await page.locator('#sheet .relation-node').count(),24);
          else if(type===1) assert.equal(await page.locator('#sheet .grid-cell').count(),Number(await page.locator('#rows').inputValue())*Number(await page.locator('#cols').inputValue()));
          else assert.equal(await page.locator('#sheet .rank-row').count(),Number(await page.locator('#rows').inputValue()));
          await page.locator('#undoButton').click();assert.equal(await input.inputValue(),String(max-1));
          await page.locator('#redoButton').click();assert.equal(await input.inputValue(),String(max));
          await input.scrollIntoViewIfNeeded();
          const r=await input.boundingBox();
          if(mobile) await input.tap({position:{x:r.width/2,y:22}});
          else await input.click({position:{x:r.width/2,y:22}});
          assert(Math.abs(Number(await input.inputValue())-(min+max)/2)<=.5);
          await geometry(id);
          await field(id).locator('..').screenshot({path:path.join(out,`${width}-${type}-${id}.png`)});
          if(id==='nodeCount') {
            await input.scrollIntoViewIfNeeded();
            const b=await input.boundingBox(), value=Number(await input.inputValue());
            const x=b.x+22+(b.width-44)*(value-min)/(max-min), y=b.y+22;
            if(mobile) {
              const cdp=await context.newCDPSession(page);
              await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
              for(let step=1;step<=5;step++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(b.x+b.width-22-x)*step/5,y}]});
              assert.equal(await input.inputValue(),String(max));await geometry(id);
              assert.equal(await page.locator('#sheet .relation-node').count(),value,'Only the existing change handler commits the model');
              await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
            } else {
              await page.mouse.move(x,y+17);await page.mouse.down();
              await page.mouse.move(b.x+b.width-22,y+17,{steps:8});
              assert.equal(await input.inputValue(),String(max));await geometry(id);
              await page.mouse.up();
            }
            assert.equal(await page.locator('#sheet .relation-node').count(),max);
          }
        }
        if(type===0) assert.equal(await page.locator('#rankWidth').getAttribute('type'),'number');
        if(type===1) assert.equal(await page.locator('#boxRatio').evaluate(el=>el.tagName),'SELECT');
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      }
      assert.deepEqual(errors,[]);await context.close();
    }
    console.log('PASS: legal bounds, every integer, track click/tap, expanded-thumb drag/touch, deferred change commit, focus, following value, endpoints, ticks, undo/redo and desktop/mobile bounds.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
