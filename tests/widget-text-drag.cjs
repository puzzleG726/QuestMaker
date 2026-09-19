const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const settle = () => page.waitForTimeout(180);
  const order = () => page.locator('#sheet [data-component]').evaluateAll(nodes => nodes.map(el => el.dataset.component));
  try {
    await page.goto('file://' + path.resolve('index.html'));
    await page.locator('[data-open="3"]').click();
    await page.locator('#sheet [data-text="title"]').click(); await page.locator('#addText').click();
    const text = page.locator('#sheet .component-text').last();
    await text.fill('Widget text');
    const key = await text.getAttribute('data-text');
    const id = await text.evaluate(el => el.closest('[data-component]').dataset.component);
    const originalHTML = await text.innerHTML();
    const initialOrder = await order();
    for (const [width, slot, cancel] of [[1440, 'full', false], [390, 'left', false], [390, 'right', true]]) {
      await page.setViewportSize({ width, height: 1800 }); await settle();
      const before = await order();
      const source = page.locator(`#sheet [data-component="${id}"]`);
      await source.locator('[data-drag-block]').scrollIntoViewIfNeeded();
      const grip = await source.locator('[data-drag-block]').boundingBox();
      const target = await page.locator('#sheet [data-component="pace"]').boundingBox();
      const body = await page.locator('#sheet .compat-body').boundingBox();
      const x = body.x + body.width * (slot === 'left' ? .2 : slot === 'right' ? .8 : .5), y = target.y - 5;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
      await page.mouse.move(x, y, { steps: 12 }); await settle();
      const preview = page.locator('#sheet .widget-insertion-preview');
      assert.equal(await preview.innerText(), '');
      assert.equal(await preview.evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
      assert.equal(await page.locator('#sheet .text-snap-preview').count(), 0, 'Widget text does not enter generic text drag');
      const predicted = await preview.evaluate(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) }));
      const shifted = await page.locator('#sheet .widget-reflow').count();
      assert(shifted > 0, 'Neighboring widgets preview their destination positions');
      await page.mouse.move(x + 1, y + 1); await settle();
      assert.equal(await preview.evaluate(el => parseFloat(el.style.top)), predicted.y, 'Small pointer movement does not flip insertion');
      await page.screenshot({ path: `/tmp/questmaker-widget-${width}-${slot}.png`, fullPage: true });
      if (cancel) await page.locator('#sheet').dispatchEvent('pointercancel', { pointerId: 1 });
      await page.mouse.up(); await settle();
      if (cancel) assert.deepEqual(await order(), before);
      else {
        const actual = await source.evaluate(el => { const root = el.closest('.sheet'), r = root.getBoundingClientRect(), b = el.getBoundingClientRect(), s = r.width / root.offsetWidth; return { x: (b.x - r.x) / s, y: (b.y - r.y) / s, width: b.width / s, height: b.height / s }; });
        for (const field of Object.keys(actual)) assert(Math.abs(actual[field] - predicted[field]) < 1, JSON.stringify({ actual, predicted }));
        assert(await source.evaluate((el, slot) => el.classList.contains('slot-' + slot), slot));
      }
      assert.equal(await page.locator(`#sheet [data-text="${key}"]`).innerHTML(), originalHTML);
      assert.equal(await page.locator('#sheet .widget-insertion-preview,#sheet .widget-reflow,#sheet .free-text').count(), 0);
    }
    await page.locator('#undoButton').click(); await page.locator('#undoButton').click();
    assert.deepEqual(await order(), initialOrder, 'Undo restores original component order');
    assert.deepEqual(errors, []);
    console.log('PASS: widget-owned text drag, full/left placement, solid insertion preview and live neighbor positions, stable touch-width targeting, cancellation, undo, unchanged text.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
