const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const modules = process.env.QUESTMAKER_TEST_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = require(path.join(modules, 'playwright'));
const sharp = require(path.join(modules, 'sharp'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 2200 }, acceptDownloads: true });
  const errors = [], out = '/tmp/questmaker-canvas-widgets';
  await fs.mkdir(out, { recursive: true });
  page.on('pageerror', error => errors.push(error.message));
  const open = async mode => {
    if (await page.locator('#editorView').isVisible()) await page.locator('#homeButton').click();
    await page.locator(`[data-open="${mode}"]`).click();
    await page.waitForTimeout(80);
  };
  const color = (selector, value) => page.locator(selector).evaluate((el, value) => {
    el.value = value; el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  const number = async (selector, value) => {
    if (await page.locator(selector).getAttribute('type') === 'range') await page.locator(selector).evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(value));
    else await page.locator(selector).fill(String(value));
    await page.locator(selector).dispatchEvent('change');
    await page.waitForTimeout(80);
  };
  const resize = async (key, width, height) => {
    const selector = `#sheet [data-resize-frame="${key}"]`;
    await page.locator(`#sheet [data-image="${key}"]`).click();
    await page.locator(selector).scrollIntoViewIfNeeded();
    const grip = await page.locator(selector).boundingBox();
    const before = await page.locator(`#sheet [data-image="${key}"]`).evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight }));
    const scale = await page.locator('#sheet').evaluate(el => el.getBoundingClientRect().width / el.offsetWidth);
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + (width - before.width) * scale, grip.y + grip.height / 2 + (height - before.height) * scale, { steps: 12 });
    await page.mouse.up(); await page.waitForTimeout(100);
  };
  try {
    await page.goto('file://' + path.resolve('index.html'));
    for (const mode of [0, 1, 2, 3]) {
      await open(mode);
      const style = await page.locator('#sheet').evaluate(el => {
        const s = getComputedStyle(el);
        return { top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom), font: getComputedStyle(el.querySelector('.respondent')).fontSize };
      });
      assert.equal(style.font, '17px'); assert.equal(style.bottom, 9.6);
      assert.equal(style.top, mode === 2 ? 25.6 : 38.4);
      await page.locator('#sheet [data-text="title"]').click();
      await color('#textFill', '#ddeeff');
      assert.equal(await page.locator('#sheet [data-text="title"]').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(221, 238, 255)');
      await open((mode + 1) % 4); await open(mode);
      assert.equal(await page.locator('#sheet [data-text="title"]').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(221, 238, 255)');
      await page.locator('#sheet [data-text="title"]').click();
      await page.locator('#clearTextFill').click();
    }
    await open(2);
    let lastWidth = 0;
    for (const count of [3, 8, 12, 13, 18, 19, 24]) {
      await number('#nodeCount', count);
      const sizes = await page.locator('#sheet [data-image]').evaluateAll(es => es.map(e => [e.offsetWidth, e.offsetHeight]));
      assert(sizes.every(([w, h]) => w === 66 && h === 66));
      const paper = await page.locator('#sheet').evaluate(e => [e.offsetWidth, e.offsetHeight]);
      assert.equal(paper[0], paper[1]); assert(paper[0] >= lastWidth); lastWidth = paper[0];
      const overlaps = await page.locator('#sheet .relation-map').evaluate(map => {
        const boxes = [...map.querySelectorAll('[data-image],.node-name')].map(el => el.getBoundingClientRect());
        return boxes.some((a, i) => boxes.slice(i + 1).some(b => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1));
      });
      assert.equal(overlaps, false, `No node/label overlap at ${count}`);
    }
    await page.screenshot({ path: path.join(out, 'relation-24.png'), fullPage: true });
    await open(3);
    await page.locator('#sheet [data-scale="voice-0"]').click({ position: { x: 30, y: 10 } });
    assert(await page.locator('#knobShape').isVisible());
    await page.locator('#knobShape [data-option="rectangle"]').click();
    await number('#knobLength', 55); await page.locator('#knobVisible').uncheck();
    assert(await page.locator('#sheet [data-knob="voice-0"]').isHidden());
    await page.locator('#sheet [data-text="voice-title"]').click();
    await page.locator('#sheet [data-scale="voice-0"]').click({ position: { x: 30, y: 10 } });
    await page.locator('#knobVisible').check();
    assert.equal(await page.locator('#sheet [data-knob="voice-0"]').evaluate(e => e.offsetWidth), 55);
    await resize('portrait-0', 210, 250);
    assert.equal(await page.locator('#sheet [data-image="portrait-0"]').evaluate(e => e.offsetHeight), 250);
    assert.equal(await page.locator('#sheet [data-image="portrait-1"]').evaluate(e => e.offsetHeight), 393);
    await page.locator('#undoButton').click();
    assert.equal(await page.locator('#sheet [data-image="portrait-0"]').evaluate(e => e.offsetHeight), 393);
    await page.locator('#redoButton').click();
    await page.locator('#people').selectOption('1');
    await resize('portrait-0', 500, 320);
    assert(await page.locator('#sheet [data-component="portrait"]').evaluate(e => e.classList.contains('slot-full')));
    await resize('portrait-0', 300, 260);
    assert(await page.locator('#sheet [data-component="portrait"]').evaluate(e => e.classList.contains('slot-left')));
    assert.equal(await page.locator('#sheet [data-image="portrait-0"]').evaluate(e => e.offsetWidth), 295);
    await page.locator('#componentSlot').selectOption('right');
    await resize('portrait-0', 293, 270);
    assert(await page.locator('#sheet [data-component="portrait"]').evaluate(e => e.classList.contains('slot-right')));
    await page.locator('#people').selectOption('2');
    await page.locator('[data-add-component="quadrant"]').click();
    const chart = page.locator('#sheet .quadrant-chart');
    const id = await chart.getAttribute('data-quadrant');
    await chart.click({ position: { x: 140, y: 100 } });
    const dot = chart.locator('.quadrant-dot');
    assert.equal(await dot.count(), 1);
    await color('[data-theme="0"]', '#ee3355'); await color('[data-theme="1"]', '#22aacc');
    assert.equal(await dot.evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(238, 51, 85)');
    await dot.click(); assert.equal(await dot.evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(34, 170, 204)');
    await dot.click(); assert.equal(await dot.count(), 0);
    await chart.click({ position: { x: 150, y: 110 } });
    await page.locator('#undoButton').click(); assert.equal(await dot.count(), 0);
    await page.locator('#redoButton').click(); assert.equal(await dot.count(), 1);
    await page.locator(`#sheet [data-text="${id}-top"]`).fill('长期相处');
    await number('#fontSize', 22); await color('#textFill', '#ffeedd');
    await page.locator('#componentSlot').selectOption('left');
    assert.equal(await chart.evaluate(e => e.offsetWidth), await chart.evaluate(e => e.offsetHeight));
    await page.screenshot({ path: path.join(out, 'compat.png'), fullPage: true });
    await page.locator('#exportButton').click(); const downloading = page.waitForEvent('download');
    await page.locator('#downloadButton').click(); await page.locator('#saveExport').click(); await page.locator('#closeExportPreview').click(); const file = await downloading;
    const exportPath = path.join(out, 'compat-export.png'); await file.saveAs(exportPath);
    const stats = await sharp(exportPath).stats(); assert(stats.channels.some(c => c.stdev > 10));
    const { data, info } = await sharp(exportPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let dots = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] === 238 && data[i + 1] === 51 && data[i + 2] === 85) dots++;
    assert(dots > 100, 'Theme dot appears in the exported image');
    await page.locator('#people').selectOption('1'); await dot.click(); assert.equal(await dot.count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const mode of [2, 3]) {
      await open(mode); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(out, `mobile-${mode}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: text fill, respondent/margins, fixed 66px avatars 3–24, knob controls/toggle, image resizing/snapping/undo, quadrant themes/text/undo/export, mobile.');
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }); throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
