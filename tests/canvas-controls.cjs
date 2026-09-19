const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.join(process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const source = fs.readFileSync('app.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.canvasTest = { documents, openEditor, render, refreshSheet, recordHistory, setSelected, getSelection: () => selected };\n})();');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 820, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width !== 1440 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/app.js', route => route.fulfill({ contentType: 'application/javascript', body: source }));
      await page.goto('file://' + path.resolve('index.html'));
      const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const open = async type => { await page.evaluate(type => canvasTest.openEditor(type), type); await settle(); };
      const blank = async () => {
        await settle();
        const rect = await page.locator('#sheet').boundingBox();
        const relation = await page.locator('#sheet .relation-node').count();
        const x = rect.x + (relation ? rect.width / 2 : 8), y = rect.y + (relation ? rect.height / 2 : 8);
        if (width === 1440) await page.mouse.click(x, y);
        else await page.touchscreen.tap(x, y);
      };
      for (const type of [0, 1, 2, 3]) {
        await open(type);
        const image = page.locator('#sheet [data-image]').last();
        await image.click({ position: { x: 16, y: 16 } });
        assert.equal(await page.evaluate(() => canvasTest.getSelection()?.type), 'image');
        await page.evaluate(() => scrollTo(0, 0));
        await blank();
        assert.equal(await page.evaluate(() => canvasTest.getSelection()), null, `Blank tap ${width}/${type}`);
        assert.equal(await page.locator('#sheet .selected').count(), 0);
        await page.locator('#sheet [data-text="title"]').click();
        await blank();
        assert(await page.evaluate(() => !document.activeElement.isContentEditable));
        assert.equal(await page.evaluate(() => canvasTest.getSelection()), null);
      }
      await open(0);
      await page.evaluate(() => {
        const doc = canvasTest.documents[0];
        doc.rows = 12; doc.rowHeights.fill(500); doc.paperWidth = 492; doc.rankWidths = [90, 301];
        canvasTest.render();
      });
      await settle();
      const geometry = () => page.locator('#sheet').evaluate(el => [el.offsetWidth, el.offsetHeight]);
      const original = await geometry();
      const originalScale = await page.locator('#sheet').evaluate(el => el.getBoundingClientRect().width / el.offsetWidth);
      assert.equal(await page.locator('#zoomOut').isDisabled(), false);
      await page.locator('#zoomOut').click(); await settle();
      assert(await page.locator('#sheet').evaluate(el => el.getBoundingClientRect().width / el.offsetWidth) < originalScale);
      await page.locator('#zoomFit').click(); await settle();
      let rect = await page.locator('#sheet').boundingBox();
      assert(rect.y >= 0 && rect.y + rect.height <= 900, JSON.stringify(rect));
      assert(rect.width <= await page.locator('#canvasViewport').evaluate(el => el.clientWidth));
      assert.deepEqual(await geometry(), original);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `/tmp/questmaker-canvas-fit-${width}.png` });
      await page.locator('#zoomIn').click(); await settle();
      assert((await page.locator('#sheet').boundingBox()).width > rect.width);
      await page.setViewportSize({ width, height: 760 });
      await page.locator('#zoomFit').click(); await settle();
      rect = await page.locator('#sheet').boundingBox();
      assert(rect.y + rect.height <= 760, JSON.stringify(rect));
      assert.deepEqual(await geometry(), original);
      if (width === 1440) {
        await open(3);
        await page.locator('#sheet [data-component="notes"]').click();
        assert.equal(await page.evaluate(() => canvasTest.getSelection()?.type), 'component');
        await page.keyboard.press('Delete');
        assert.equal(await page.locator('#sheet [data-component="notes"]').count(), 0);
        await page.locator('#undoButton').click();
        assert.equal(await page.locator('#sheet [data-component="notes"]').count(), 1);
        await open(1);
        const title = page.locator('#sheet [data-text="title"]');
        await title.click();
        await page.keyboard.press('End');
        await page.keyboard.press('Backspace');
        assert.equal(await title.count(), 1, 'Editing deletes characters, not the text component');
        await page.locator('#canvasViewport').focus();
        await page.keyboard.press('Delete');
        assert.equal(await title.count(), 0);
        await page.locator('#undoButton').click();
        assert.equal(await title.count(), 1);
        await title.click();
        await page.locator('#selectionProperties input[type="number"]').first().focus();
        await page.keyboard.press('Delete');
        assert.equal(await title.count(), 1, 'Inspector text entry never deletes a component');
        await page.locator('#exportButton').click();
        await page.keyboard.press('Delete');
        assert.equal(await title.count(), 1, 'Dialogs never delete a component');
        await page.keyboard.press('Escape');
        await open(2);
        await page.evaluate(() => {
          canvasTest.documents[2].edges.push({ from: 0, to: 1, width: 3, bend: 0, startStyle: 'none', endStyle: 'none', legendId: 'code-0' });
          canvasTest.refreshSheet(); canvasTest.recordHistory();
          canvasTest.setSelected({ type: 'edge', index: 0 });
        });
        await page.locator('#canvasViewport').focus();
        await page.keyboard.press('Backspace');
        assert.equal(await page.evaluate(() => canvasTest.documents[2].edges.length), 0);
        await page.locator('#undoButton').click();
        assert.equal(await page.evaluate(() => canvasTest.documents[2].edges.length), 1);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Canvas selection, keyboard deletion, and long-canvas zoom passed at desktop/tablet/mobile widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
