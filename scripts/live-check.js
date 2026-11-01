/* 线上链接最终验证：加载 → 示例 → 视图 → 报告 → 导出按钮在位 */
const { chromium } = require('/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('https://a0217960a7f21e91f.app.workbuddy.host/?sharecode=QZZXLEAWWY', { waitUntil: 'networkidle' });
  const title = await page.title();
  console.log((title === '对话考古 · ChatArch' ? '✓' : '✗') + ' 线上标题：' + title);

  await page.click('#btn-sample');
  await page.waitForSelector('#workspace:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(800);
  console.log('✓ 示例载入，工作区显示');

  const verdict = await page.locator('#verdict-text').textContent();
  console.log((verdict.length > 5 ? '✓' : '✗') + ' 考古结论：' + verdict.slice(0, 50) + '…');

  await page.click('.view-tab[data-view="report"]');
  await page.waitForTimeout(300);
  const reportLen = (await page.locator('#view-report .report').textContent()).length;
  const hasMdBtn = await page.locator('#btn-export-md').count();
  const hasImgBtn = await page.locator('#btn-export-img').count();
  console.log((reportLen > 800 ? '✓' : '✗') + ' 报告渲染 ' + reportLen + ' 字符');
  console.log((hasMdBtn && hasImgBtn ? '✓' : '✗') + ' 导出按钮在位（文本/图片）');

  await browser.close();
  console.log(errors.length ? '! 页面错误：' + errors.join(' | ') : '✓ Console 错误：0');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('线上验证异常：', e); process.exit(2); });
