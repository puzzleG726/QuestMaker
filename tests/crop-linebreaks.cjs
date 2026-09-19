const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const modules = process.env.QUESTMAKER_TEST_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = require(path.join(modules, 'playwright'));
const sharp = require(path.join(modules, 'sharp'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 }, acceptDownloads: true });
  const out = '/tmp/questmaker-crop', errors = [];
  await fs.mkdir(out, { recursive: true }); page.on('pageerror', e => errors.push(e.message));
  const settle = () => page.waitForTimeout(100);
  const text = key => page.locator(`#sheet [data-text="${key}"]`);
  const open = async mode => {
    if (await page.locator('#editorView').isVisible()) await page.locator('#homeButton').click();
    await page.locator(`[data-open="${mode}"]`).click(); await settle();
  };
  const paint = async (selector, value) => page.locator(selector).evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  const upload = async (button, buffer) => {
    const pending = page.waitForEvent('filechooser'); await page.locator(button).click();
    await (await pending).setFiles({ name: 'crop-test.png', mimeType: 'image/png', buffer }); await settle();
  };
  const source = () => page.locator('#sheet [data-image="grid-0"] img').getAttribute('src');
  const pixels = data => sharp(Buffer.from(data.split(',')[1], 'base64'));
  const crop = async () => { await page.locator('#cropImage').click(); await page.waitForFunction(() => !document.querySelector('#applyCrop').disabled); await settle(); };
  const view = async () => page.locator('#cropCanvas').evaluate(el => {
    const r = el.getBoundingClientRect(), scale = Math.min((el.clientWidth - 24) / 600, (el.clientHeight - 24) / 400);
    return { scale, x: r.left + (el.clientWidth - 600 * scale) / 2, y: r.top + (el.clientHeight - 400 * scale) / 2 };
  });
  const drag = async (a, b, cancel = false) => {
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 12 });
    if (cancel) await page.locator('#cropCanvas').dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up(); await settle();
  };
  try {
    await page.goto('file://' + path.resolve('index.html'));
    for (const mode of [0, 1, 2, 3]) {
      await open(mode); const el = text('title'); await el.fill('收集'); await el.press('End'); await el.press('Enter'); await page.keyboard.insertText('战利品');
      assert.equal(await el.innerText(), '收集\n战利品');
      await page.locator('#fontSize').fill('28'); await page.locator('#fontSize').dispatchEvent('change');
      await open((mode + 1) % 4); await open(mode); assert.equal(await text('title').innerText(), '收集\n战利品', 'Enter survives model rerender');
      await text('title').evaluate(el => { el.focus(); const range = document.createRange(); range.selectNodeContents(el); range.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(range); }); await text('title').press('Shift+Enter'); await page.keyboard.insertText('第三行');
      await text('title').press('Enter'); await text('title').press('Enter'); await page.keyboard.insertText('第五行');
      const expected = await text('title').innerText();
      await page.locator('#textStyle').selectOption('title2'); await paint('#textColor', '#c63355');
      await open((mode + 1) % 4); await open(mode); assert.equal(await text('title').innerText(), expected, 'Empty lines and Shift+Enter survive format changes');
      await text('title').evaluate(el => {
        el.focus(); const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
        const first = nodes.find(n => n.textContent.includes('收集')), last = nodes.find(n => n.textContent.includes('战利品')), range = document.createRange();
        range.setStart(first, 1); range.setEnd(last, 2); getSelection().removeAllRanges(); getSelection().addRange(range); document.dispatchEvent(new Event('selectionchange'));
      });
      await paint('#textColor', '#3366cc'); await open((mode + 1) % 4); await open(mode);
      assert.equal(await text('title').innerText(), expected, 'Cross-line partial color preserves manual line breaks');
    }
    await open(1); await page.locator('#sheet [data-image="grid-0"]').click(); await page.locator('#addFrameText').click();
    await text('frame-grid-0').fill('收集'); await text('frame-grid-0').press('End'); await text('frame-grid-0').press('Enter'); await page.keyboard.insertText('战利品');
    await page.locator('#textStyle').selectOption('title2'); await page.locator('#textPlacement').selectOption('above');
    assert.equal(await text('frame-grid-0').innerText(), '收集\n战利品');
    await page.locator('#undoButton').click(); await page.locator('#redoButton').click();
    assert.equal(await text('frame-grid-0').innerText(), '收集\n战利品');
    await text('frame-grid-0').click();
    const gaps = await page.locator('#selectionProperties').evaluate(root => {
      const header = root.querySelector('.selected-label'), icon = header.querySelector('svg').getBoundingClientRect(), title = header.querySelector('h3').getBoundingClientRect();
      const boxes = [...root.querySelector('.property-section').children].map(el => el.getBoundingClientRect());
      return { aligned: Math.abs(icon.top + icon.height / 2 - title.top - title.height / 2) < 1, separated: boxes.every((r, i) => !i || r.top - boxes[i - 1].bottom >= 12), last: root.querySelector('.property-section').lastElementChild.id };
    });
    assert(gaps.aligned && gaps.separated); assert.equal(gaps.last, 'removeText');
    await page.locator('#selectionProperties').screenshot({ path: path.join(out, 'text-panel.png') });

    await page.reload(); await open(1);
    const stripes = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#ff0000' } }).composite([
      { input: await sharp({ create: { width: 200, height: 400, channels: 3, background: '#00ff00' } }).png().toBuffer(), left: 200, top: 0 },
      { input: await sharp({ create: { width: 200, height: 400, channels: 3, background: '#0000ff' } }).png().toBuffer(), left: 400, top: 0 }
    ]).png().toBuffer();
    await page.locator('#sheet [data-image="grid-0"]').click(); assert(await page.locator('#cropImage').isDisabled());
    await upload('#replaceImage', stripes); const original = await source();
    const bounds = await page.locator('#sheet [data-image="grid-0"]').evaluate(el => [el.offsetWidth, el.offsetHeight]);
    await crop(); let v = await view();
    assert.equal(await page.locator('#cropDimensions').innerText(), '400 × 400 px');
    await drag({ x: v.x + 300 * v.scale, y: v.y + 200 * v.scale }, { x: v.x + 100 * v.scale, y: v.y + 200 * v.scale });
    await page.locator('#cropDialog').screenshot({ path: path.join(out, 'crop-desktop.png') });
    await page.locator('#cancelCrop').click(); assert.equal(await source(), original, 'Cancel does not change image');
    await crop(); await page.keyboard.press('ControlOrMeta+z'); assert.equal(await source(), original, 'Crop modal does not undo the underlying questionnaire');
    v = await view(); await drag({ x: v.x + 300 * v.scale, y: v.y + 200 * v.scale }, { x: v.x + 100 * v.scale, y: v.y + 200 * v.scale });
    await page.locator('#applyCrop').click(); await settle();
    let meta = await pixels(await source()).metadata(); assert.equal(meta.width, 400); assert.equal(meta.height, 400);
    const rightPixel = await pixels(await source()).extract({ left: 390, top: 200, width: 1, height: 1 }).raw().toBuffer(); assert(rightPixel[1] > 240 && rightPixel[2] < 10, 'Crop selects the left red/green area, not the blue edge');
    assert.deepEqual(await page.locator('#sheet [data-image="grid-0"]').evaluate(el => [el.offsetWidth, el.offsetHeight]), bounds, 'Cropping never resizes the frame');
    const cropped = await source(); await page.locator('#undoButton').click(); assert.equal(await source(), original); await page.locator('#redoButton').click(); assert.equal(await source(), cropped);
    await page.locator('#sheet [data-image="grid-0"]').click(); await crop(); assert.equal(await page.locator('#cropDimensions').innerText(), '400 × 400 px');
    await page.locator('#resetCrop').click(); assert.equal(await page.locator('#cropDimensions').innerText(), '600 × 400 px');
    await page.locator('#applyCrop').click(); assert.equal(await source(), original, 'Non-destructive original restoration');
    await crop(); await page.locator('#cropAspect').selectOption('free'); v = await view();
    await drag({ x: v.x + 600 * v.scale, y: v.y + 400 * v.scale }, { x: v.x + 300 * v.scale, y: v.y + 200 * v.scale }, true);
    assert.equal(await page.locator('#cropDimensions').innerText(), '600 × 400 px', 'Cancelled pointer resize restores crop');
    await drag({ x: v.x + 600 * v.scale, y: v.y + 400 * v.scale }, { x: v.x + 300 * v.scale, y: v.y + 200 * v.scale });
    await page.locator('#applyCrop').click(); meta = await pixels(await source()).metadata(); assert(Math.abs(meta.width - 300) < 2 && Math.abs(meta.height - 200) < 2, 'Corner drag changes selected source area');
    await page.locator('#imageShape [data-option="circle"]').click(); await page.locator('#imageFit').selectOption('contain'); await crop(); await page.keyboard.press('Escape'); assert(await page.locator('#cropDialog').isHidden()); assert.equal(await page.locator('#imageFit').inputValue(), 'contain');
    await upload('#replaceImage', stripes); await crop(); await page.locator('#resetCrop').click(); assert.equal(await page.locator('#cropDimensions').innerText(), '600 × 400 px'); await page.locator('#cancelCrop').click();

    for (const [mode, key] of [[0, 'rank-0-0'], [2, 'node-0'], [3, 'portrait-0']]) {
      await open(mode); await page.locator(`#sheet [data-image="${key}"]`).click(); await upload('#replaceImage', stripes);
      if (mode === 0) await page.locator('#sheet .rank-picture').click();
      await crop(); await page.locator('#cropAspect').selectOption('1'); await page.locator('#applyCrop').click(); await settle();
      const selector = mode === 0 ? '#sheet .rank-picture img' : `#sheet [data-image="${key}"] img`;
      const data = await page.locator(selector).getAttribute('src'), result = await pixels(data).metadata(); assert.equal(result.width, result.height);
      if (mode === 0) assert(await page.locator('#sheet .rank-picture').evaluate(el => Math.abs(el.offsetHeight - el.offsetWidth) < 2));
    }
    await open(1); await page.locator('#sheet [data-image="grid-0"]').click(); await page.locator('#imageShape [data-option=""]').click(); await page.locator('#imageFit').selectOption('cover');
    await crop(); v = await view(); await drag({ x: v.x + 300 * v.scale, y: v.y + 200 * v.scale }, { x: v.x + 100 * v.scale, y: v.y + 200 * v.scale }); await page.locator('#applyCrop').click();
    await page.locator('#exportButton').click(); const pending = page.waitForEvent('download'); await page.locator('#downloadButton').click(); await page.locator('#saveExport').click(); await page.locator('#closeExportPreview').click(); const download = await pending; await download.saveAs(path.join(out, 'cropped-export.png'));
    const cropBox = await page.locator('#sheet [data-image="grid-0"] img').evaluate(el => {
      const root = el.closest('.sheet'), r = el.getBoundingClientRect(), p = root.getBoundingClientRect(), scale = p.width / root.offsetWidth;
      return { left: Math.round((r.left - p.left + r.width * .9) / scale * 2), top: Math.round((r.top - p.top + r.height * .5) / scale * 2), width: 1, height: 1 };
    });
    const exported = await sharp(path.join(out, 'cropped-export.png')).extract(cropBox).raw().toBuffer(); assert(exported[1] > 220 && exported[2] < 30, 'Export uses selected crop');
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await crop(); await settle();
      assert(await page.locator('#cropDialog').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
      assert(await page.locator('#cropCanvas').evaluate(el => { const r = el.getBoundingClientRect(); return r.width > 200 && r.height > 150; }));
      await page.locator('#cropDialog').screenshot({ path: path.join(out, `crop-${width}.png`) }); await page.locator('#cancelCrop').click();
      await text('title').click(); await page.locator('#selectionProperties').screenshot({ path: path.join(out, `panel-${width}.png`) }); await page.locator('#sheet [data-image="grid-0"]').click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto('file://' + path.resolve('index.html')); await mobile.locator('[data-open="1"]').tap(); await mobile.locator('#sheet [data-image="grid-0"]').tap();
    const touchPicker = mobile.waitForEvent('filechooser'); await mobile.locator('#replaceImage').tap();
    await (await touchPicker).setFiles({ name: 'touch.png', mimeType: 'image/png', buffer: stripes }); await mobile.waitForFunction(() => !document.querySelector('#cropImage').disabled);
    await mobile.locator('#cropImage').tap(); await mobile.waitForFunction(() => !document.querySelector('#applyCrop').disabled);
    const touchView = await mobile.locator('#cropCanvas').evaluate(el => { const r = el.getBoundingClientRect(), scale = Math.min((el.clientWidth - 24) / 600, (el.clientHeight - 24) / 400); return { x: r.left + el.clientWidth / 2, y: r.top + el.clientHeight / 2, scale }; });
    const client = await mobile.context().newCDPSession(mobile);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchView.x, y: touchView.y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchView.x - 140 * touchView.scale, y: touchView.y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mobile.locator('#applyCrop').tap();
    const touchData = await mobile.locator('#sheet [data-image="grid-0"] img').getAttribute('src');
    const touchPixel = await pixels(touchData).extract({ left: 390, top: 200, width: 1, height: 1 }).raw().toBuffer(); assert(touchPixel[1] > 240 && touchPixel[2] < 10, 'Touch drag moves crop instead of scrolling page');
    await mobile.close();
    assert.deepEqual(errors, []); console.log('PASS: Enter/Shift+Enter/empty lines, cross-line formatting/rerender/undo, sidebar spacing, crop movement/corners/cancel/reset, all templates, replacement, export pixels, touch drag and mobile dialogs.');
  } catch (error) { await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }); throw error; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
