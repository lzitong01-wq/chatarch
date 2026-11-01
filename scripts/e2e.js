/* ChatArch 最终 E2E 检测：着陆页 → 示例 → 五视图 → 手工输入（中文/JSON）→ 导出 → 移动端 */
const { chromium } = require('/root/.nvm/versions/node/v22.13.1/lib/node_modules/playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const results = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chatarch-e2e-'));

  function check(name, ok, detail) {
    results.push({ name, ok, detail: detail || '' });
    console.log((ok ? '✓ ' : '✗ ') + name + (detail ? ' — ' + detail : ''));
  }

  // ---------- 1. 着陆页（桌面） ----------
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[landing] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[landing] ' + e.message));
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  check('着陆页加载', await page.locator('header.site-header').isVisible());
  check('三步价值主张可见', await page.locator('.hero').isVisible());
  check('导入面板可见', await page.locator('#input-panel').isVisible());
  check('输入区初始展开', await page.locator('#input-body').isVisible() && !(await page.locator('#input-collapsed').isVisible()));

  // ---------- 2. 示例加载 → 五视图 ----------
  await page.click('#btn-sample');
  await page.waitForSelector('#workspace:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(600);
  check('示例载入后工作区显示', await page.locator('#workspace').isVisible());
  check('输入区已折叠', !(await page.locator('#input-body').isVisible()) && await page.locator('#input-collapsed').isVisible());
  check('折叠摘要非空', (await page.locator('#input-summary-text').textContent()).indexOf('轮对话') !== -1);
  check('考古结论文本非空', (await page.locator('#verdict-text').textContent()).length > 5);

  const tabs = ['timeline', 'museum', 'portrait', 'hotspots', 'report'];
  for (const t of tabs) {
    await page.click(`.view-tab[data-view="${t}"]`);
    await page.waitForTimeout(150);
    const panel = page.locator(`#view-${t}`);
    const visible = await panel.isVisible();
    const textLen = visible ? (await panel.textContent()).length : 0;
    check(`视图 ${t} 可切换且有内容`, visible && textLen > 20, textLen + ' 字符');
  }

  // 阶段剖面：探索/攻坚/收尾 三段
  await page.click('.view-tab[data-view="timeline"]');
  await page.waitForTimeout(150);
  const phaseNames = await page.locator('#view-timeline .phase-rail-name').allTextContents();
  check('时间轴含阶段划分', phaseNames.length >= 3, phaseNames.join('/'));

  // 废稿陈列
  const draftCards = await page.locator('#view-museum .draft-card').count();
  check('废稿卡片 ≥ 1', draftCards >= 1, draftCards + ' 张');

  // 事件卡片点击展开（同时只展开一张）
  await page.click('.view-tab[data-view="timeline"]');
  await page.waitForTimeout(150);
  const eventCards = page.locator('#view-timeline .event-card');
  const cardCount = await eventCards.count();
  if (cardCount >= 2) {
    await eventCards.nth(0).click();
    await page.waitForTimeout(100);
    const firstOpen = await eventCards.nth(0).evaluate((el) => el.classList.contains('open'));
    await eventCards.nth(1).click();
    await page.waitForTimeout(100);
    const stillOpen = await eventCards.nth(0).evaluate((el) => el.classList.contains('open'));
    check('事件卡片点击展开（互斥）', firstOpen && !stillOpen);
  } else {
    check('事件卡片点击展开（互斥）', false, '卡片不足：' + cardCount);
  }

  // ---------- 3. 导出 ----------
  await page.click('.view-tab[data-view="report"]');
  await page.waitForTimeout(200);
  const reportLen = (await page.locator('#view-report .report').textContent()).length;
  check('报告视图 ≥ 800 字符', reportLen >= 800, reportLen + ' 字符');

  const mdDownload = page.waitForEvent('download', { timeout: 5000 });
  await page.click('#btn-export-md');
  const mdFile = await mdDownload;
  const mdPath = path.join(tmp, mdFile.suggestedFilename());
  await mdFile.saveAs(mdPath);
  const mdSize = fs.statSync(mdPath).size;
  check('Markdown 导出下载', mdSize > 1000, mdFile.suggestedFilename() + ' ' + mdSize + 'B');

  const pngDownload = page.waitForEvent('download', { timeout: 8000 });
  await page.click('#btn-export-img');
  const pngFile = await pngDownload;
  const pngPath = path.join(tmp, pngFile.suggestedFilename());
  await pngFile.saveAs(pngPath);
  const pngSize = fs.statSync(pngPath).size;
  const pngMagic = fs.readFileSync(pngPath).slice(0, 8).toString('hex');
  check('PNG 报告卡导出下载', pngSize > 10000 && pngMagic === '89504e470d0a1a0a', pngFile.suggestedFilename() + ' ' + pngSize + 'B');

  // ---------- 4. 手工输入：中文格式 ----------
  const zhLog = '用户：我想写一篇税务案例分析，选题方向还没定，你觉得有哪些切入点？\n' +
    '助手：可以考虑三个方向：一是电商直播行业的收入确认问题，二是跨境电商的出口退税风险，三是灵活用工平台的个税代扣漏洞。三个方向各有执法案例支撑，建议结合你手头的材料深度来选择。\n' +
    '用户：第一个方向我不太想做了，都是别人写烂的。换个思路，做跨境电商出口退税吧。\n' +
    '助手：好的。跨境电商出口退税的核心争议在于政策适用性与业务实质的匹配度，这是主要风险点，需要从单证、品名、换汇三个维度展开论证。' + '退税政策适用性与业务实质的匹配度是主要风险点。'.repeat(12) + '\n' +
    '用户：这段写得太泛了，删掉，重新写。\n' +
    '助手：重新梳理后的版本聚焦三个具体风险点：单证不齐、品名不符、换汇路径异常。' + '每个风险点都配一个真实执法案例佐证，并给出应对要点。'.repeat(12) + '\n' +
    '用户：感觉还差点意思，再想想。\n' +
    '助手：补充了税务约谈环节的应对要点，材料组织方式直接影响举证效果。' + '约谈举证的材料组织是关键，建议按时间线归档。'.repeat(12) + '\n' +
    '用户：对了！就这样，把约谈举证单独成章，结构就清晰了。\n' +
    '助手：已按新结构重组全文：第一章案头分析，第二章约谈举证，第三章处理决定。' + '全文结构完整，数据引用均已标注来源，可直接提交。'.repeat(12) + '\n' +
    '用户：这版可以，定稿吧。\n' +
    '助手：这是最终版全文，各部分已按新结构校准完毕。' + '完稿，可提交。'.repeat(12);

  await page.click('#btn-reexpand');
  await page.waitForTimeout(200);
  check('重新粘贴后输入区展开', await page.locator('#input-body').isVisible());
  await page.fill('#input', zhLog);
  await page.click('#btn-parse');
  await page.waitForTimeout(800);
  const zhSummary = await page.locator('#verdict-text').textContent();
  check('中文手工输入可分析', zhSummary.indexOf('轮协作') !== -1, zhSummary.slice(0, 70));

  // ---------- 5. 手工输入：JSON 格式 ----------
  const jsonLog = JSON.stringify([
    { role: 'user', content: '帮我把这份材料整理成表格，字段你来定。' },
    { role: 'assistant', content: '建议按申报期、税种、风险等级、证据材料四个字段组织。' + '以下是初始表格框架，含三行示例数据。'.repeat(12) },
    { role: 'user', content: '字段不太对，去掉风险等级，加上处理结果。' },
    { role: 'assistant', content: '已调整字段：申报期、税种、证据材料、处理结果。' + '并补充了三行示例数据与填写说明。'.repeat(12) },
    { role: 'user', content: '可以，就这样。' }
  ]);
  await page.click('#btn-reexpand');
  await page.waitForTimeout(150);
  await page.fill('#input', jsonLog);
  await page.click('#btn-parse');
  await page.waitForTimeout(600);
  const jsonSummary = await page.locator('#verdict-text').textContent();
  check('JSON 手工输入可分析', jsonSummary.indexOf('轮协作') !== -1, jsonSummary.slice(0, 70));
  const jsonFmt = await page.locator('#input-summary-text').textContent();
  check('JSON 格式被正确识别', jsonFmt.indexOf('JSON') !== -1, jsonFmt);

  // ---------- 6. 空输入边界（内联错误提示） ----------
  await page.click('#btn-reexpand');
  await page.fill('#input', '');
  await page.click('#btn-parse');
  await page.waitForTimeout(300);
  const inlineErrVisible = await page.locator('#input-error').isVisible();
  const inlineErrLen = inlineErrVisible ? (await page.locator('#input-error').textContent()).length : 0;
  check('空输入显示内联错误', inlineErrVisible && inlineErrLen > 5, inlineErrLen + ' 字符');
  check('空输入不崩溃（工作区仍在）', await page.locator('#workspace').isVisible());
  await page.fill('#input', '用户：测试一下\n助手：收到' + '，这是一段足够长的回复，用于验证内联错误会在用户开始输入后自动消失。'.repeat(8));
  await page.waitForTimeout(250);
  check('开始输入后错误提示自动消失', !(await page.locator('#input-error').isVisible()));

  // ---------- 6.5 新增交互：hash 锚点 / 节奏峰值 / 卡点信号展开 ----------
  // 先重载 50 轮示例，确保数据规模（JSON 5 轮样本不足以测峰值/总览）
  await page.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  await page.click('#btn-sample');
  await page.waitForSelector('#workspace:not([hidden])');
  await page.waitForTimeout(700);

  await page.click('.view-tab[data-view="hotspots"]');
  await page.waitForTimeout(200);
  check('视图切换写入 URL hash', (await page.evaluate(() => location.hash)) === '#hotspots');

  await page.click('.view-tab[data-view="portrait"]');
  await page.waitForTimeout(200);
  const peakCount = await page.locator('#view-portrait .rhythm-peak').count();
  check('节奏图标注 3 个峰值产出轮', peakCount === 3, peakCount + ' 个');

  await page.click('.view-tab[data-view="hotspots"]');
  await page.waitForTimeout(200);
  const overviewTicks = await page.locator('#view-hotspots .hs-overview-tick').count();
  check('攻坚信号总览有条目', overviewTicks >= 2, overviewTicks + ' 个信号刻度');
  await page.locator('#view-hotspots .hs-signal-btn').first().click();
  await page.waitForTimeout(150);
  const sigFullVisible = await page.locator('#view-hotspots .hs-signal-row.open .hs-signal-full').first().isVisible();
  check('卡点信号行可展开原文', sigFullVisible);

  // 注意：仅 fragment 不同的导航不会重载文档（初始化脚本不执行），
  // 用 query 参数强制整页加载，才能验证初始化时的锚点直达
  await page.goto('http://localhost:8080/index.html?direct=1#museum', { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  // 全新加载时工作区尚未展开（无数据），视图位于其中；验证 tab 激活态与视图 hidden 属性
  const museumTabActive = await page.locator('.view-tab[data-view="museum"]').evaluate((el) => el.classList.contains('active'));
  const timelineHidden = await page.locator('#view-timeline').evaluate((el) => el.hasAttribute('hidden'));
  const museumNotHidden = await page.locator('#view-museum').evaluate((el) => !el.hasAttribute('hidden'));
  check('#museum 锚点直达对应视图', museumTabActive && timelineHidden && museumNotHidden);

  // ---------- 6.6 多格式示例入口 + 键盘可访问 ----------
  await page.click('#btn-sample-en');
  await page.waitForTimeout(800);
  const enSummary = await page.locator('#verdict-text').textContent();
  check('英文示例可加载分析', enSummary.indexOf('轮协作') !== -1 && enSummary.indexOf('50 轮') !== -1, enSummary.slice(0, 50));

  // 运行后面板折叠，需先重新展开再点下一个示例
  await page.click('#btn-reexpand');
  await page.click('#btn-sample-md');
  await page.waitForTimeout(800);
  const mdSummary = await page.locator('#verdict-text').textContent();
  check('Markdown 示例可加载分析', mdSummary.indexOf('50 轮') !== -1, mdSummary.slice(0, 50));

  // 键盘可访问：聚焦事件卡，Enter 展开
  await page.click('#btn-reexpand');
  await page.click('#btn-sample');
  await page.waitForTimeout(800);
  await page.click('.view-tab[data-view="timeline"]');
  await page.waitForTimeout(200);
  await page.locator('#view-timeline .event-card').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const kbOpenCount = await page.locator('#view-timeline .event-card.open').count();
  check('事件卡片支持键盘 Enter 展开', kbOpenCount === 1, kbOpenCount + ' 张展开');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const kbCloseCount = await page.locator('#view-timeline .event-card.open').count();
  check('事件卡片支持键盘再次收起', kbCloseCount === 0);

  // ---------- 7. 移动端 ----------
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  mobile.on('pageerror', (e) => errors.push('[mobile] ' + e.message));
  await mobile.goto('http://localhost:8080/index.html', { waitUntil: 'networkidle' });
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('移动端着陆页无横向溢出', mobileOverflow <= 1, '溢出 ' + mobileOverflow + 'px');
  await mobile.click('#btn-sample');
  await mobile.waitForTimeout(600);
  const mobileOverflow2 = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('移动端结果页无横向溢出', mobileOverflow2 <= 1, '溢出 ' + mobileOverflow2 + 'px');

  // ---------- 汇总 ----------
  await page.close();
  await mobile.close();
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log('\n===== E2E 结果：' + (results.length - failed.length) + '/' + results.length + ' 通过 =====');
  if (errors.length) {
    console.log('Console/页面错误：');
    errors.forEach((e) => console.log('  ! ' + e));
  } else {
    console.log('Console/页面错误：0');
  }
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch((e) => { console.error('E2E 脚本异常：', e); process.exit(2); });
