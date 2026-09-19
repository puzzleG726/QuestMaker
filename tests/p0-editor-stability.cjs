const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const source = fs.readFileSync('app.js', 'utf8');
const instrumented = source.replace(/\}\)\(\);\s*$/, 'window.p0 = { documents, openEditor, render, refreshSheet, applyTextPlacement, measureTextDrop };\n})();');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390, 820]) {
      const page = await browser.newPage({ viewport: { width, height: 1100 }, hasTouch: width !== 1440 });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/app.js', route => route.fulfill({ contentType: 'application/javascript', body: instrumented }));
      await page.goto('file://' + path.resolve('index.html'));
      const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const open = async type => { await page.evaluate(type => window.p0.openEditor(type), type); await settle(); };
      const geometry = () => page.locator('#sheet').evaluate(sheet => {
        const root = sheet.getBoundingClientRect(), scale = root.width / sheet.offsetWidth;
        return [...sheet.querySelectorAll('[data-frame],.rank-row')].map(el => {
          const r = el.getBoundingClientRect();
          return [r.x - root.x, r.y - root.y, r.width, r.height].map(n => Math.round(n / scale * 100) / 100);
        });
      });
      await open(0);
      await page.locator('#sheet [data-image="rank-0-0"]').click();
      assert.equal(await page.locator('#imageShape').count(), 0);
      await page.locator('#addFrameText').click();
      assert.equal(await page.locator('#textPlacement option[value="above"]').count(), 0);
      const before = await geometry();
      await page.evaluate(() => {
        const doc = p0.documents[0];
        doc.texts['frame-rank-0-0'].html = '旧标题';
        doc.textBoxes['frame-rank-0-0'].placement = 'above';
        const el = document.querySelector('#sheet [data-text-box="frame-rank-0-0"]');
        el.className = 'text-box above-text'; el.style.cssText = '';
        document.querySelector('#sheet [data-frame="rank-0-0"]').previousElementSibling.append(el);
        const r = el.getBoundingClientRect(), s = document.querySelector('#sheet').getBoundingClientRect();
        window.oldOffset = [r.x - s.x, r.y - s.y];
        doc.textBoxes.orphan = { frame: 'rank-99-99', placement: 'above', x: 60, y: 75, width: 180 };
        doc.texts.orphan = { html: '保留内容', size: 22 };
        p0.refreshSheet();
      });
      await settle();
      const recovery = await page.evaluate(() => {
        const doc = p0.documents[0], el = document.querySelector('#sheet [data-text-box="frame-rank-0-0"]');
        const r = el.getBoundingClientRect(), s = document.querySelector('#sheet').getBoundingClientRect();
        return { box: doc.textBoxes['frame-rank-0-0'], orphan: doc.textBoxes.orphan, content: doc.texts.orphan,
          offset: [r.x - s.x, r.y - s.y], previous: oldOffset };
      });
      assert.equal(recovery.box.placement, 'free'); assert.equal(recovery.box.frame, null);
      recovery.offset.forEach((n, i) => assert(Math.abs(n - recovery.previous[i]) < 1));
      assert.deepEqual(recovery.orphan, { frame: null, placement: 'free', x: 60, y: 75, width: 180 });
      assert.deepEqual(recovery.content, { html: '保留内容', size: 22 });
      assert.equal(await page.locator('#sheet [data-frame="rank-99-99"]').count(), 0);
      assert.deepEqual(await geometry(), before, 'invalid heading cannot change table geometry');
      await page.evaluate(() => {
        const doc = p0.documents[0];
        p0.applyTextPlacement(doc, 'orphan', 'above', { x: 1, y: 1, width: 10 });
      });
      assert.equal(await page.evaluate(() => p0.documents[0].textBoxes.orphan.placement), 'free');
      await page.evaluate(() => {
        const doc = p0.documents[0];
        doc.textBoxes.unmounted = { frame: 'rank-2-0', placement: 'above' };
        doc.texts.unmounted = { html: '未挂载的旧文字' };
        p0.refreshSheet();
      });
      assert(await page.locator('#sheet [data-text-box="unmounted"]').isVisible());
      assert.equal(await page.locator('#sheet [data-frame]').count(), 10);

      for (const [type, frame] of [[0, 'rank-0-0'], [0, 'rank-tag-0'], [1, 'grid-0'], [2, 'node-0'], [3, 'portrait-0']]) {
        await open(type);
        const original = await geometry();
        await page.evaluate(({ type, frame }) => {
          const doc = p0.documents[type];
          doc.texts.long = { html: ('长文本 LongWordWithoutSpaces'.repeat(20) + '<br>').repeat(40), preset: 'body', fontSize: 26 };
          doc.textBoxes.long = { frame, placement: 'inside', x: 20, y: 20, width: 900 };
          p0.refreshSheet();
        }, { type, frame });
        await settle();
        assert.deepEqual(await geometry(), original, `geometry changed by long text in ${frame}`);
        const bounds = await page.locator('#sheet [data-text-box="long"]').evaluate(el => {
          const box = el.getBoundingClientRect(), frame = el.closest('[data-frame]').getBoundingClientRect(), text = el.querySelector('.rich');
          return { fits: box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1,
            scrolls: text.scrollHeight > text.clientHeight, overflow: getComputedStyle(text).overflowY, font: getComputedStyle(text).fontSize,
            pageFits: document.documentElement.scrollWidth <= innerWidth };
        });
        assert(bounds.fits, `text outside ${frame}: ${JSON.stringify(bounds)}`);
        assert(bounds.scrolls); assert.equal(bounds.overflow, 'auto'); assert.equal(bounds.font, '26px'); assert(bounds.pageFits);
        await page.evaluate(type => {
          const doc = p0.documents[type];
          doc.textBoxes.second = { frame: doc.textBoxes.long.frame, placement: 'inside' };
          doc.texts.second = { html: '第二段'.repeat(1000) };
          p0.refreshSheet();
        }, type);
        await settle();
        assert.deepEqual(await geometry(), original, `two text boxes changed ${frame}`);
        const contained = await page.locator('#sheet .inside-text').evaluateAll(elements => elements.every(el => {
          const r = el.getBoundingClientRect(), f = el.closest('[data-frame]').getBoundingClientRect();
          return r.top >= f.top - 1 && r.bottom <= f.bottom + 1;
        }));
        assert(contained, `two boxes overflow ${frame}`);
        await page.evaluate(type => { const doc = p0.documents[type]; delete doc.textBoxes.long; delete doc.textBoxes.second; p0.refreshSheet(); }, type);
      }
      for (const type of [1, 3]) {
        await open(type);
        await page.locator('#sheet [data-image]').first().click();
        assert(await page.locator('#imageShape').isVisible());
        await page.locator('#imageShape [data-option="square"]').click();
        assert((await page.locator('#sheet [data-image]').first().getAttribute('class')).includes('square'));
        await page.locator('#addFrameText').click();
        assert.equal(await page.locator('#textPlacement option[value="above"]').count(), 1);
        await page.locator('#textPlacement').selectOption('above');
        assert.equal(await page.locator('#sheet .above-text').count(), 1);
      }
      if (width === 1440) {
        await open(0);
        await page.evaluate(() => {
          const doc = p0.documents[0];
          doc.textBoxes.dragLong = { frame: null, placement: 'free', x: 160, y: 250, width: 160 };
          doc.texts.dragLong = { html: '粘贴的长文本'.repeat(200), fontSize: 24 };
          p0.refreshSheet();
        });
        await settle();
        const original = await geometry();
        const grip = page.locator('#sheet [data-drag-text="dragLong"]');
        await grip.scrollIntoViewIfNeeded();
        const start = await grip.boundingBox(), frame = await page.locator('#sheet [data-frame="rank-2-0"]').boundingBox();
        await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
        await page.mouse.down();
        await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2, { steps: 10 });
        await page.mouse.up();
        await settle();
        assert.equal(await page.evaluate(() => p0.documents[0].textBoxes.dragLong.frame), 'rank-2-0');
        assert.equal(await page.evaluate(() => p0.documents[0].textBoxes.dragLong.placement), 'inside');
        assert.deepEqual(await geometry(), original, 'actual drag/drop keeps table geometry');
        await page.screenshot({ path: '/tmp/questmaker-p0-long-text.png' });
      }
      await open(2);
      await page.evaluate(() => { p0.documents[2].participants[0].image.shape = 'square'; p0.refreshSheet(); });
      await settle();
      await page.locator('#sheet [data-image="node-0"]').click();
      assert.equal(await page.locator('#imageShape').count(), 0);
      assert.equal(await page.evaluate(() => p0.documents[2].participants[0].image.shape), 'square');
      assert.equal(await page.locator('#sheet [data-image="node-0"]').evaluate(el => getComputedStyle(el).borderRadius), '50%');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: rank above recovery/no phantom frames, bounded long text/no geometry changes, rank/relation shape UI restrictions, legacy shapes retained, grid/compat options unchanged across desktop/phone/tablet.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
