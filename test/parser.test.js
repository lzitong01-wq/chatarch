/* ChatArch 解析器测试（S1 验收）
 * 运行：node test/parser.test.js
 */
'use strict';

var assert = require('assert');
var parser = require('../src/js/parser.js');

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

console.log('\nChatArch Parser · S1 测试\n');

test('中文格式：用户/助手 前缀', function () {
  var r = parser.parse('用户：你好\n助手：你好！有什么可以帮你？\n用户：帮我写个方案\n助手：好的');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.messages.length, 4);
  assert.deepStrictEqual(r.messages.map(function (m) { return m.role; }), ['user', 'ai', 'user', 'ai']);
  assert.strictEqual(r.messages[0].content, '你好');
  assert.strictEqual(r.messages[1].content, '你好！有什么可以帮你？');
});

test('英文格式：Human/Assistant', function () {
  var r = parser.parse('Human: hi\nAssistant: hello there');
  assert.strictEqual(r.messages.length, 2);
  assert.deepStrictEqual(r.messages.map(function (m) { return m.role; }), ['user', 'ai']);
  assert.strictEqual(r.messages[0].content, 'hi');
});

test('Markdown 标题格式：### User / ### Assistant', function () {
  var r = parser.parse('### User\n帮我查个数据\n\n### Assistant\n好的，请说');
  assert.strictEqual(r.messages.length, 2);
  assert.strictEqual(r.messages[0].role, 'user');
  assert.strictEqual(r.messages[0].content, '帮我查个数据');
  assert.strictEqual(r.messages[1].content, '好的，请说');
});

test('多行内容累积到同一轮', function () {
  var r = parser.parse('用户：第一行\n第二行\n第三行\n助手：收到');
  assert.strictEqual(r.messages.length, 2);
  assert.strictEqual(r.messages[0].content, '第一行\n第二行\n第三行');
});

test('加粗标记：**用户**', function () {
  var r = parser.parse('**用户**\n在吗\n**助手**\n在');
  assert.strictEqual(r.messages.length, 2);
  assert.strictEqual(r.messages[0].content, '在吗');
});

test('emoji 标记：🧑 / 🤖', function () {
  var r = parser.parse('🧑 你好\n🤖 在的');
  assert.strictEqual(r.messages.length, 2);
  assert.strictEqual(r.messages[0].role, 'user');
  assert.strictEqual(r.messages[1].role, 'ai');
});

test('JSON 导出格式', function () {
  var r = parser.parse('[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}]');
  assert.strictEqual(r.format, 'json');
  assert.strictEqual(r.messages.length, 2);
  assert.strictEqual(r.messages[0].role, 'user');
  assert.strictEqual(r.messages[1].role, 'ai');
});

test('纯文本兜底：单条内容 + warning', function () {
  var r = parser.parse('这只是一段没有任何标记的普通文字。');
  assert.strictEqual(r.format, 'plain');
  assert.strictEqual(r.messages.length, 1);
  assert.ok(r.warning, '应给出 warning 提示');
});

test('空输入返回 ok:false', function () {
  var r = parser.parse('   ');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'EMPTY');
});

test('统计数字正确', function () {
  var r = parser.parse('用户：一二三\n助手：四五六七八');
  var s = r.stats;
  assert.strictEqual(s.total, 2);
  assert.strictEqual(s.userMsgs, 1);
  assert.strictEqual(s.aiMsgs, 1);
  assert.strictEqual(s.userChars, 3);
  assert.strictEqual(s.aiChars, 5);
  assert.strictEqual(s.totalChars, 8);
});

test('标记前的引导行被忽略并计数', function () {
  var r = parser.parse('2026-10-25 的对话记录\n\n用户：开始\n助手：好');
  assert.strictEqual(r.messages.length, 2);
  assert.strictEqual(r.messages[0].content, '开始');
  assert.strictEqual(r.droppedLeadingLines, 2);
});

test('Q/A 弱标记', function () {
  var r = parser.parse('Q: 问题\nA: 回答');
  assert.strictEqual(r.messages.length, 2);
  assert.strictEqual(r.messages[0].role, 'user');
  assert.strictEqual(r.messages[1].role, 'ai');
});

test('正文中的「助手」字样不触发误判（行首约束）', function () {
  var r = parser.parse('用户：我的助手昨天说了一句\n助手：明白');
  assert.strictEqual(r.messages.length, 2);
  assert.strictEqual(r.messages[0].content, '我的助手昨天说了一句');
});

console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败\n');
process.exit(failed > 0 ? 1 : 0);
