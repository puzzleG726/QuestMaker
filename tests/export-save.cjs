const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Blob, File } = require('node:buffer');

(async () => {
  const html = fs.readFileSync('index.html', 'utf8'), css = fs.readFileSync('styles.css', 'utf8');
  const previewTag = html.match(/<img\b[^>]*id="exportPreviewImage"[^>]*>/)[0];
  assert(!previewTag.includes('draggable="false"'), 'Preview keeps native image interaction');
  const previewRules = css.match(/#exportPreviewImage\{([^}]+)\}/)[1];
  assert(previewRules.includes('-webkit-touch-callout:default'));
  assert(previewRules.includes('-webkit-user-select:none'));
  assert(previewRules.includes('touch-action:auto'));
  for (const device of ['desktop', 'iPhone', 'Android', 'iPad-desktop']) {
    let downloads = 0, shares = 0, mode = 'success', sharedFile;
    const context = {
      Blob, File, window: {}, setTimeout: () => {},
      FileReader: class {
        async readAsDataURL(blob) {
          this.result = 'data:' + blob.type + ';base64,' + Buffer.from(await blob.arrayBuffer()).toString('base64');
          this.onload();
        }
      },
      URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
      document: { body: { append() {} }, createElement: () => ({ click() { downloads++; }, remove() {} }) },
      navigator: {
        userAgent: device, platform: device === 'iPad-desktop' ? 'MacIntel' : '', maxTouchPoints: device === 'iPad-desktop' ? 5 : 0,
        canShare: () => mode !== 'unsupported',
        share: async ({ files }) => {
          shares++;sharedFile = files[0];
          if (mode === 'cancel' || mode === 'error') throw Object.assign(new Error(mode), { name: mode === 'cancel' ? 'AbortError' : 'NotAllowedError' });
        },
      },
    };
    vm.runInNewContext(fs.readFileSync('export-delivery.js', 'utf8'), context);
    const result = context.window.QuestMakerExport.create(new Blob(['unchanged-image'], { type: 'image/png' }), 'QuestMaker.png');
    assert.equal(downloads + shares, 0, 'Preview creation does not deliver');
    const preview = await result.previewURL();
    if (device === 'desktop') assert.equal(preview, result.url);
    else {
      assert(preview.startsWith('data:image/png;base64,'));
      assert.equal(Buffer.from(preview.split(',')[1], 'base64').toString(), 'unchanged-image');
    }
    assert.equal(await result.save(), 'downloaded');
    assert.equal(downloads, 1);
    assert.equal(shares, 0, 'Save always downloads, never opens share');
    if (device !== 'desktop') {
      assert.equal(await result.share(), 'shared');
      assert.equal(sharedFile, result.file);assert.equal(sharedFile.type, 'image/png');
      assert.equal(await sharedFile.text(), 'unchanged-image');
      mode = 'unsupported';assert.equal(await result.share(), 'unsupported');
      assert.equal(await result.save(), 'downloaded');
      mode = 'cancel';assert.equal(await result.share(), 'cancelled');
      mode = 'error';await assert.rejects(result.share(), { name: 'NotAllowedError' });
      assert.equal(downloads, 2, 'Share never triggers an unwanted download');
    }
    result.dispose();assert.equal(await result.save(), 'cancelled');
  }
  console.log('PASS: desktop/mobile file download, inline mobile preview, explicit sharing, unsupported-share save fallback and original PNG bytes.');
})().catch(error => { console.error(error);process.exitCode = 1; });
