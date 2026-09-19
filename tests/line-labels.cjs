const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(path.join(process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const source = fs.readFileSync('app.js', 'utf8');
const start = source.indexOf('  function edgeLabelGeometry('), end = source.indexOf('\n  function ', start + 1);
const context = vm.createContext({}); vm.runInContext(source.slice(start, end), context);
for (const [s, c, e] of [
  [{x:0,y:0},{x:100,y:0},{x:200,y:0}],
  [{x:200,y:0},{x:100,y:0},{x:0,y:0}],
  [{x:0,y:0},{x:0,y:100},{x:0,y:200}],
  [{x:0,y:0},{x:0,y:-100},{x:0,y:-200}],
  [{x:0,y:0},{x:600,y:800},{x:100,y:200}],
  [{x:0,y:0},{x:0,y:0},{x:0,y:0}],
]) {
  const pose = context.edgeLabelGeometry({s,c,e});
  assert(pose.angle >= -90 && pose.angle <= 90);
  assert(Object.values(pose).every(Number.isFinite));
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const reverse of [false, true]) {
      const page = await browser.newPage({ viewport: { width: reverse ? 390 : 1440, height: 1100 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto('file://' + path.resolve('index.html'));
      await page.locator('[data-open="2"]').click(); await page.locator('#linkMode').click();
      for (const id of reverse ? [3,0] : [0,3]) await page.locator(`#sheet [data-image="node-${id}"]`).click();
      await page.locator('#sheet .edge-hit').dispatchEvent('click');
      await page.locator('#edgeText').click();
      const label = page.locator('#sheet .edge-text .rich');
      await label.fill('关系文字');
      await page.evaluate(() => window.retainedLabel = document.querySelector('#sheet .edge-text .rich'));
      await page.locator('#edgeCurve').click();
      for (const amount of [0, 120, -200, 300, -300]) {
        await page.locator('#edgeBend').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, amount);
        const result = await page.locator('#sheet .edge-text').evaluate(el => {
          const path = document.querySelector('#sheet .edge-line'), half = path.getTotalLength() / 2;
          const a = path.getPointAtLength(Math.max(0, half - .1)), b = path.getPointAtLength(half + .1), mid = path.getPointAtLength(half);
          let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
          if (angle > 90) angle -= 180; if (angle < -90) angle += 180;
          const radians = angle * Math.PI / 180, style = getComputedStyle(el.querySelector('.rich'));
          return { angle: parseFloat(el.style.getPropertyValue('--edge-label-angle')), expected: angle,
            dx: parseFloat(el.style.left) - mid.x - 8 * Math.sin(radians),
            dy: parseFloat(el.style.top) - mid.y + 8 * Math.cos(radians),
            font: style.fontSize, color: style.color, shadow: style.textShadow,
            retained: window.retainedLabel === el.querySelector('.rich'), html: el.querySelector('.rich').innerHTML };
        });
        assert(result.angle >= -90 && result.angle <= 90);
        assert(Math.abs(result.angle - result.expected) < .5, JSON.stringify(result));
        assert(Math.hypot(result.dx, result.dy) < .5, JSON.stringify(result));
        assert.equal(result.font, '14px'); assert.equal(result.color, 'rgb(0, 0, 0)');
        assert(result.shadow.includes('255, 255, 255')); assert(result.retained);
        assert.equal(result.html, '关系文字');
      }
      assert.equal(await page.locator('#sheet textPath').count(), 0);
      await page.keyboard.press('Escape');
      await page.screenshot({ path: `/tmp/questmaker-tangent-label-${reverse ? 'mobile' : 'desktop'}.png`, fullPage: true });
      assert.deepEqual(errors, []); await page.close();
    }
    console.log('PASS: arc midpoint/tangent, upright rotation, 8px normal offset, rigid HTML text, 14px black/white halo, curvature retains editor DOM/content, desktop/mobile.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
