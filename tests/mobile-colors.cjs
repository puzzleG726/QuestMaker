const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [width, hasTouch] of [[320,true], [390,true], [430,true], [650,true], [768,true], [820,true], [1024,true], [1194,true], [1366,true], [768,false], [1440,false]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('file://' + path.resolve('index.html'));
      await page.locator('[data-open="2"]').click();
      await page.locator('#editLegends').click();
      const rows = await page.locator('.properties .legend-edit').evaluateAll(elements => elements.map(row => {
        const bounds = [...row.children].map(child => {
          const b = child.getBoundingClientRect();
          return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
        });
        return { bounds, right: row.getBoundingClientRect().right };
      }));
      if (width <= 650 || hasTouch) {
        for (const row of rows) {
          assert(row.right <= width, `row overflow at ${width}`);
          for (let i = 0; i < row.bounds.length; i++) {
            const a = row.bounds[i];
            assert(a.right <= row.right);
            for (const b of row.bounds.slice(i + 1)) assert(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y, `overlap at ${width}`);
          }
          assert(row.bounds[2].width >= 100, `name input too narrow at ${width}`);
          for (const i of [0, 1, 3]) {
            assert.equal(row.bounds[i].width, 44);
            assert.equal(row.bounds[i].height, 44);
          }
        }
        const colorStyle = await page.locator('#background').evaluate(el => {
          const s = getComputedStyle(el);
          return { width: s.width, height: s.height, border: s.borderTopWidth, appearance: s.appearance };
        });
        assert.deepEqual(colorStyle, { width: '44px', height: '44px', border: '1px', appearance: 'none' });
      } else {
        assert.equal(rows[0].bounds[1].width, 28, 'desktop color control unchanged');
      }
      const firstColor = page.locator('[data-legend-color]').first();
      await firstColor.evaluate(el => { el.value = '#123456'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      assert.equal(await firstColor.inputValue(), '#123456');
      await page.locator('[data-legend-name]').first().fill('Test legend');
      await page.locator('[data-drag-legend]').first().focus();
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('[data-legend-name]').nth(1).inputValue(), 'Test legend');
      const count = await page.locator('[data-legend-row]').count();
      await page.locator('#addLegend').click();
      assert.equal(await page.locator('[data-legend-row]').count(), count + 1);
      await page.locator('[data-delete-legend]').last().click();
      assert.equal(await page.locator('[data-legend-row]').count(), count);
      if (width === 390) await page.locator('.properties').screenshot({ path: '/tmp/questmaker-mobile-colors.png' });
      if (width === 820 || width === 1194) {
        await page.locator('#addLegend').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `/tmp/questmaker-tablet-colors-${width}.png` });
      }
      await page.locator('#editLegends').click();
      assert.equal(await page.locator('[data-legend-color]').first().isDisabled(), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: phone/tablet portrait/landscape color controls, non-overlapping 44px targets, readable name widths, mouse desktop unchanged, color/name editing, reorder, add/delete.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
