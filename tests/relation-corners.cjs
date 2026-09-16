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
  const errors = [], out = '/tmp/questmaker-relation-corners';
  await fs.mkdir(out, { recursive: true }); page.on('pageerror', e => errors.push(e.message));
  const settle = () => page.waitForTimeout(100);
  const text = key => page.locator(`#sheet [data-text="${key}"]`);
  const overlaps = () => page.locator('#sheet').evaluate(root => {
    const boxes = [...root.querySelectorAll(':scope > .sheet-title,:scope > .respondent,.corner-legend,.relation-node [data-image],.relation-node .node-name,.watermark')].map(el => ({ id: el.dataset.text || el.dataset.image || el.className, r: el.getBoundingClientRect() }));
    return boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 1 && Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 1).map(b => a.id + ':' + b.id));
  });
  const size = () => page.locator('#sheet').evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight }));
  try {
    await page.goto('file://' + path.resolve('index.html')); await page.locator('[data-open="2"]').click();
    for (const count of [3, 8, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]) {
      await page.locator('#nodeCount').fill(String(count)); await page.locator('#nodeCount').dispatchEvent('change'); await settle();
      assert.deepEqual(await overlaps(), [], `Default ${count} people`);
      assert(await page.locator('#sheet [data-image]').evaluateAll(es => es.every(e => e.offsetWidth === 66 && e.offsetHeight === 66)));
      if (count >= 14) {
        const radius = await page.locator('#sheet .relation-node').evaluateAll(es => {
          const a = es[0], opposite = es[Math.floor(es.length / 2)];
          return Math.hypot(a.offsetLeft - opposite.offsetLeft, a.offsetTop - opposite.offsetTop) / 2;
        });
        assert(radius < Math.ceil(60 / Math.sin(Math.PI / count)), 'Tighter ring than previous 120px spacing');
      }
    }
    const normal = await size();
    assert(await page.locator('#sheet .relation-map').evaluate(el => parseFloat(el.style.top) <= 30), 'Ring starts within the corner header band');
    await page.screenshot({ path: path.join(out, 'compact-24.png'), fullPage: true });
    const longTitle = '我们的角色关系与故事'.repeat(12);
    await text('title').fill(longTitle); await text('respondent').fill('填表人：' + '共同创作'.repeat(12)); await settle();
    assert((await size()).height > normal.height);
    assert.deepEqual(await overlaps(), [], 'Long title and respondent push the ring down without overlap');
    assert.equal(await text('title').textContent(), longTitle);
    const name = '颜色分类与关系说明'.repeat(18);
    await text('legend-code-0').fill(name); await settle();
    assert.deepEqual(await overlaps(), [], 'Long upper-right legend');
    await page.locator('#legendPosition').selectOption('bottom-left'); await settle();
    assert.deepEqual(await overlaps(), [], 'Long lower-left legend extends downward');
    assert(await page.locator('#sheet').evaluate(el => {
      const p = el.getBoundingClientRect();
      return [...el.querySelectorAll('.rich,.watermark')].every(e => { const r = e.getBoundingClientRect(); return r.top >= p.top && r.bottom <= p.bottom; });
    }), 'All expanded text remains inside the export bounds');
    await page.screenshot({ path: path.join(out, 'overflow.png'), fullPage: true });
    await page.locator('#exportButton').click(); const pending = page.waitForEvent('download'); await page.locator('#downloadButton').click();
    const file = await pending, filename = path.join(out, 'overflow-export.png'); await file.saveAs(filename);
    const meta = await sharp(filename).metadata(), s = await size(); assert.equal(meta.height, s.height * 2); assert.equal(meta.width, s.width * 2);
    await text('title').fill('我们的关系图'); await text('respondent').fill('填表人：'); await text('legend-code-0').fill('本命');
    await page.locator('#legendPosition').selectOption('top-right'); await settle();
    assert.deepEqual(await size(), normal, 'Removing long text restores compact canvas');
    await page.setViewportSize({ width: 390, height: 844 }); await settle();
    assert.deepEqual(await overlaps(), []); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: compact 14–24 person rings, fixed avatar size, corner metadata, upper/lower text overflow, export bounds, shrink-back, mobile.');
  } catch (e) { await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }); throw e; }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
