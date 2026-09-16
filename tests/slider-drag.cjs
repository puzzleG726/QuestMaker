const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const modules = process.env.QUESTMAKER_TEST_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = require(path.join(modules, 'playwright'));
const sharp = require(path.join(modules, 'sharp'));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 }, acceptDownloads: true });
  const errors = [], out = '/tmp/questmaker-slider-drag';
  await fs.mkdir(out, { recursive: true });
  page.on('pageerror', e => errors.push(e.message));
  const knob = page.locator('#sheet [data-knob="voice-0"]');
  const track = page.locator('#sheet [data-scale="voice-0"]');
  const range = async (selector, value) => {
    await page.locator(selector).evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    await page.waitForTimeout(60);
  };
  const rects = () => knob.evaluate(el => {
    const k = el.getBoundingClientRect(), t = el.parentElement.getBoundingClientRect(), scale = t.width / el.parentElement.clientWidth;
    return { width: k.width / scale, left: (k.left - t.left) / scale, right: (k.right - t.right) / scale, track: t.width / scale };
  });
  const dragKnob = async (startFraction, delta) => {
    const b = await knob.boundingBox(), x = b.x + b.width * startFraction, y = b.y + b.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + delta, y, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(80);
  };
  try {
    await page.goto('file://' + path.resolve('index.html'));
    await page.locator('[data-open="3"]').click();
    await knob.click(); await page.locator('#knobShape').selectOption('rectangle');
    assert.equal(await page.locator('#knobLength').getAttribute('type'), 'range');
    const max = Number(await page.locator('#knobLength').getAttribute('max'));
    assert.equal(max, await track.evaluate(e => e.parentElement.clientWidth));
    for (const length of [10, 100, max]) {
      await range('#knobLength', length);
      const bounds = await rects(); assert(Math.abs(bounds.width - length) < 1);
      await range('#sheet [data-scale="voice-0"]', 0);
      assert(Math.abs((await rects()).left + 3) < 1, 'Left overhang is 3px');
      await range('#sheet [data-scale="voice-0"]', 100);
      assert(Math.abs((await rects()).right - 3) < 1, 'Right overhang is 3px');
    }
    await range('#knobLength', 100); await range('#sheet [data-scale="voice-0"]', 50);
    const start = await rects(); await dragKnob(.85, 8);
    const after = await rects(); assert(after.left > start.left && after.left - start.left < 12, 'Off-center grab does not jump');
    await dragKnob(.5, -600); assert(Math.abs((await rects()).left + 3) < 1);
    await dragKnob(.5, 600); assert(Math.abs((await rects()).right - 3) < 1);
    const t = await track.boundingBox();
    await page.mouse.move(t.x + 2, t.y + t.height / 2); await page.mouse.down();
    await page.mouse.move(t.x + t.width - 2, t.y + t.height / 2, { steps: 10 }); await page.mouse.up();
    assert(Math.abs((await rects()).right - 3) < 1, 'Track dragging uses the same bounds');
    await page.locator('#knobVisible').uncheck();
    await page.locator('#sheet [data-text="voice-title"]').click();
    assert.equal(await page.locator('[data-edit-knob]').count(), 0);
    await track.click({ position: { x: 5, y: 5 } }); await page.locator('#knobVisible').check();
    assert(await knob.isVisible());
    await page.locator('#people').selectOption('1');
    await page.locator('#sheet [data-text="title"]').click(); await page.locator('#addText').click();
    const text = page.locator('#sheet [data-kind="text"]');
    const id = await text.getAttribute('data-component');
    const grip = page.locator(`#sheet [data-drag-block="${id}"]`);
    assert.equal(await text.locator('.block-actions button').count(), 1);
    await page.locator('#componentSlot').selectOption('left');
    const target = await page.locator('#sheet [data-component="voice"]').boundingBox();
    const g = await grip.boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down();
    await page.mouse.move(target.x + 15, target.y + 2, { steps: 10 }); await page.mouse.up();
    const order = await page.locator('#sheet [data-component]').evaluateAll(es => es.map(e => e.dataset.component));
    assert(order.indexOf(id) < order.indexOf('voice'), 'Grip reorders short text components');
    const overlaps = await page.locator('#sheet .block-actions').evaluateAll(es => es.some((a, i) => es.slice(i + 1).some(b => {
      const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
      return Math.min(x.right, y.right) > Math.max(x.left, y.left) && Math.min(x.bottom, y.bottom) > Math.max(x.top, y.top);
    })));
    assert.equal(overlaps, false, 'Drag handles do not overlap adjacent widgets');
    await page.locator('#componentType').selectOption('quadrant'); await page.locator('#addComponent').click();
    const chart = page.locator('#sheet .quadrant-chart');
    assert(await chart.evaluate(el => {
      const axis = el.querySelector('.axis-x').getBoundingClientRect();
      return [...el.querySelectorAll('.label-left,.label-right')].every(label => label.getBoundingClientRect().top > axis.bottom);
    }), 'X-axis labels sit below the line');
    await knob.click(); await page.locator('#knobShape').selectOption('rectangle');
    await range('#knobLength', Number(await page.locator('#knobLength').getAttribute('max')));
    await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
    await page.locator('#exportButton').click(); const pending = page.waitForEvent('download');
    await page.locator('#downloadButton').click(); const file = await pending;
    await file.saveAs(path.join(out, 'export.png'));
    const stats = await sharp(path.join(out, 'export.png')).stats(); assert(stats.channels.some(c => c.stdev > 10));
    await page.setViewportSize({ width: 390, height: 844 });
    await knob.click(); assert.equal(await page.locator('[data-edit-knob]').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: length slider/max width, 3px endpoint overhang, stable knob/track drags, hidden knob access, widget grip hit regions/reorder, X-axis labels, export, mobile.');
  } catch (error) { await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
