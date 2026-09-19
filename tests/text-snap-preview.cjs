const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const settle = () => page.waitForTimeout(100);
  const rect = el => {
    const root = el.closest('.sheet'), r = root.getBoundingClientRect(), b = el.getBoundingClientRect(), scale = r.width / root.offsetWidth;
    return { x: (b.x - r.x) / scale, y: (b.y - r.y) / scale, width: b.width / scale, height: b.height / scale };
  };
  const drop = async (key, point, label, screenshot) => {
    const grip = await page.locator(`#sheet [data-drag-text="${key}"]`).boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down();
    await page.mouse.move(point.x, point.y, { steps: 8 });
    const preview = page.locator('#sheet .text-snap-preview:not([hidden])');
    assert.equal(await preview.locator('span').innerText(), label);
    assert.equal(await preview.locator('.text-snap-object').evaluate(el => getComputedStyle(el).outlineStyle), 'dashed');
    assert.equal(await preview.locator('.text-snap-destination').evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
    const predicted = await preview.locator('.text-snap-destination').evaluate(rect);
    await page.screenshot({ path: '/tmp/' + screenshot + '.png', fullPage: true });
    await page.mouse.up(); await settle();
    const actual = await page.locator(`#sheet [data-text-box="${key}"]`).evaluate(rect);
    for (const field of Object.keys(actual)) assert(Math.abs(actual[field] - predicted[field]) < 1, JSON.stringify({ label, actual, predicted }));
    assert.equal(await page.locator('.text-snap-measure,.text-snap-preview').count(), 0);
  };
  try {
    await page.goto('file://' + path.resolve('index.html'));
    await page.locator('[data-open="1"]').click();
    await page.locator('#addText').click();
    let key = await page.locator('#sheet .flow-text .rich').getAttribute('data-text');
    await page.locator('#textPlacement').selectOption('free'); await settle();
    let frame = await page.locator('#sheet [data-frame]').nth(3).boundingBox();
    await drop(key, { x: frame.x + frame.width / 2, y: frame.y - 25 }, '框上方', 'questmaker-snap-above');
    frame = await page.locator('#sheet [data-frame]').nth(3).boundingBox();
    await drop(key, { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }, '框内', 'questmaker-snap-inside');
    await page.locator('#homeButton').click(); await page.locator('[data-open="2"]').click();
    await page.locator('#addText').click();
    key = await page.locator('#sheet .flow-text .rich').getAttribute('data-text');
    await page.locator('#textPlacement').selectOption('free'); await settle();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1600 }); await settle();
      const target = await page.locator('#sheet').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 26 * r.width / el.offsetWidth }; });
      await drop(key, target, '页面顶部', 'questmaker-snap-top-' + width);
      const title = await page.locator('#sheet [data-text="title"]').evaluate(rect);
      const text = await page.locator(`#sheet [data-text-box="${key}"]`).evaluate(rect);
      assert(text.y + text.height < title.y, 'Top text precedes title and respondent');
      await page.locator('#textPlacement').selectOption('free'); await settle();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: dashed target / solid destination, above and inside frame previews, relation top before title, exact desktop/mobile drop geometry, preview cleanup.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
