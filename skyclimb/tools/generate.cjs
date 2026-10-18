/* 素材生成: headless Chromium の Canvas 2D で描き、アルファ付き PNG として書き出す */
const fs = require('fs');
const path = require('path');

const PW = process.env.PW_CORE || 'playwright-core';
const { chromium } = require(PW);

(async () => {
  const here = __dirname;
  const outRoot = path.resolve(here, '..', 'assets');
  const browser = await chromium.launch({
    executablePath: process.env.PW_EXE,
    args: ['--allow-file-access-from-files']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto('file://' + path.join(here, 'gen.html'));
  const list = await page.evaluate(() => window.assetList());
  console.log('assets:', list.length);

  const report = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const dataUrl = await page.evaluate(i => window.renderAsset(i), i);
    const b64 = dataUrl.split(',')[1];
    const buf = Buffer.from(b64, 'base64');
    const dir = path.join(outRoot, a.dir);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, a.name + '.png');
    fs.writeFileSync(file, buf);
    report.push({ name: a.name, dir: a.dir, w: a.w, h: a.h, bytes: buf.length });
  }
  fs.writeFileSync(path.join(here, 'render_report.json'), JSON.stringify(report, null, 2));
  console.log(errs.length ? errs.join('\n') : 'NO_ERRORS');
  console.log('written:', report.length);
  await browser.close();
})();
