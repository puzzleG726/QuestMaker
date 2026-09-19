const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const modules = process.env.QUESTMAKER_TEST_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = require(path.join(modules, 'playwright'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const out = '/tmp/questmaker-inspector-options';
  await fs.mkdir(out, { recursive: true });
  try {
    for (const width of [1440, 320, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 650, isMobile: width < 650 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const click = async selector => width < 650 ? page.locator(selector).tap() : page.locator(selector).click();
      const open = async type => {
        if (await page.locator('#editorView').isVisible()) await click('#homeButton');
        await click('[data-open="' + type + '"]');
      };
      const choose = async (id, value) => {
        const selector = '#' + id + ' [data-option="' + value + '"]';
        await click(selector);
        assert.equal(await page.locator(selector).getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#' + id + ' [aria-pressed="true"]').count(), 1);
      };
      const checkGroup = async (id, count) => {
        assert.equal(await page.locator('#' + id + ' button').count(), count);
        assert.equal(await page.locator('#' + id + ' select, #' + id + ' [popover]').count(), 0);
        for (const option of await page.locator('#' + id + ' button').all()) {
          assert(await option.isVisible());assert(await option.getAttribute('aria-label'));
          assert.equal((await option.innerText()).trim(), '');
          const r = await option.boundingBox();
          assert(r.width >= 44 && r.height >= 44 && r.x >= 0 && r.x + r.width <= width);
        }
      };
      await page.goto('file://' + path.resolve('index.html'));
      await open(2);
      const positions = await page.locator('#legendPosition [data-option]').evaluateAll(els => els.map(el => el.dataset.option));
      await checkGroup('legendPosition', positions.length);
      for (const position of positions) {
        await choose('legendPosition', position);
        assert(await page.locator('#sheet .corner-legend.' + position).isVisible());
      }
      await page.screenshot({ path: path.join(out, 'legend-' + width + '.png'), fullPage: true });
      await open(1);await click('#sheet [data-image="grid-0"]');
      await checkGroup('imageShape', 5);
      for (const shape of ['square', 'circle', 'rectangle', 'rounded', '']) {
        await choose('imageShape', shape);
        if (shape) assert(await page.locator('#sheet [data-image="grid-0"]').evaluate((el, shape) => el.classList.contains(shape), shape));
      }
      await choose('imageShape', 'circle');await click('#undoButton');
      assert(!(await page.locator('#sheet [data-image="grid-0"]').getAttribute('class')).includes('circle'));
      await click('#redoButton');await click('#sheet [data-image="grid-0"]');
      assert.equal(await page.locator('#imageShape [data-option="circle"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#imageFit').evaluate(el => el.tagName), 'SELECT');
      await page.screenshot({ path: path.join(out, 'image-' + width + '.png'), fullPage: true });
      await open(3);await click('#sheet [data-knob="voice-0"]');
      await checkGroup('knobShape', 4);
      for (const shape of ['circle', 'heart', 'rectangle', 'default']) {
        await choose('knobShape', shape);
        if (shape !== 'default') assert(await page.locator('#sheet [data-knob="voice-0"]').evaluate((el, shape) => el.classList.contains('knob-' + shape), shape));
        assert.equal(await page.locator('#knobLength').count(), shape === 'rectangle' ? 1 : 0);
      }
      await page.locator('#knobShape [data-option="heart"]').focus();await page.keyboard.press('Space');
      assert.equal(await page.locator('#knobShape [data-option="heart"]').getAttribute('aria-pressed'), 'true');
      await page.screenshot({ path: path.join(out, 'knob-' + width + '.png'), fullPage: true });
      assert.equal(await page.locator('#componentType, #addComponent').count(), 0);
      const types = ['scale', 'checks', 'legend', 'box', 'image', 'quadrant'];
      assert.deepEqual(await page.locator('[data-add-component]').evaluateAll(els => els.map(el => el.dataset.addComponent)), types);
      for (const type of types) {
        const before = await page.locator('#sheet [data-component]').count();
        await click('[data-add-component="' + type + '"]');
        assert.equal(await page.locator('#sheet [data-component]').count(), before + 1);
        await click('#undoButton');assert.equal(await page.locator('#sheet [data-component]').count(), before);
      }
      await page.locator('.component-palette').scrollIntoViewIfNeeded();
      const columns = await page.locator('.component-palette').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width < 650 ? 2 : 3);
      await page.screenshot({ path: path.join(out, 'palette-' + width + '.png'), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: visible Inspector options, selected states, image/knob shapes, keyboard/touch, one-click component palette, undo, desktop/mobile bounds.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
