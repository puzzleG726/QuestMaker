const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const modules = process.env.QUESTMAKER_TEST_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = require(path.join(modules, 'playwright'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: 900 }, isMobile: mobile, hasTouch: mobile,
        ...(mobile ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' } : {}) });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {
        window.shareMode = 'success';window.shareCalls = [];window.renderCount = 0;window.revoked = [];
        const revoke = URL.revokeObjectURL;
        URL.revokeObjectURL = url => { window.revoked.push(url);revoke.call(URL, url); };
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => window.shareMode !== 'unsupported' });
        Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => {
          window.shareCalls.push({ file: files[0], type: files[0].type, name: files[0].name });
          if (window.shareMode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
          if (window.shareMode === 'failure') throw new DOMException('Failed', 'NotAllowedError');
        } });
      });
      await page.goto('file://' + path.resolve('index.html'));
      await page.locator('[data-open="1"]').click();
      await page.evaluate(() => {
        const render = window.html2canvas;
        window.html2canvas = async (...args) => { window.renderCount++;return render(...args); };
      });
      const preview = async () => {
        await page.locator('#exportButton').click();
        await page.locator('#downloadButton').click();
        await page.waitForFunction(() => document.querySelector('#exportPreview').open);
        await page.locator('#exportPreviewImage').evaluate(img => img.decode());
      };
      let downloads = 0;page.on('download', () => downloads++);
      await preview();
      assert.equal(downloads, 0);assert.equal(await page.evaluate(() => window.shareCalls.length), 0);
      const src = await page.locator('#exportPreviewImage').getAttribute('src');
      assert(src.startsWith(mobile ? 'data:image/png;base64,' : 'blob:'));
      const dimensions = await page.locator('#exportPreviewImage').evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight }));
      const expected = await page.locator('#sheet').evaluate(el => ({ width: el.offsetWidth * 2, height: el.offsetHeight * 2 }));
      assert.deepEqual(dimensions, expected);
      assert(await page.locator('#exportPreviewImage').evaluate(img => img.tagName === 'IMG' && img.getBoundingClientRect().width > 0));
      const imageBox = await page.locator('#exportPreviewImage').boundingBox();
      assert(imageBox.x >= 0 && imageBox.x + imageBox.width <= (mobile ? 390 : 1440));
      assert(Math.abs(imageBox.width / imageBox.height - dimensions.width / dimensions.height) < .01);
      await page.screenshot({ path: '/tmp/questmaker-export-preview-' + (mobile ? 'mobile' : 'desktop') + '.png', fullPage: true });
      for (const mode of ['success', 'cancel', 'failure', 'success']) {
        await page.evaluate(mode => { window.shareMode = mode; }, mode);
        await page.locator('#shareExport').click();
        await page.waitForFunction(() => !document.querySelector('#shareExport').disabled);
        assert(await page.locator('#exportPreview').isVisible());
        assert.equal(downloads, 0);
        assert.equal(await page.locator('#exportPreviewImage').getAttribute('src'), src);
      }
      assert(await page.evaluate(() => window.shareCalls.every(call => call.file === window.shareCalls[0].file && call.type === 'image/png')));
      assert.equal(await page.evaluate(() => window.renderCount), 1);
      const download = page.waitForEvent('download');await page.locator('#saveExport').click();
      assert((await download).suggestedFilename().endsWith('.png'));
      assert.equal(await page.evaluate(() => window.shareCalls.length), 4);
      assert.equal(await page.locator('#exportPreview .export-preview-hint').first().innerText(), '长按图片保存至手机相册');
      assert.equal(await page.evaluate(() => window.renderCount), 1);
      assert(await page.locator('#exportPreview').isVisible());
      await page.locator('#closeExportPreview').click();
      await page.waitForFunction(() => !document.querySelector('#exportPreviewImage').hasAttribute('src'));
      if (!mobile) assert(await page.evaluate(url => window.revoked.includes(url), src));
      assert.equal(await page.locator('#exportPreviewImage').getAttribute('src'), null);
      await page.evaluate(() => { window.shareMode = 'unsupported'; });
      await preview();assert.equal(await page.locator('#shareExport').isVisible(), false);
      assert(await page.locator('#exportPreviewImage').isVisible());
      assert.equal(downloads, 1, 'Unsupported sharing must leave preview without downloading');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#exportPreviewImage').hasAttribute('src'));
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: preview only after generation, full-size real IMG, one render/shared File, explicit save/share, cancel/error/unsupported preserve preview, URL cleanup, desktop/mobile dimensions.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
