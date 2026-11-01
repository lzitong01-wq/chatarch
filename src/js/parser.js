/**
 * ChatArch 对话解析器（S1）
 * 输入：原始对话文本（多种格式）
 * 输出：统一 messages 数据模型
 *
 * 支持格式：
 *   1. 角色前缀："用户：…" / "助手：…" / "Human: …" / "Assistant: …" / "Q: …" / "A: …"
 *   2. Markdown 标题："### User" / "### Assistant" / "**用户**"
 *   3. Emoji 标记："🧑 …" / "🤖 …"
 *   4. JSON 导出：[{"role":"user","content":"…"}, …]
 *   5. 兜底：无法识别时按单条内容处理，并给出 warning
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { global.ChatArchParser = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 强标记：多字符词，允许以冒号 / 加粗 / 行尾 结束（覆盖 markdown 标题风格）
  var STRONG_MARKER_RE = /^\s*(?:#{1,6}\s*|\*\*\s*|>\s*)?(用户|助手|user|assistant|human|chatgpt|claude|bot|workbuddy|codebuddy)\s*(?::|：|\*\*|$)/i;
  // 弱标记：单字符（Q/A），必须带冒号，降低误判
  var WEAK_MARKER_RE = /^\s*(?:#{1,6}\s*|\*\*\s*|>\s*)?(q|a)\s*[:：]/i;
  // Emoji 标记：允许后面直接跟内容
  var EMOJI_MARKER_RE = /^\s*(🧑|🤖)\s*/;

  var USER_WORDS = { '用户': 1, 'user': 1, 'human': 1, 'q': 1 };
  var AI_WORDS = { '助手': 1, 'assistant': 1, 'chatgpt': 1, 'claude': 1, 'bot': 1, 'workbuddy': 1, 'codebuddy': 1, 'a': 1 };

  /** 判断一行是否是角色标记行，返回 { role, rest } 或 null */
  function matchRoleMarker(line) {
    var m = line.match(EMOJI_MARKER_RE);
    if (m) {
      return {
        role: m[1] === '🧑' ? 'user' : 'ai',
        rest: line.slice(m[0].length).replace(/^\s+/, '')
      };
    }
    m = line.match(STRONG_MARKER_RE);
    if (!m) { m = line.match(WEAK_MARKER_RE); }
    if (!m) { return null; }
    var word = m[1].toLowerCase();
    var role = USER_WORDS[word] ? 'user' : (AI_WORDS[word] ? 'ai' : null);
    if (!role) { return null; }
    return { role: role, rest: line.slice(m[0].length).replace(/^\s+/, '') };
  }

  /** 尝试解析 JSON 导出格式，失败返回 null */
  function tryParseJson(text) {
    var t = text.trim();
    if (t.charAt(0) !== '[' && t.charAt(0) !== '{') { return null; }
    var data;
    try { data = JSON.parse(t); } catch (e) { return null; }
    var arr = Array.isArray(data) ? data : (data.messages || data.conversations || null);
    if (!Array.isArray(arr)) { return null; }
    var msgs = [];
    for (var i = 0; i < arr.length; i++) {
      var item = arr[i];
      if (!item || typeof item.content !== 'string') { continue; }
      var roleStr = String(item.role || (item.author && item.author.role) || '').toLowerCase();
      var role = (roleStr.indexOf('user') !== -1 || roleStr.indexOf('human') !== -1) ? 'user' : 'ai';
      var content = item.content.trim();
      if (content) { msgs.push({ index: msgs.length, role: role, content: content }); }
    }
    return msgs.length >= 2 ? msgs : null;
  }

  function computeStats(messages) {
    var s = { total: messages.length, userMsgs: 0, aiMsgs: 0, userChars: 0, aiChars: 0, totalChars: 0 };
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var len = m.content.length;
      if (m.role === 'user') { s.userMsgs++; s.userChars += len; }
      else { s.aiMsgs++; s.aiChars += len; }
      s.totalChars += len;
    }
    return s;
  }

  /**
   * 主入口
   * @param {string} rawText 原始对话文本
   * @returns {{ok: boolean, format: string, messages: Array, stats: Object, warning?: string, error?: string}}
   */
  function parse(rawText) {
    var text = String(rawText == null ? '' : rawText)
      .replace(/^\uFEFF/, '')       // 去 BOM
      .replace(/\u200B/g, '')       // 去零宽字符
      .replace(/\r\n?/g, '\n');     // 统一换行

    if (!text.trim()) { return { ok: false, error: 'EMPTY' }; }

    // 1) JSON 导出格式
    var jsonMsgs = tryParseJson(text);
    if (jsonMsgs) {
      return { ok: true, format: 'json', messages: jsonMsgs, stats: computeStats(jsonMsgs) };
    }

    // 2) 行标记格式
    var lines = text.split('\n');
    var messages = [];
    var current = null;
    var droppedLeading = 0;
    var seenMarker = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var marker = matchRoleMarker(line);
      if (marker) {
        seenMarker = true;
        current = { index: messages.length, role: marker.role, content: marker.rest };
        messages.push(current);
      } else if (current) {
        current.content += (current.content ? '\n' : '') + line;
      } else if (!seenMarker) {
        droppedLeading++; // 第一个标记之前的引导文字（标题、日期等）
      }
    }

    // 清理每条内容的首尾空白
    for (var j = 0; j < messages.length; j++) {
      messages[j].content = messages[j].content.trim();
    }

    // 3) 兜底：未识别到任何角色标记
    if (messages.length === 0) {
      var single = [{ index: 0, role: 'user', content: text.trim() }];
      return {
        ok: true,
        format: 'plain',
        messages: single,
        stats: computeStats(single),
        warning: '未识别到对话角色标记，已按单条内容处理。请检查格式是否为「用户：/助手：」等标记形式。'
      };
    }

    var result = {
      ok: true,
      format: 'role-prefix',
      messages: messages,
      stats: computeStats(messages)
    };
    if (droppedLeading > 0) {
      result.droppedLeadingLines = droppedLeading;
    }
    return result;
  }

  return { parse: parse };
});
