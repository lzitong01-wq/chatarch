/**
 * ChatArch 分析引擎（S2）
 * 输入：parser.parse() 的结果
 * 输出：analysis = {
 *   phases:      阶段划分（探索期/攻坚期/收尾期）
 *   events:      事件流（方向变更/否决/犹豫/突破/定稿/废稿生卒），每个事件可溯源到触发文本
 *   drafts:      废稿清单（bornIndex 产出轮 → diedIndex 死亡轮，status: revised|abandoned）
 *   hotspots:    卡点聚类（同一主题离开后再次被触及的消息簇）
 *   contribution 人机贡献统计（总体 + 分阶段 + 协作形态判断）
 *   summary:     一句话考古结论
 * }
 *
 * 方法论立场：启发式分析——基于协作行为信号（用词、长度、结构）推断，
 * 不声称语义理解；每个结论都附带触发文本，供人工校准。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { global.ChatArchAnalyzer = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================= 信号词库 ================= */

  var LEX = {
    // 方向变更（强）：明确改变路线
    directionChangeStrong: [
      '换个思路', '换个方向', '换个切入点', '换个结构', '换个方式', '换一个',
      '重新来', '重新写', '重新组织', '重新梳理', '重新搭', '全部重写',
      '推倒重来', '推翻重来', '推翻', '作废', '否掉', '重起炉灶',
      '此路不通', '思路不行', '方向不行', '不行，换', '回到最初', '回到起点',
      '放弃这个', '放弃之', '前功尽弃', '改方向', '另起炉灶'
    ],
    // 否决：对已产出内容的明确 kill
    rejection: [
      '作废', '废掉', '不要这段', '这段不要', '删掉', '去掉这段', '这段删',
      '不能用', '否掉', '砍掉', '这段不行', '写得不行', '不太行，'
    ],
    // 犹豫
    hesitation: [
      '纠结', '拿不准', '不太确定', '说不好', '犹豫', '差点意思', '感觉差',
      '再想想', '选哪个', '哪个更', '要么', '也许', '大概'
    ],
    // 突破（收紧：去掉"有了/成了/通了/正是"等在正式写作中高频的泛化词）
    breakthrough: [
      '对了', '就这样', '就这个', '豁然开朗', '跑通', '搞定', '完美',
      '通了', '说得好', '有了！', '成了！', '没错，就', '可以，就', '这就对'
    ],
    // 定稿信号（收紧：去掉"如下/以上是"等任何结构化输出都有的词）
    deliverable: [
      '定稿', '最终版', '完整版', '这版可以', '就这版', '交稿', '这版就行', '可以交了'
    ],
    // 发散信号（探索期特征）
    divergence: [
      '哪些', '几种', '方向', '思路', '可以先', '要不', '或者', '条路', '方案一'
    ],
    // 短批准（收尾期特征，仅对短用户消息生效）
    approval: ['可以', '就这个', '好的', '行，', '同意', '就这么', '定了', '没问题', 'OK']
  };

  var PHASE_META = {
    explore:  { name: '探索期', desc: '提出问题、发散方向' },
    struggle: { name: '攻坚期', desc: '反复修改、卡点集中' },
    converge: { name: '收尾期', desc: '产出集中、收敛定稿' }
  };

  /* ================= 工具函数 ================= */

  function firstMatch(text, list) {
    for (var i = 0; i < list.length; i++) {
      if (text.indexOf(list[i]) !== -1) { return list[i]; }
    }
    return null;
  }

  function excerpt(text, n) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  }

  function bigramSet(text) {
    var clean = String(text || '').replace(/[\s\p{P}\p{S}]/gu, '');
    var set = new Set();
    for (var i = 0; i < clean.length - 1; i++) {
      var bg = clean.slice(i, i + 2);
      if (/^[\u4e00-\u9fff]{2}$/.test(bg)) { set.add(bg); } // 仅保留中文二元字组
    }
    return set;
  }

  /* ================= 1. 特征提取 ================= */

  function extractFeatures(messages) {
    return messages.map(function (m) {
      var c = m.content;
      return {
        directionChange: firstMatch(c, LEX.directionChangeStrong),
        rejection: firstMatch(c, LEX.rejection),
        hesitation: firstMatch(c, LEX.hesitation),
        breakthrough: firstMatch(c, LEX.breakthrough),
        deliverableHint: firstMatch(c, LEX.deliverable),
        divergence: firstMatch(c, LEX.divergence),
        questionCount: (c.match(/[？?]/g) || []).length,
        isLongOutput: m.role === 'ai' && c.length >= 150,
        isShortApproval: m.role === 'user' && c.length <= 30 && !!firstMatch(c, LEX.approval)
      };
    });
  }

  /* ================= 2. 阶段划分（事件锚定法） =================
   * 不用全文滑窗打分（稀疏信号会被长产出带偏），改为用强事件锚定：
   *   第一次否决/方向变更之前 → 探索期
   *   第一次到最后一次否决/方向变更之间 → 攻坚期（废稿全部产生于此）
   *   最后一次攻坚信号之后若存在定稿/突破/批准信号 → 收尾期
   * 没有强信号时诚实给出单一阶段，不虚构叙事。
   */
  function segmentPhases(messages, features, events) {
    var n = messages.length;
    if (n === 0) { return []; }

    var struggleIdx = events
      .filter(function (e) { return e.type === 'rejection' || e.type === 'direction-change'; })
      .map(function (e) { return e.messageIndex; })
      .sort(function (a, b) { return a - b; });

    var convergeIdx = events
      .filter(function (e) { return e.type === 'deliverable' || e.type === 'breakthrough'; })
      .map(function (e) { return e.messageIndex; });
    features.forEach(function (f, i) {
      if (f.isShortApproval && convergeIdx.indexOf(i) === -1) { convergeIdx.push(i); }
    });
    convergeIdx.sort(function (a, b) { return a - b; });

    var hasAny = struggleIdx.length > 0 || convergeIdx.length > 0 ||
      features.some(function (f) { return f.questionCount > 0 || f.divergence; });

    if (!hasAny) {
      return [{
        id: 0, key: 'plain', name: '全程', desc: '未检测到明显的阶段特征',
        startIndex: 0, endIndex: n - 1, messageCount: n
      }];
    }

    var phases = [];
    function push(key, start, end) {
      if (end < start) { return; }
      var meta = PHASE_META[key];
      phases.push({
        id: phases.length, key: key, name: meta.name, desc: meta.desc,
        startIndex: start, endIndex: end, messageCount: end - start + 1
      });
    }

    if (struggleIdx.length > 0) {
      var first = struggleIdx[0];
      var last = struggleIdx[struggleIdx.length - 1];
      push('explore', 0, first - 1);
      var hasTail = convergeIdx.some(function (i) { return i > last; });
      if (hasTail) {
        push('struggle', first, last);
        push('converge', last + 1, n - 1);
      } else {
        push('struggle', first, n - 1); // 止步于攻坚：没有收敛信号，不虚构收尾
      }
    } else if (convergeIdx.length > 0) {
      push('explore', 0, convergeIdx[0] - 1);
      push('converge', convergeIdx[0], n - 1);
    } else {
      push('explore', 0, n - 1);
    }
    return phases;
  }

  /* ================= 3. 事件流 ================= */

  function buildEvents(messages, features) {
    var events = [];
    function push(type, i, role, signal, content) {
      events.push({
        type: type,
        messageIndex: i,
        role: role,
        signal: signal,
        excerpt: excerpt(content, 80)
      });
    }
    messages.forEach(function (m, i) {
      var f = features[i];
      if (f.directionChange) { push('direction-change', i, m.role, f.directionChange, m.content); }
      if (f.rejection) { push('rejection', i, m.role, f.rejection, m.content); }
      if (f.hesitation) { push('hesitation', i, m.role, f.hesitation, m.content); }
      if (f.breakthrough) { push('breakthrough', i, m.role, f.breakthrough, m.content); }
      if (f.deliverableHint) { push('deliverable', i, m.role, f.deliverableHint, m.content); }
    });
    return events;
  }

  /* ================= 4. 废稿检测 ================= */

  function detectDrafts(messages, features) {
    var drafts = [];
    var usedBorn = {};

    for (var i = 0; i < messages.length; i++) {
      var f = features[i];
      var killSignal = f.rejection || f.directionChange;
      if (!killSignal || messages[i].role !== 'user') { continue; }

      // 向前找最近的 AI 长产出（死亡对象）
      var born = -1;
      for (var j = i - 1; j >= 0 && j >= i - 4; j--) {
        if (messages[j].role === 'ai' && messages[j].content.length >= 150) { born = j; break; }
      }
      if (born < 0 || usedBorn[born]) { continue; }
      usedBorn[born] = true;

      // 找发起该产出的用户请求
      var request = -1;
      for (var k = born - 1; k >= 0 && k >= born - 3; k--) {
        if (messages[k].role === 'user') { request = k; break; }
      }

      // 状态判定：后续 4 轮内出现新的 AI 长产出 → 被重写；否则 → 被放弃
      var status = 'abandoned';
      for (var m = i + 1; m <= Math.min(messages.length - 1, i + 4); m++) {
        if (messages[m].role === 'ai' && messages[m].content.length >= 150) { status = 'revised'; break; }
      }

      drafts.push({
        id: drafts.length,
        bornIndex: born,
        requestIndex: request,
        diedIndex: i,
        status: status,
        signal: killSignal,
        excerpt: excerpt(messages[born].content, 100)
      });
    }
    return drafts;
  }

  /* ================= 5. 卡点聚类（事件密度法） =================
   * 文本相似度在同类案例对话上不可用（领域词汇导致全篇高相似），
   * 改用攻坚信号密度：否决(3)/方向变更(2)/犹豫(1) 按权重累计，
   * 间隔 ≤ gap 的信号合并为一个卡点区，权重 ≥3 方认定为卡点。
   */
  var SIGNAL_WEIGHTS = { rejection: 3, 'direction-change': 2, hesitation: 1 };

  function detectHotspots(messages, events) {
    var n = messages.length;
    if (n < 4) { return []; }
    var gap = Math.max(3, Math.round(n / 10));

    var signals = [];
    events.forEach(function (e) {
      var w = SIGNAL_WEIGHTS[e.type];
      if (w) { signals.push({ index: e.messageIndex, weight: w, type: e.type, signal: e.signal }); }
    });
    if (signals.length === 0) { return []; }
    signals.sort(function (a, b) { return a.index - b.index; });

    // 间隔 ≤ gap 的信号合并为卡点区
    var zones = [];
    var cur = [signals[0]];
    for (var i = 1; i < signals.length; i++) {
      if (signals[i].index - cur[cur.length - 1].index <= gap) {
        cur.push(signals[i]);
      } else {
        zones.push(cur);
        cur = [signals[i]];
      }
    }
    zones.push(cur);

    var hotspots = [];
    zones.forEach(function (zone) {
      var score = zone.reduce(function (s, x) { return s + x.weight; }, 0);
      if (score < 3) { return; } // 至少一次否决，或两次以上变更/犹豫叠加
      var first = Math.max(0, zone[0].index - 1);
      var last = Math.min(n - 1, zone[zone.length - 1].index + 1);
      var idxs = [];
      for (var k = first; k <= last; k++) { idxs.push(k); }

      // 主题词：卡点区内高频中文二元字组
      var freq = {};
      idxs.forEach(function (mi) {
        bigramSet(messages[mi].content).forEach(function (bg) { freq[bg] = (freq[bg] || 0) + 1; });
      });
      var keywords = Object.keys(freq)
        .filter(function (bg) { return freq[bg] >= 2; })
        .sort(function (a, b) { return freq[b] - freq[a]; })
        .slice(0, 3);

      hotspots.push({
        id: hotspots.length,
        keywords: keywords,
        messageIndexes: idxs,
        intensity: zone.length,
        weight: score,
        firstIndex: first,
        lastIndex: last,
        span: last - first + 1,
        signals: zone.map(function (s) {
          return { messageIndex: s.index, type: s.type, signal: s.signal };
        })
      });
    });

    return hotspots.sort(function (a, b) { return b.weight - a.weight; });
  }

  /* ================= 6. 人机贡献 ================= */

  function analyzeContribution(messages, phases) {
    var userChars = 0, aiChars = 0;
    messages.forEach(function (m) {
      if (m.role === 'user') { userChars += m.content.length; }
      else { aiChars += m.content.length; }
    });
    var total = userChars + aiChars || 1;
    var userRatio = userChars / total;
    var aiRatio = aiChars / total;

    var byPhase = phases.map(function (p) {
      var u = 0, a = 0;
      for (var i = p.startIndex; i <= p.endIndex; i++) {
        if (messages[i].role === 'user') { u += messages[i].content.length; }
        else { a += messages[i].content.length; }
      }
      return { phaseId: p.id, name: p.name, userChars: u, aiChars: a };
    });

    var shape = '人机协同';
    if (aiRatio > 0.65) { shape = 'AI 主导'; }
    else if (aiRatio < 0.35) { shape = '人主导'; }

    return {
      overall: { userChars: userChars, aiChars: aiChars, userRatio: round2(userRatio), aiRatio: round2(aiRatio) },
      byPhase: byPhase,
      shape: shape
    };
  }

  function round2(x) { return Math.round(x * 100) / 100; }

  /* ================= 7. 汇总 ================= */

  function buildSummary(messages, phases, events, drafts, hotspots) {
    var parts = ['共 ' + messages.length + ' 轮协作'];
    if (phases.length && phases[0].key !== 'plain') {
      parts.push('经历 ' + phases.map(function (p) { return p.name; }).join('→'));
    }
    var dc = events.filter(function (e) { return e.type === 'direction-change'; }).length;
    if (dc) { parts.push(dc + ' 次方向变更'); }
    if (drafts.length) {
      var revised = drafts.filter(function (d) { return d.status === 'revised'; }).length;
      parts.push(drafts.length + ' 份废稿（' + revised + ' 份被重写）');
    }
    if (hotspots.length) { parts.push(hotspots.length + ' 个卡点'); }
    var bt = events.filter(function (e) { return e.type === 'breakthrough'; });
    if (bt.length) { parts.push('第 ' + (bt[0].messageIndex + 1) + ' 轮出现关键突破'); }
    var dl = events.filter(function (e) { return e.type === 'deliverable'; });
    if (dl.length) { parts.push('第 ' + (dl[dl.length - 1].messageIndex + 1) + ' 轮前后定稿'); }
    return parts.join('，') + '。';
  }

  /* ================= 主入口 ================= */

  function analyze(parseResult) {
    if (!parseResult || !parseResult.ok || !Array.isArray(parseResult.messages) || parseResult.messages.length === 0) {
      return { ok: false, error: 'NO_MESSAGES' };
    }
    var messages = parseResult.messages;

    var features = extractFeatures(messages);
    var events = buildEvents(messages, features);
    var phases = segmentPhases(messages, features, events);
    var drafts = detectDrafts(messages, features);
    var hotspots = detectHotspots(messages, events);
    var contribution = analyzeContribution(messages, phases);

    // 废稿生卒事件并入事件流
    drafts.forEach(function (d) {
      events.push({ type: 'draft-born', messageIndex: d.bornIndex, role: 'ai', signal: '长产出', excerpt: d.excerpt, draftId: d.id });
      events.push({ type: 'draft-died', messageIndex: d.diedIndex, role: messages[d.diedIndex].role, signal: d.signal, excerpt: excerpt(messages[d.diedIndex].content, 80), draftId: d.id });
    });
    events.sort(function (a, b) { return a.messageIndex - b.messageIndex; });

    // 为事件/废稿/卡点标注所属阶段
    function phaseOf(index) {
      for (var i = 0; i < phases.length; i++) {
        if (index >= phases[i].startIndex && index <= phases[i].endIndex) { return phases[i].id; }
      }
      return null;
    }
    events.forEach(function (e) { e.phaseId = phaseOf(e.messageIndex); });
    drafts.forEach(function (d) { d.bornPhaseId = phaseOf(d.bornIndex); d.diedPhaseId = phaseOf(d.diedIndex); });
    hotspots.forEach(function (h) { h.phaseId = phaseOf(h.firstIndex); });

    var summary = buildSummary(messages, phases, events, drafts, hotspots);

    return {
      ok: true,
      phases: phases,
      events: events,
      drafts: drafts,
      hotspots: hotspots,
      contribution: contribution,
      summary: summary
    };
  }

  return {
    analyze: analyze,
    LEXICONS: LEX,
    PHASE_META: PHASE_META
  };
});
