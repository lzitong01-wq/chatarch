/* ChatArch 分析引擎测试（S2 验收）
 * 运行：node test/analyzer.test.js
 */
'use strict';

var assert = require('assert');
var parser = require('../src/js/parser.js');
var analyzer = require('../src/js/analyzer.js');
var fs = require('fs');

var passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.error('  ✗ ' + name);
    console.error('    ' + (e && e.message));
  }
}

var LONG_DRAFT = '案头分析的第一种写法是先看申报表的逻辑。我们从增值税申报表入手，逐项比对进销项，把通用机电设备批发行业的税负率基准线拉出来，再用甲企业近三年的数据做纵向比较。这种写法的好处是稳，结构清晰，评委容易跟上。坏处是平，通篇都是数据比对，看不到人，也看不到这个案子真正难的地方。写完这一段之后我自己也觉得，它更像一份操作手册，不像一篇竞赛论文。';
var LONG_V2 = '第二版换个写法：以疑点为轴。把三次约谈串成一条线，每一约回答一个申报数据无法解释的问题。第一约攻收入确认时点，用电力数据反推生产周期；第二约攻进项构成，用发票流向锁定资金回流；第三约收口，把前两约的证据叠成完整的证据链。这样写人有戏、案有魂，数据不再是主角，而是证人。这一版里，案头分析不再是罗列比对的的过程，而是不断提出问题、排除嫌疑、锁定疑点的侦查过程，申报数据、发票流向、电力数据各就各位，分别在三次约谈里承担各自的举证任务。';

console.log('\nChatArch Analyzer · S2 测试\n');

test('短对话（4 轮）不崩溃', function () {
  var r = parser.parse('用户：在吗\n助手：在\n用户：写个方案\n助手：好');
  var a = analyzer.analyze(r);
  assert.strictEqual(a.ok, true);
  assert.ok(Array.isArray(a.phases));
  assert.ok(Array.isArray(a.events));
  assert.ok(Array.isArray(a.drafts));
});

test('单条纯文本不崩溃', function () {
  var r = parser.parse('一段没有标记的文字。');
  var a = analyzer.analyze(r);
  assert.strictEqual(a.ok, true);
  assert.ok(a.summary.length > 0);
});

test('空输入返回 ok:false', function () {
  var a = analyzer.analyze({ ok: false });
  assert.strictEqual(a.ok, false);
});

test('手工构造：明确检出 1 份废稿（作废→重写）', function () {
  var raw = '用户：帮我写第四部分\n助手：' + LONG_DRAFT + '\n用户：这段太学究了，作废，重写一版\n助手：' + LONG_V2 + '\n用户：对了，就这样，这版可以';
  var a = analyzer.analyze(parser.parse(raw));
  assert.strictEqual(a.drafts.length, 1, '应检出 1 份废稿，实际 ' + a.drafts.length);
  var d = a.drafts[0];
  assert.strictEqual(d.bornIndex, 1, '废稿应生于第 2 轮（AI 产出）');
  assert.strictEqual(d.diedIndex, 2, '废稿应死于第 3 轮（用户否决）');
  assert.strictEqual(d.status, 'revised', '后续有新产出，状态应为 revised');
  assert.ok(d.excerpt.length > 0, '废稿应有摘要');
});

test('手工构造：被放弃的废稿（无后续重写）', function () {
  var raw = '用户：帮我写个开头\n助手：' + LONG_DRAFT + '\n用户：这段不要了，我们换话题\n用户：聊聊别的吧';
  var a = analyzer.analyze(parser.parse(raw));
  assert.strictEqual(a.drafts.length, 1);
  assert.strictEqual(a.drafts[0].status, 'abandoned');
});

test('手工构造：突破事件', function () {
  var a = analyzer.analyze(parser.parse('用户：卡了三天\n助手：嗯\n用户：对了！用电力数据反推'));
  var bt = a.events.filter(function (e) { return e.type === 'breakthrough'; });
  assert.ok(bt.length >= 1, '应检出突破事件');
});

test('手工构造：阶段覆盖全程且命名合理', function () {
  var raw = '用户：有哪些方向？\n助手：三条路。\n用户：选第二条\n助手：好\n用户：换个思路，重新写\n助手：好\n用户：不对，推翻\n助手：重写中\n用户：定了，就这版';
  var a = analyzer.analyze(parser.parse(raw));
  assert.strictEqual(a.phases.length >= 2, true, '应至少划分出 2 个阶段');
  var covered = a.phases.reduce(function (sum, p) { return sum + p.messageCount; }, 0);
  assert.strictEqual(covered, 9, '阶段应覆盖全部 9 轮');
});

test('手工构造：贡献统计守恒', function () {
  var a = analyzer.analyze(parser.parse('用户：一二三\n助手：四五六\n用户：七八\n助手：九十'));
  var sumUser = a.contribution.byPhase.reduce(function (s, p) { return s + p.userChars; }, 0);
  var sumAi = a.contribution.byPhase.reduce(function (s, p) { return s + p.aiChars; }, 0);
  assert.strictEqual(sumUser, a.contribution.overall.userChars, '分阶段用户字数之和应守恒');
  assert.strictEqual(sumAi, a.contribution.overall.aiChars, '分阶段助手字数之和应守恒');
});

/* ---------- 真实样本数据 ---------- */

var sampleRaw = fs.readFileSync(__dirname + '/../testdata/sample_zh.txt', 'utf8');
var sample = analyzer.analyze(parser.parse(sampleRaw));

test('样本：50 轮完整分析', function () {
  assert.strictEqual(sample.ok, true);
  assert.strictEqual(sample.phases.length >= 2, true, '阶段数 ≥ 2');
  assert.ok(sample.summary.indexOf('50 轮') !== -1);
});

test('样本：考古元素检出（方向变更≥2、废稿≥2、卡点≥1）', function () {
  var dc = sample.events.filter(function (e) { return e.type === 'direction-change'; }).length;
  assert.ok(dc >= 2, '方向变更应 ≥ 2，实际 ' + dc);
  assert.ok(sample.drafts.length >= 2, '废稿应 ≥ 2，实际 ' + sample.drafts.length);
  assert.ok(sample.hotspots.length >= 1, '卡点应 ≥ 1，实际 ' + sample.hotspots.length);
});

test('样本：每个事件可溯源（signal 出现在对应消息中）', function () {
  var parse = parser.parse(sampleRaw);
  sample.events.forEach(function (e) {
    var content = parse.messages[e.messageIndex].content;
    if (e.type === 'draft-born') { return; } // 生事件用 excerpt 表示
    assert.ok(
      content.indexOf(e.signal) !== -1 || e.excerpt.indexOf(e.signal) !== -1,
      '事件 ' + e.type + ' @' + e.messageIndex + ' 的 signal「' + e.signal + '」无法溯源'
    );
  });
});

test('样本：废稿索引合法且 born < died', function () {
  sample.drafts.forEach(function (d) {
    assert.ok(d.bornIndex >= 0 && d.bornIndex < d.diedIndex, '废稿索引应 born < died');
    assert.ok(['revised', 'abandoned'].indexOf(d.status) !== -1);
  });
});

test('样本：卡点关键词非空且索引递增', function () {
  sample.hotspots.forEach(function (h) {
    assert.ok(h.keywords.length >= 1, '卡点应有主题词');
    for (var i = 1; i < h.messageIndexes.length; i++) {
      assert.ok(h.messageIndexes[i] > h.messageIndexes[i - 1], '索引应递增');
    }
  });
});

test('样本：阶段索引连续无重叠', function () {
  var expect = 0;
  sample.phases.forEach(function (p) {
    assert.strictEqual(p.startIndex, expect, '阶段应首尾相接');
    expect = p.endIndex + 1;
  });
  assert.strictEqual(expect, 50, '阶段应覆盖全部 50 轮');
});

console.log('\n样本分析摘要：');
console.log('  ' + sample.summary);
console.log('  阶段：' + sample.phases.map(function (p) {
  return p.name + '[' + (p.startIndex + 1) + '-' + (p.endIndex + 1) + ']';
}).join(' '));
console.log('  事件：' + sample.events.map(function (e) { return e.type; }).join(', '));
console.log('  废稿：' + sample.drafts.map(function (d) {
  return '#' + (d.bornIndex + 1) + '→' + (d.diedIndex + 1) + '(' + d.status + ')';
}).join(' '));
console.log('  卡点：' + sample.hotspots.map(function (h) {
  return h.keywords.join('/') + '×' + h.intensity;
}).join('；'));

console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败\n');
process.exit(failed > 0 ? 1 : 0);
