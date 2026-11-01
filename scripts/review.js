/* 全视图巡检截图：五个视图 + 移动端 */
const { chromium } = require('/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const out = '/workspace/chatarch/docs/assets/review';
  if (!fs.existsSync(out)) { fs.mkdirSync(out, { recursive: true }); }

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  await page.click('#btn-sample');
  await page.waitForSelector('#workspace:not([hidden])');
  await page.waitForTimeout(800);

  for (const v of ['timeline', 'museum', 'portrait', 'hotspots', 'report']) {
    await page.click(`.view-tab[data-view="${v}"]`);
    await page.waitForTimeout(400);
    await page.locator(`#view-${v}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, 'view-' + v + '.png'), fullPage: false });
    // 同时导出该视图的文本内容用于诊断
    const txt = await page.locator(`#view-${v}`).textContent();
    fs.writeFileSync(path.join(out, 'view-' + v + '.txt'), txt);
    console.log(v + ' — ' + txt.length + ' 字符');
  }

  // 移动端四视图抽查
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  await mobile.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  await mobile.click('#btn-sample');
  await mobile.waitForTimeout(800);
  for (const v of ['timeline', 'portrait', 'hotspots']) {
    await mobile.click(`.view-tab[data-view="${v}"]`);
    await mobile.waitForTimeout(400);
    await mobile.screenshot({ path: path.join(out, 'mobile-' + v + '.png'), fullPage: false });
  }
  console.log('移动端截图完成');

  await browser.close();
})().catch((e) => { console.error('巡检失败：', e); process.exit(1); });
