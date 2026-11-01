/* S6 投稿截图：着陆页 / 编年史 / 废稿博物馆 / 考古报告卡 */
const { chromium } = require('/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const out = '/workspace/chatarch/docs/assets';
  const fs = require('fs');
  if (!fs.existsSync(out)) { fs.mkdirSync(out, { recursive: true }); }

  // 1. 着陆页首屏
  await page.screenshot({ path: path.join(out, 'shot-1-landing.png') });
  console.log('✓ shot-1-landing.png');

  // 载入示例
  await page.click('#btn-sample');
  await page.waitForSelector('#workspace:not([hidden])');
  await page.waitForTimeout(800);

  // 2. 编年史（地层剖面 + 事件流）——滚到视图顶部
  await page.click('.view-tab[data-view="timeline"]');
  await page.waitForTimeout(300);
  await page.locator('#view-timeline').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'shot-2-timeline.png') });
  console.log('✓ shot-2-timeline.png');

  // 3. 废稿博物馆
  await page.click('.view-tab[data-view="museum"]');
  await page.waitForTimeout(300);
  await page.locator('#view-museum').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'shot-3-museum.png') });
  console.log('✓ shot-3-museum.png');

  // 4. 考古报告卡（Canvas）
  await page.click('.view-tab[data-view="report"]');
  await page.waitForTimeout(400);
  await page.locator('#view-report .report').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'shot-4-report.png') });
  console.log('✓ shot-4-report.png');

  await browser.close();

  // 尺寸核验
  ['shot-1-landing.png', 'shot-2-timeline.png', 'shot-3-museum.png', 'shot-4-report.png'].forEach((f) => {
    const sz = fs.statSync(path.join(out, f)).size;
    console.log(f + ' — ' + (sz / 1024).toFixed(0) + 'KB');
  });
})().catch((e) => { console.error('截图失败：', e); process.exit(1); });
