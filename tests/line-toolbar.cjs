const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const modules = process.env.QUESTMAKER_TEST_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const { chromium } = require(path.join(modules, 'playwright'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const out = '/tmp/questmaker-line-toolbar';
  await fs.mkdir(out, { recursive: true });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 320, height: 740 } : { width: 1440, height: 1100 }, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const press = async selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
      const stroke = () => page.locator('#sheet .edge-line').getAttribute('stroke');
      const edgePath = () => page.locator('#sheet .edge-line').getAttribute('d');
      const selectLine = async () => {
        await page.locator('#sheet .edge-hit').scrollIntoViewIfNeeded();
        const point = await page.locator('#sheet .edge-hit').evaluate(el => {
          const p = el.getPointAtLength(el.getTotalLength() * .3).matrixTransform(el.getScreenCTM());
          return { x: p.x, y: p.y };
        });
        if (mobile) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.click(point.x, point.y);
        assert.equal(await page.locator('#lineToolbar').isVisible(), true);
      };
      await page.goto('file://' + path.resolve('index.html'));
      await press('[data-open="2"]');
      const first = '#sheet [data-image="node-0"]', second = '#sheet [data-image="node-3"]';
      const expectMode = async on => {
        assert.equal(await page.locator('#linkMode').getAttribute('aria-pressed'), String(on));
        assert.equal((await page.locator('#linkMode').innerText()).trim(), on ? '连线中' : '连线');
      };
      const blank = async () => {
        const map = await page.locator('#sheet .relation-map').boundingBox();
        if (mobile) await page.touchscreen.tap(map.x + map.width / 2, map.y + map.height / 2);
        else await page.mouse.click(map.x + map.width / 2, map.y + map.height / 2);
      };
      await press(first);await press(second);
      assert.equal(await page.locator('#sheet .edge-line').count(), 0);
      assert.equal(await page.locator(second).getAttribute('aria-pressed'), 'true');
      for (const cancel of ['button', 'blank', 'escape']) {
        await press('#linkMode');await expectMode(true);
        assert.equal(await page.locator('#linkMode').evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)');
        await press(first);
        assert.equal(await page.locator('#sheet .link-start').count(), 1);
        assert.equal(await page.locator('#toast').innerText(), '请选择第二个头像');
        await press(first);assert.equal(await page.locator('#sheet .edge-line').count(), 0);
        if (cancel === 'button') await press('#linkMode');
        else if (cancel === 'blank') await blank();
        else await page.keyboard.press('Escape');
        await expectMode(false);
        assert.equal(await page.locator('#sheet .link-start').count(), 0);
        await press(second);assert.equal(await page.locator('#sheet .edge-line').count(), 0);
      }
      await press('#linkMode');
      await press(first);await press(second);
      await expectMode(false);
      assert.equal(await page.locator('#sheet .link-start').count(), 0);
      assert.equal(await page.locator('#sheet .edge-line').count(), 1);
      await press(first);await press(second);
      assert.equal(await page.locator('#sheet .edge-line').count(), 1);
      await selectLine();
      const geometry = await edgePath();
      const bodyPoint = await page.locator('#sheet .edge-line').evaluate(el => {
        const p = el.getPointAtLength(el.getTotalLength() * .3), m = el.getScreenCTM();
        return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
      });
      await page.mouse.move(bodyPoint.x, bodyPoint.y);await page.mouse.down();
      await page.mouse.move(bodyPoint.x + 45, bodyPoint.y + 30, { steps: 12 });await page.mouse.up();
      assert.equal(await edgePath(), geometry, 'Dragging the line body must not detach or move the line');
      assert.equal(await page.locator('#lineToolbar select, #lineToolbar input:not([type="range"])').count(), 0);
      assert.equal(await page.locator('#edgeLegend').count(), 0);
      const palette = await page.locator('[data-legend-color]').evaluateAll(elements => elements.map(el => ({ id: el.dataset.legendColor, color: el.value })));
      for (const index of [1, 2, 3, 0]) {
        await press('#edgeColor');
        assert.equal(await stroke(), palette[index].color);
        assert.equal(await page.locator('#edgeColor').getAttribute('data-legend-id'), palette[index].id);
        assert.equal(await page.locator('#edgeColor .edge-color-swatch').evaluate(el => el.style.backgroundColor), await page.locator('#sheet .edge-line').evaluate(el => getComputedStyle(el).stroke));
      }
      await press('#undoButton');assert.equal(await stroke(), palette[3].color);
      await press('#redoButton');assert.equal(await stroke(), palette[0].color);
      // Undo clears selection; reselect without changing the line.
      await selectLine();
      await press('#editLegends');
      await page.locator('[data-legend-color="code-0"]').evaluate(el => { el.value = '#123456'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      assert.equal(await stroke(), '#123456');
      assert.equal(await page.locator('#edgeColor .edge-color-swatch').evaluate(el => el.style.backgroundColor), 'rgb(18, 52, 86)');
      await page.locator('[data-drag-legend="code-2"]').focus();
      await page.keyboard.press('ArrowUp');
      await press('#edgeColor');
      assert.equal(await page.locator('#edgeColor').getAttribute('data-legend-id'), 'code-2');
      assert.equal(await stroke(), palette[2].color);
      for (const [selector, initial] of [['#edgeStart', 'false'], ['#edgeEnd', 'false']]) {
        assert.equal(await page.locator(selector).getAttribute('aria-pressed'), initial);
        await press(selector);assert.equal(await page.locator(selector).getAttribute('aria-pressed'), String(initial !== 'true'));
        await press(selector);assert.equal(await page.locator(selector).getAttribute('aria-pressed'), initial);
      }
      await page.evaluate(() => {
        window.arrowBubbles = [];
        for (const type of ['pointerdown', 'pointerup', 'click'])
          document.querySelector('#lineToolbar').addEventListener(type, event => {
            if (event.target.closest('#edgeStart, #edgeEnd')) window.arrowBubbles.push(type);
          });
        window.retainedAvatar = document.querySelector('.relation-node');
        window.retainedArrowIcon = document.querySelector('#edgeStart svg');
      });
      for (const selector of ['#edgeStart', '#edgeEnd']) {
        assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).touchAction), 'manipulation');
        if (mobile) {
          const client = await context.newCDPSession(page);
          await page.locator(selector).scrollIntoViewIfNeeded();
          const box = await page.locator(selector).boundingBox();
          assert(box.width >= 44 && box.height >= 44);
          for (let tap = 0; tap < 4; tap++) {
            const x = box.x + box.width / 2, y = box.y + box.height / 2;
            await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
            await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 4, y: y + 3 }] });
            await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            assert.equal(await page.locator(selector).getAttribute('aria-pressed'), String(tap % 2 === 0), 'Slight touch movement must still toggle exactly once');
          }
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 22, y: box.y + 22 }] });
          await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
          assert.equal(await page.locator(selector).getAttribute('aria-pressed'), 'false');
          await client.detach();
          await page.locator(selector).tap({ position: { x: 3, y: 22 } });
          assert.equal(await page.locator(selector).getAttribute('aria-pressed'), 'true');
          await press(selector);
        }
        await page.locator(selector).focus();await page.keyboard.press('Space');
        assert.equal(await page.locator(selector).getAttribute('aria-pressed'), 'true');
        await page.keyboard.press('Enter');assert.equal(await page.locator(selector).getAttribute('aria-pressed'), 'false');
      }
      assert.deepEqual(await page.evaluate(() => window.arrowBubbles), []);
      assert(await page.evaluate(() => window.retainedAvatar.isConnected && window.retainedArrowIcon.isConnected), 'Arrow toggles must not rebuild avatars or icons');
      for (const width of [6, 9, 12]) {
        await press('#edgeWidth');
        await press('[data-edge-width="' + width + '"]');
        assert.equal(await page.locator('#sheet .edge-line').getAttribute('stroke-width'), String(width));
        assert.equal(await page.locator('[data-edge-width="' + width + '"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#edgeWidthPopover').isVisible(), false);
      }
      assert.equal(await edgePath(), geometry);
      await press('#edgeWidth');
      assert.equal(await page.locator('#edgeWidthPopover').innerText(), '');
      assert.equal(await page.locator('#edgeWidthPopover [aria-pressed="true"]').count(), 1);
      const bounds = await page.locator('#edgeWidthPopover').boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= (mobile ? 320 : 1440));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(out, mobile ? 'mobile.png' : 'desktop.png'), fullPage: true });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#edgeWidthPopover').isVisible(), false);
      await press('#edgeWidth');
      await page.locator('#lineToolbar').click({ position: { x: 1, y: 1 } });
      assert.equal(await page.locator('#edgeWidthPopover').isVisible(), false);
      assert.equal(await page.locator('#edgeText, #edgeCurve, #removeEdge').count(), 3);
      assert.equal(await page.locator('#straightEdge, [data-edge-handle="center"]').count(), 0);
      await press('#edgeCurve');
      const curve = page.locator('#edgeBend');
      const setBend = async value => curve.evaluate((el, value) => {
        el.value = value;el.dispatchEvent(new Event('input', { bubbles: true }));el.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      await page.evaluate(() => { window.retainedAvatar = document.querySelector('.relation-node');window.retainedMap = document.querySelector('.relation-map'); });
      await curve.evaluate(el => {
        for (let value = 10; value <= 200; value++) {
          el.value = value;el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      assert(await page.evaluate(() => window.retainedAvatar.isConnected && window.retainedMap.isConnected), 'Continuous curvature input must not rebuild the canvas or avatars');
      await setBend(0);
      await setBend(120);const positive = await edgePath();assert.notEqual(positive, geometry);
      await setBend(-120);assert.notEqual(await edgePath(), positive);
      await setBend(-5);assert.equal(await curve.inputValue(), '0');assert.equal(await edgePath(), geometry);
      await curve.focus();await page.keyboard.press('ArrowRight');assert.equal(await curve.inputValue(), '10');
      await setBend(5);assert.equal(await edgePath(), geometry);
      await setBend(90);await press('#undoButton');assert.equal(await edgePath(), geometry);
      await press('#redoButton');assert.notEqual(await edgePath(), geometry);
      await page.locator('#sheet .edge-hit').dispatchEvent('click');
      for (const width of mobile ? [320, 375, 390, 430, 650] : [1440]) {
        await page.setViewportSize({ width, height: mobile ? 740 : 1100 });
        const toolbarButtons = '#lineToolbar > button, #lineToolbar > .field > button, #lineToolbar > .line-curve-control > button';
        assert.deepEqual(await page.locator(toolbarButtons).evaluateAll(els => els.map(el => el.id)), ['edgeColor', 'edgeStart', 'edgeEnd', 'edgeWidth', 'edgeText', 'edgeCurve', 'removeEdge']);
        await page.locator('#lineToolbar').scrollIntoViewIfNeeded();
        const boxes = await page.locator(toolbarButtons).evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect();return { left:r.left, right:r.right, width:r.width, height:r.height }; }));
        assert(boxes.every(r => r.left >= 0 && r.right <= width));
        if (mobile) assert(boxes.every(r => r.width === 44 && r.height === 44));
        for (const [button, panel] of [['#edgeWidth', '#edgeWidthPopover'], ['#edgeCurve', '#edgeCurvePopover']]) {
          await press(button);
          assert(await page.locator(panel).isVisible());
          const anchor = await page.locator(button).boundingBox(), popup = await page.locator(panel).boundingBox();
          assert(Math.abs(popup.y - anchor.y - anchor.height - 6) <= 1);
          assert(popup.x >= 0 && popup.x + popup.width <= width && popup.y + popup.height <= (mobile ? 740 : 1100));
          if (button === '#edgeCurve') {
            const range = await curve.boundingBox();
            const choose = async fraction => {
              const position = { x: range.width * fraction, y: range.height / 2 };
              if (mobile) await curve.tap({ position });
              else await curve.click({ position });
            };
            await choose(.2);assert(Number(await curve.inputValue()) < 0);
            await choose(.8);assert(Number(await curve.inputValue()) > 0);
            await choose(.5);assert.equal(await curve.inputValue(), '0');
            assert.equal(await edgePath(), geometry);
          }
          await page.screenshot({ path: path.join(out, 'popover-' + width + '-' + button.slice(1) + '.png'), fullPage: true });
          await page.keyboard.press('Escape');
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      await press('#homeButton');await press('[data-open="1"]');
      assert.equal(await page.locator('#lineToolbar').isVisible(), false);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS: one-shot linking/cancellation, no body or center curve dragging; palette/arrows/weight; bidirectional curve slider, zero snap, keyboard/touch, undo; anchored popovers and 320/375/390/430/650px toolbar bounds.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
