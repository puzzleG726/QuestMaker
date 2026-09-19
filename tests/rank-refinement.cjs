const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const source = fs.readFileSync('app.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.rankTest = { documents, render, refreshSheet, openEditor };\n})();');
const paperRect = el => {
  const sheet = el.closest('.sheet'), s = sheet.getBoundingClientRect(), r = el.getBoundingClientRect(), scale = s.width / sheet.offsetWidth;
  return [r.x - s.x, r.y - s.y, r.width, r.height].map(n => n / scale);
};
const close = (a, b) => a.forEach((n, i) => assert(Math.abs(n - b[i]) < 1, JSON.stringify({ a, b })));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 820, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1300 }, hasTouch: width !== 1440 });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/app.js', route => route.fulfill({ contentType: 'application/javascript', body: source }));
      await page.goto('file://' + path.resolve('index.html'));
      const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.locator('[data-open="0"]').click();
      for (const cancel of [true, false]) {
        await page.evaluate(() => {
          const doc = rankTest.documents[0];
          doc.textBoxes.topTest = { frame: null, placement: 'layout-top', x: 20, y: 20, width: 200 };
          doc.texts.topTest = { html: '顶部文字', fontSize: 24 };
          rankTest.refreshSheet();
        });
        await settle();
        const originalBody = await page.locator('#sheet .rank-body').evaluate(paperRect);
        const grip = page.locator('#sheet [data-drag-text="topTest"]');
        await grip.scrollIntoViewIfNeeded();
        const start = await grip.boundingBox();
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
        await page.mouse.down();
        for (let i = 0; i < 2; i++) {
          const cell = await page.locator('#sheet [data-frame="rank-1-0"]').boundingBox();
          await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 4 });
        }
        const target = page.locator('#sheet .text-snap-target-muted');
        assert.equal(await target.count(), 1);
        close(await target.evaluate(paperRect), await page.locator('#sheet .text-snap-object').evaluate(paperRect));
        const expected = await page.locator('#sheet .text-snap-destination').evaluate(paperRect);
        if (width === 1440) await page.screenshot({ path: '/tmp/questmaker-rank-snap-current.png' });
        if (cancel) {
          await page.locator('#sheet').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
          await page.mouse.up();
          await settle();
          assert.equal(await page.evaluate(() => rankTest.documents[0].textBoxes.topTest.placement), 'layout-top');
          close(await page.locator('#sheet .rank-body').evaluate(paperRect), originalBody);
        } else {
          await page.mouse.up(); await settle();
          close(await page.locator('#sheet [data-text-box="topTest"]').evaluate(paperRect), expected);
          assert.equal(await page.evaluate(() => rankTest.documents[0].textBoxes.topTest.frame), 'rank-1-0');
        }
        assert.equal(await page.locator('.text-snap-measure,.text-snap-preview').count(), 0);
      }
      for (const [id, value] of [['rankWidth', 1191], ['rankHeight', 2023]]) {
        const slider = page.locator('#' + id);
        assert.equal(await slider.getAttribute('type'), 'range');
        assert.equal(await slider.getAttribute('step'), '1');
        await slider.evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
        await settle();
        assert.equal(await slider.inputValue(), String(value));
        assert.equal(await page.locator(`output[for="${id}"]`).textContent(), String(value));
        const dimension = id === 'rankWidth' ? 2 : 3;
        assert(Math.abs((await page.locator('#sheet .rank-body').evaluate(paperRect))[dimension] - value) < 1);
        const contained = await slider.evaluate(el => {
          const field = el.closest('.discrete-slider-field').getBoundingClientRect();
          return [...el.closest('.discrete-slider-field').querySelectorAll('output,.discrete-min,.discrete-max')].every(node => {
            const r = node.getBoundingClientRect(); return r.left >= field.left - 1 && r.right <= field.right + 1;
          });
        });
        assert(contained);
      }
      assert.equal(await page.locator('.rank-dimensions input[type="number"],.rank-dimensions select').count(), 0);
      await page.locator('#sheet [data-image="rank-0-0"]').click();
      assert.equal(await page.locator('#imageShape').count(), 0);
      if (width === 1440) await page.locator('#selectionProperties').screenshot({ path: '/tmp/questmaker-rank-shape-hidden.png' });
      await page.locator('#rankHeight').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/questmaker-rank-size-${width}.png` });
      await page.evaluate(() => rankTest.openEditor(2));
      await page.locator('#sheet [data-image="node-0"]').click();
      assert.equal(await page.locator('#imageShape').count(), 0);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: top-text drag live frame/preview/drop alignment, cancellation cleanup, integer dimension sliders with existing bounds, shape UI hidden on current branch.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
