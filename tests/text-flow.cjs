const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const modules = process.env.QUESTMAKER_TEST_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = require(path.join(modules, 'playwright'));
const sharp = require(path.join(modules, 'sharp'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 }, acceptDownloads: true });
  const out = '/tmp/questmaker-text-flow', errors = [];
  await fs.mkdir(out, { recursive: true });
  page.on('pageerror', e => errors.push(e.message));
  const settle = () => page.waitForTimeout(100);
  const text = key => page.locator(`#sheet [data-text="${key}"]`);
  const open = async mode => {
    if (await page.locator('#editorView').isVisible()) await page.locator('#homeButton').click();
    await page.locator(`[data-open="${mode}"]`).click(); await settle();
  };
  const number = async (selector, value) => {
    if(await page.locator(selector).getAttribute('type')==='range') await page.locator(selector).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},String(value)); else await page.locator(selector).fill(String(value)); await page.locator(selector).dispatchEvent('change'); await settle();
  };
  const drag = async (handle, x, y, cancel = false) => {
    const r = await handle.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 });
    const predicted = await page.locator('#sheet .text-snap-preview:not([hidden]) .text-snap-destination').evaluateAll(nodes => nodes.map(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) })));
    if (cancel) await page.locator('#sheet').dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up(); await settle();
    if (predicted.length && !cancel) {
      const actual = await page.locator('#sheet .rich.selected').evaluate(el => {
        const sheet = el.closest('.sheet'), root = sheet.getBoundingClientRect(), scale = root.width / sheet.offsetWidth;
        const r = (el.closest('[data-text-box],[data-component]') || el).getBoundingClientRect();
        return { x: (r.x - root.x) / scale, y: (r.y - root.y) / scale, width: r.width / scale, height: r.height / scale };
      });
      for (const field of ['x', 'y', 'width', 'height']) assert(Math.abs(actual[field] - predicted[0][field]) < 1, `Preview ${field} matches drop: ${JSON.stringify({ actual, predicted: predicted[0] })}`);
    }
    assert.equal(await page.locator('#sheet .text-snap-preview').count(), 0, 'Preview cleans up after drop/cancel');
  };
  const size = () => page.locator('#sheet').evaluate(el => [el.offsetWidth, el.offsetHeight]);
  try {
    await page.goto('file://' + path.resolve('index.html'));
    for (const [mode, keys] of [[0, ['rank-number-0', 'rank-title-0', 'title', 'respondent']], [1, ['grid-caption-0', 'title', 'respondent']], [2, ['node-name-0', 'title', 'respondent']], [3, ['person-0', 'person-1', 'title', 'respondent']]]) {
      await open(mode);
      const top = await text('title').evaluate(el => {
        const root = el.closest('.sheet'), scale = root.getBoundingClientRect().width / root.offsetWidth;
        return (el.getBoundingClientRect().top - root.getBoundingClientRect().top) / scale;
      });
      assert(Math.abs(top - (mode === 2 ? 25.6 : 38.4)) < .1, 'Doubled title top margin');
      for (const key of keys) {
        await text(key).click(); await page.locator('#removeText').click(); await settle();
        assert.equal(await text(key).count(), 0);
        if (key === 'person-0') assert.equal(await text('person-1').evaluate(el => getComputedStyle(el).gridColumnStart), '2');
        await page.locator('#undoButton').click(); assert.equal(await text(key).count(), 1);
        await page.locator('#redoButton').click(); assert.equal(await text(key).count(), 0);
      }
      await open((mode + 1) % 4); await open(mode);
      for (const key of keys) assert.equal(await text(key).count(), 0, 'Deleted defaults stay deleted');
      await page.locator('#addText').click();
      let added = page.locator('#sheet .flow-text .rich, #sheet .component-text').last();
      const key = await added.getAttribute('data-text'); await added.fill('新的整行标题');
      await page.locator('#textPlacement').selectOption('layout-top'); await settle();
      assert.equal(await page.locator('#sheet .layout-top .rich').count(), 1);
      const body = page.locator('#sheet .rank-body,#sheet .grid-body,#sheet .relation-map,#sheet .compat-body');
      let a = await text(key).boundingBox(), b = await body.boundingBox();
      // Relation map bounds include a margin above the first avatar.
      if (mode !== 2) assert(a.y + a.height <= b.y + 1);
      await page.locator('#textPlacement').selectOption('layout-bottom'); await settle();
      assert.equal(await page.locator('#sheet .layout-bottom .rich').count(), 1);
      assert.equal(await text(key).evaluate(el => el.parentElement.offsetWidth), await body.evaluate(el => el.offsetWidth));
      await page.locator('#textPlacement').selectOption('free'); await settle();
      b = await body.boundingBox();
      const topY = mode === 2 ? await page.locator('#sheet').evaluate(el => el.getBoundingClientRect().top + 25.6 * el.getBoundingClientRect().width / el.offsetWidth) : b.y;
      await drag(page.locator(`#sheet [data-drag-text="${key}"]`), b.x + b.width / 2, topY + 2);
      assert.equal(await page.locator('#sheet .layout-top .rich').count(), 1, 'Drag into top full-row zone');
      b = await body.boundingBox();
      await drag(page.locator(`#sheet [data-drag-text="${key}"]`), b.x + b.width / 2, b.y + b.height - 2);
      assert.equal(await page.locator('#sheet .layout-bottom .rich').count(), 1, 'Drag into bottom full-row zone');
      const imageFrame = page.locator('#sheet [data-frame]').first();
      const imageBounds = await imageFrame.boundingBox();
      await drag(page.locator(`#sheet [data-drag-text="${key}"]`), imageBounds.x + imageBounds.width / 2, imageBounds.y + imageBounds.height / 2);
      assert.equal(await imageFrame.locator(`[data-text="${key}"]`).count(), 1, 'Image-frame inside snap is retained');
      await page.locator('#textPlacement').selectOption('free'); await settle();
      const freeStyle = await text(key).locator('..').getAttribute('style');
      b = await body.boundingBox();
      await drag(page.locator(`#sheet [data-drag-text="${key}"]`), b.x + b.width / 2, b.y + 2, true);
      assert.equal(await text(key).locator('..').getAttribute('style'), freeStyle, 'Cancelled snap restores original free position');
      await page.locator('#removeText').click();
    }

    await page.reload(); await open(3);
    assert.equal(await page.locator('[data-add-component="text"]').count(), 0);
    const frame = key => page.locator(`#sheet [data-image="${key}"]`);
    const resize = async (key, delta, cancel = false) => {
      await frame(key).click(); const grip = page.locator(`#sheet [data-resize-frame="${key}"]`);
      await grip.scrollIntoViewIfNeeded(); const r = await grip.boundingBox();
      const scale = await page.locator('#sheet').evaluate(el => el.getBoundingClientRect().width / el.offsetWidth);
      await drag(grip, r.x + r.width / 2, r.y + r.height / 2 + delta * scale, cancel);
    };
    const bottomDifference = async () => {
      const a = await frame('portrait-0').boundingBox(), b = await frame('portrait-1').boundingBox();
      return Math.abs(a.y + a.height - b.y - b.height);
    };
    await resize('portrait-0', 35); assert(await bottomDifference() > 20);
    await resize('portrait-0', -28); assert(await bottomDifference() < .2, 'Bottom snaps within twelve paper pixels');
    await page.locator('#undoButton').click(); assert(await bottomDifference() > 20);
    await page.locator('#redoButton').click(); assert(await bottomDifference() < .2);
    await resize('portrait-0', 50, true); assert(await bottomDifference() < .2, 'Cancelled resize restores geometry');
    await page.locator('#people').selectOption('1');
    const singleHeight = await frame('portrait-0').evaluate(el => el.offsetHeight);
    await resize('portrait-0', 7);
    assert.equal(await frame('portrait-0').evaluate(el => el.offsetHeight), singleHeight + 7, 'Single mode does not snap to hidden frame');
    await page.locator('#people').selectOption('2');
    await page.locator('#sheet [data-text="title"]').click(); await page.locator('#addText').click();
    let key = await page.locator('#sheet .component-text').last().getAttribute('data-text');
    await page.locator('#textPlacement').selectOption('before:pace'); await settle();
    assert.equal(await text(key).evaluate(el => el.closest('[data-component]').nextElementSibling.dataset.component), 'pace');
    assert.equal(await text(key).evaluate(el => el.closest('[data-component]').classList.contains('slot-full')), true);
    await page.locator('#textPlacement').selectOption('layout-top'); await settle();
    const target = await page.locator('#sheet [data-component="expression"]').boundingBox();
    const scale = await page.locator('#sheet').evaluate(el => el.getBoundingClientRect().width / el.offsetWidth);
    await drag(page.locator(`#sheet [data-drag-text="${key}"]`), target.x + target.width / 2, target.y - 10 * scale);
    assert.equal(await text(key).evaluate(el => el.closest('[data-component]').nextElementSibling.dataset.component), 'expression');
    const body = await page.locator('#sheet .compat-body').boundingBox();
    await drag(text(key).locator('..').locator('[data-drag-block]'), body.x + body.width / 2, body.y + 2);
    assert.equal(await page.locator('#sheet .layout-top .rich').count(), 1, 'Component text drags into a full row above layout');
    await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });

    await open(1); await number('#rows', 1);
    const gap = await page.locator('#sheet').evaluate(el => {
      const caption = el.querySelector('.cell-caption').getBoundingClientRect(), footer = el.querySelector('.watermark').getBoundingClientRect();
      return (footer.top - caption.bottom) / (el.getBoundingClientRect().width / el.offsetWidth);
    });
    assert(gap >= 0 && gap <= 20, 'Single-row watermark is close without overlap');
    await open(2);
    const ratio = () => page.locator('#sheet').evaluate(el => el.querySelector('.corner-legend').getBoundingClientRect().width / el.getBoundingClientRect().width);
    const before = await ratio(); await number('#nodeCount', 24); assert(Math.abs(await ratio() - before) < .001);
    await page.screenshot({ path: path.join(out, 'legend-24.png'), fullPage: true });
    const exportSize = await size();
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const mode of [0, 1, 2, 3]) {
        await open(mode); await page.locator('#zoomFit').click(); await settle();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert(await page.locator('#sheetFrame').evaluate(el => el.getBoundingClientRect().width <= el.parentElement.clientWidth + 1));
      }
      await open(2); const r = await page.locator('#sheet').boundingBox();
      await page.locator('#zoomIn').click(); await page.locator('#zoomIn').click(); await settle();
      assert((await page.locator('#sheet').boundingBox()).width > r.width * 1.5);
      assert.deepEqual(await size(), exportSize, 'Zoom does not change export size');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Zoom only scrolls within canvas');
      if (width === 390) await page.screenshot({ path: path.join(out, 'mobile-zoom.png'), fullPage: true });
      await page.locator('#zoomFit').click(); await settle();
      if (width === 320) await page.screenshot({ path: path.join(out, 'mobile-fit.png'), fullPage: true });
    }
    await page.locator('#exportButton').click(); const pending = page.waitForEvent('download'); await page.locator('#downloadButton').click(); await page.locator('#saveExport').click(); await page.locator('#closeExportPreview').click();
    const file = await pending, filename = path.join(out, 'relation-export.png'); await file.saveAs(filename);
    const meta = await sharp(filename).metadata(); assert.equal(meta.width, exportSize[0] * 2); assert.equal(meta.height, exportSize[1] * 2);
    const stats = await sharp(filename).stats(); assert(stats.channels[0].stdev > 5, 'Nonblank exported canvas');
    assert.deepEqual(errors, []);
    console.log('PASS: removable defaults/undo, doubled top margins, flow/frame text placement, component full-row snapping, paired frame bottom snapping, legend scaling, compact footer, mobile zoom and export.');
  } catch (error) { await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }); throw error; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
