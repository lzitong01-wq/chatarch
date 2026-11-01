/* ============================================================
   ChatArch 应用逻辑（S3：四视图）
   状态：state.parse（解析结果）+ state.analysis（分析结果）
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 常量 ---------- */

  var EVENT_META = {
    'direction-change': { label: '方向变更', glyph: '↻' },
    'rejection':        { label: '否决',     glyph: '✕' },
    'hesitation':       { label: '犹豫',     glyph: '?' },
    'breakthrough':     { label: '突破',     glyph: '✦' },
    'deliverable':      { label: '定稿',     glyph: '▣' },
    'draft-born':       { label: '废稿产出', glyph: '◐' },
    'draft-died':       { label: '废稿死亡', glyph: '◑' }
  };

  var ROLE_LABEL = { user: '用户', ai: '助手' };

  var PHASE_DEPTH = { explore: '浅层', struggle: '中层', converge: '深层', plain: '全层' };

  /* ---------- 状态与元素 ---------- */

  var state = { parse: null, analysis: null };

  var els = {
    input: document.getElementById('input'),
    inputBody: document.getElementById('input-body'),
    inputCollapsed: document.getElementById('input-collapsed'),
    inputSummary: document.getElementById('input-summary-text'),
    inputError: document.getElementById('input-error'),
    btnParse: document.getElementById('btn-parse'),
    btnSample: document.getElementById('btn-sample'),
    btnSampleEn: document.getElementById('btn-sample-en'),
    btnSampleMd: document.getElementById('btn-sample-md'),
    btnClear: document.getElementById('btn-clear'),
    btnReexpand: document.getElementById('btn-reexpand'),
    workspace: document.getElementById('workspace'),
    verdictText: document.getElementById('verdict-text'),
    verdictChips: document.getElementById('verdict-chips'),
    tabs: document.getElementById('view-tabs'),
    views: {
      timeline: document.getElementById('view-timeline'),
      museum: document.getElementById('view-museum'),
      portrait: document.getElementById('view-portrait'),
      hotspots: document.getElementById('view-hotspots'),
      report: document.getElementById('view-report')
    }
  };

  /* ---------- 工具 ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function phaseById(id) {
    var phases = state.analysis.phases;
    for (var i = 0; i < phases.length; i++) {
      if (phases[i].id === id) { return phases[i]; }
    }
    return null;
  }

  /* ---------- 主流程 ---------- */

  function run(raw) {
    clearInputError();
    var parseResult = window.ChatArchParser.parse(raw);
    if (!parseResult.ok) {
      showInputError('没有可分析的内容——请先粘贴一段对话记录（或点「载入示例」）。');
      return;
    }
    var analysis = window.ChatArchAnalyzer.analyze(parseResult);
    state.parse = parseResult;
    state.analysis = analysis;

    renderVerdict(analysis, parseResult);
    renderTimeline();
    renderMuseum();
    renderPortrait();
    renderHotspots();
    renderReport();

    els.workspace.hidden = false;
    collapseInput(parseResult);
    els.workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function collapseInput(parseResult) {
    var s = parseResult.stats;
    els.inputSummary.textContent =
      '已载入 ' + s.total + ' 轮对话（' + s.totalChars + ' 字）· 识别格式：' +
      ({ 'role-prefix': '角色标记', 'json': 'JSON 导出', 'plain': '未识别（兜底）' }[parseResult.format] || parseResult.format);
    els.inputBody.hidden = true;
    els.inputCollapsed.hidden = false;
  }

  function expandInput() {
    els.inputBody.hidden = false;
    els.inputCollapsed.hidden = true;
    els.input.focus();
  }

  /* ---------- 输入区内联提示（替代原生 alert） ---------- */

  function showInputError(msg) {
    els.inputError.textContent = msg;
    els.inputError.hidden = false;
  }

  function clearInputError() {
    els.inputError.hidden = true;
  }

  /* ---------- 貳 · 考古结论 ---------- */

  function renderVerdict(a, p) {
    els.verdictText.textContent = a.summary;
    var counts = {};
    a.events.forEach(function (e) { counts[e.type] = (counts[e.type] || 0) + 1; });
    var chips = [
      ['废稿', a.drafts.length],
      ['卡点', a.hotspots.length],
      ['方向变更', counts['direction-change'] || 0],
      ['否决', counts['rejection'] || 0],
      ['突破', counts['breakthrough'] || 0],
      ['定稿', counts['deliverable'] || 0],
      ['协作形态', a.contribution.shape]
    ];
    els.verdictChips.innerHTML = chips.map(function (c) {
      return '<span class="chip"><b>' + esc(c[0]) + '</b>' + esc(c[1]) + '</span>';
    }).join('');
  }

  /* ---------- 视图一 · 编年史 ---------- */

  function renderTimeline() {
    var a = state.analysis;
    var messages = state.parse.messages;
    var html = '';

    a.phases.forEach(function (p) {
      var evs = a.events.filter(function (e) { return e.phaseId === p.id; });
      var uChars = 0, aChars = 0;
      for (var i = p.startIndex; i <= p.endIndex; i++) {
        if (messages[i].role === 'user') { uChars += messages[i].content.length; }
        else { aChars += messages[i].content.length; }
      }

      html += '<div class="phase-block" data-key="' + esc(p.key) + '">'
        + '<div class="phase-rail" data-depth="' + esc(PHASE_DEPTH[p.key] || '') + '">'
        + '<span class="phase-rail-name">' + esc(p.name) + '</span></div>'
        + '<div class="phase-body">'
        + '<header class="phase-head">'
        + '<span class="phase-range">第 ' + (p.startIndex + 1) + '—' + (p.endIndex + 1) + ' 轮</span>'
        + '<span class="phase-desc">' + esc(p.desc) + '</span>'
        + '<span class="phase-stats">' + p.messageCount + ' 条消息 · 人 ' + uChars + ' 字 / 机 ' + aChars + ' 字</span>'
        + '</header>';

      if (evs.length === 0) {
        html += '<div class="event-empty">本阶段未检测到标记事件</div>';
      } else {
        html += '<div class="event-list">';
        evs.forEach(function (e) {
          var meta = EVENT_META[e.type] || { label: e.type, glyph: '·' };
          var msg = messages[e.messageIndex];
          html += '<div class="event-row" data-type="' + esc(e.type) + '">'
            + '<span class="event-dot">' + meta.glyph + '</span>'
            + '<div class="event-card" data-index="' + e.messageIndex + '" role="button" tabindex="0" aria-expanded="false">'
            + '<div class="event-head">'
            + '<span class="event-type">' + meta.label + '</span>'
            + '<span class="event-round">第 ' + (e.messageIndex + 1) + ' 轮 · ' + esc(ROLE_LABEL[msg.role] || msg.role) + '</span>'
            + (e.signal ? '<span class="event-signal">信号「' + esc(e.signal) + '」</span>' : '')
            + '</div>'
            + '<p class="event-excerpt">' + esc(e.excerpt) + '</p>'
            + '<div class="event-full" hidden><p>' + esc(msg.content).replace(/\n/g, '<br>') + '</p></div>'
            + '</div></div>';
        });
        html += '</div>';
      }
      html += '</div></div>';
    });

    els.views.timeline.innerHTML = html;
    bindEventCards(els.views.timeline);
  }

  function bindEventCards(box) {
    function toggle(card) {
      var full = card.querySelector('.event-full');
      if (!full) { return; }
      var willOpen = full.hidden;
      // 同时只展开一张，保持剖面整洁
      box.querySelectorAll('.event-card.open .event-full').forEach(function (f) { f.hidden = true; });
      box.querySelectorAll('.event-card.open').forEach(function (c) {
        c.classList.remove('open');
        c.setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        full.hidden = false;
        card.classList.add('open');
        card.setAttribute('aria-expanded', 'true');
      }
    }
    box.querySelectorAll('.event-card').forEach(function (card) {
      card.addEventListener('click', function () { toggle(card); });
      // 键盘可访问：Enter / Space 触发展开
      card.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
          ev.preventDefault();
          toggle(card);
        }
      });
    });
  }

  /* ---------- 视图二 · 废稿博物馆 ---------- */

  function renderMuseum() {
    var a = state.analysis;
    var messages = state.parse.messages;
    var box = els.views.museum;

    if (a.drafts.length === 0) {
      box.innerHTML = '<div class="empty-state">'
        + '<div class="empty-title">零废稿</div>'
        + '<p>这场协作没有产生被记录下来的废稿——要么一次成稿，要么过程未被如实记录。</p>'
        + '</div>';
      return;
    }

    var html = '<div class="museum-grid">';
    a.drafts.forEach(function (d, i) {
      var bornPhase = phaseById(d.bornPhaseId);
      var diedPhase = phaseById(d.diedPhaseId);
      var revised = d.status === 'revised';
      html += '<article class="draft-card" data-status="' + esc(d.status) + '">'
        + '<div class="draft-no">No.' + String(i + 1).padStart(2, '0') + '</div>'
        + '<div class="draft-seal">' + (revised ? '被重写' : '被放弃') + '</div>'
        + '<h3 class="draft-title">死于第 ' + (d.diedIndex + 1) + ' 轮</h3>'
        + '<dl class="draft-meta">'
        + '<div><dt>产出</dt><dd>第 ' + (d.bornIndex + 1) + ' 轮 · ' + esc(ROLE_LABEL[messages[d.bornIndex].role]) + '</dd></div>'
        + (d.requestIndex >= 0
            ? '<div><dt>起因</dt><dd>第 ' + (d.requestIndex + 1) + ' 轮 · ' + esc(ROLE_LABEL[messages[d.requestIndex].role]) + '</dd></div>'
            : '')
        + (diedPhase ? '<div><dt>阶段</dt><dd>' + esc(diedPhase.name) + '</dd></div>' : '')
        + '</dl>'
        + '<p class="draft-excerpt">' + esc(d.excerpt) + '</p>'
        + '<p class="draft-cause">死因：' + esc(ROLE_LABEL[messages[d.diedIndex].role] || '') + '说「' + esc(d.signal) + '」</p>'
        + '</article>';
    });
    html += '</div>';
    box.innerHTML = html;
  }

  /* ---------- 视图三 · 协作画像 ---------- */

  function renderPortrait() {
    var a = state.analysis;
    var messages = state.parse.messages;
    var c = a.contribution;
    var box = els.views.portrait;

    var html = '';

    // 总体配比
    var uPct = Math.round(c.overall.userRatio * 100);
    var aPct = 100 - uPct;
    html += '<div class="portrait-block">'
      + '<div class="portrait-block-title">总体配比</div>'
      + '<div class="ratio-bar">'
      + '<div class="ratio-seg ratio-user" style="width:' + uPct + '%">' + (uPct >= 12 ? '人 ' + uPct + '%' : '') + '</div>'
      + '<div class="ratio-seg ratio-ai" style="width:' + aPct + '%">' + (aPct >= 12 ? 'AI ' + aPct + '%' : '') + '</div>'
      + '</div>'
      + '<div class="ratio-legend">'
      + '<span><i style="background:var(--c-bronze)"></i>人 ' + c.overall.userChars + ' 字</span>'
      + '<span><i style="background:var(--c-accent)"></i>AI ' + c.overall.aiChars + ' 字</span>'
      + '</div>'
      + '<div class="shape-badge">协作形态 · ' + esc(c.shape) + '</div>'
      + '</div>';

    // 分阶段配比
    html += '<div class="portrait-block"><div class="portrait-block-title">分阶段配比</div>';
    c.byPhase.forEach(function (bp) {
      var total = bp.userChars + bp.aiChars || 1;
      var up = Math.round(bp.userChars / total * 100);
      html += '<div class="phase-ratio">'
        + '<span class="phase-ratio-name">' + esc(bp.name) + '</span>'
        + '<div class="ratio-bar" style="height:14px">'
        + '<div class="ratio-seg ratio-user" style="width:' + up + '%"></div>'
        + '<div class="ratio-seg ratio-ai" style="width:' + (100 - up) + '%"></div>'
        + '</div>'
        + '<span class="phase-ratio-nums">人 ' + bp.userChars + ' / 机 ' + bp.aiChars + '</span>'
        + '</div>';
    });
    html += '</div>';

    // 对话节奏（逐轮字数条带）
    var maxLen = 0;
    messages.forEach(function (m) { maxLen = Math.max(maxLen, m.content.length); });
    // 峰值标注：字数最长的三个 AI 产出轮
    var peakSet = {};
    messages
      .map(function (m, i) { return { i: i, len: m.content.length, role: m.role }; })
      .filter(function (x) { return x.role === 'ai' && x.len > 0; })
      .sort(function (a, b) { return b.len - a.len; })
      .slice(0, 3)
      .forEach(function (x) { peakSet[x.i] = true; });
    html += '<div class="portrait-block"><div class="portrait-block-title">对话节奏</div>'
      + '<div class="rhythm-chart">';
    messages.forEach(function (m, i) {
      var h = maxLen ? Math.max(4, Math.round(m.content.length / maxLen * 100)) : 4;
      html += '<div class="rhythm-bar' + (peakSet[i] ? ' rhythm-peak' : '') + '" data-role="' + esc(m.role) + '" style="height:' + h + '%" '
        + 'title="第 ' + (i + 1) + ' 轮 · ' + esc(ROLE_LABEL[m.role]) + ' · ' + m.content.length + ' 字' + (peakSet[i] ? ' · 峰值产出' : '') + '"></div>';
    });
    html += '</div><p class="rhythm-caption">每条竖柱为一轮消息，高度正比于该轮字数；青铜绿为人，赭石为 AI，<b>朱砂点标出最长的三个产出轮</b>。波峰即产出轮，波谷即短促交锋。</p></div>';

    box.innerHTML = html;
  }

  /* ---------- 视图四 · 卡点热区 ---------- */

  // 攻坚信号集合（视图层用于总览条；卡点权重判定在分析引擎内完成）
  var STRUGGLE_TYPES = { rejection: 1, 'direction-change': 1, hesitation: 1 };

  function excerptOf(text, n) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  }

  function renderHotspots() {
    var a = state.analysis;
    var box = els.views.hotspots;
    var messages = state.parse.messages;
    var n = messages.length;

    // 1. 全对话攻坚信号总览：整条轨道标出所有冲突信号，卡点区高亮覆盖
    var struggleSignals = a.events.filter(function (e) { return STRUGGLE_TYPES[e.type]; });

    var html = '';
    if (struggleSignals.length) {
      html += '<div class="portrait-block hs-overview-block">'
        + '<div class="portrait-block-title">攻坚信号总览</div>'
        + '<div class="hs-overview">';
      struggleSignals.forEach(function (e) {
        var left = (e.messageIndex / Math.max(n - 1, 1)) * 100;
        html += '<span class="hs-overview-tick" data-type="' + esc(e.type) + '" '
          + 'style="left:' + left.toFixed(2) + '%" '
          + 'title="第 ' + (e.messageIndex + 1) + ' 轮 · ' + esc((EVENT_META[e.type] || {}).label || e.type) + '「' + esc(e.signal) + '」"></span>';
      });
      a.hotspots.forEach(function (h) {
        var left = (h.firstIndex / n) * 100;
        var width = Math.max((h.span / n) * 100, 2.5);
        html += '<span class="hs-overview-zone" style="left:' + left.toFixed(2) + '%;width:' + width.toFixed(2) + '%" '
          + 'title="卡点：第 ' + (h.firstIndex + 1) + '—' + (h.lastIndex + 1) + ' 轮"></span>';
      });
      html += '</div>'
        + '<div class="hs-overview-legend">'
        + '<span><i data-type="rejection"></i>否决</span>'
        + '<span><i data-type="direction-change"></i>方向变更</span>'
        + '<span><i data-type="hesitation"></i>犹豫</span>'
        + '<span class="hs-legend-zone"><i class="zone"></i>卡点区</span>'
        + '<span class="hs-legend-note">共 ' + struggleSignals.length + ' 个信号，沿全程分布；密集处即淤积区</span>'
        + '</div></div>';
    }

    // 2. 卡点卡片（含无卡点的两种诚实空态）
    if (a.hotspots.length === 0) {
      if (struggleSignals.length) {
        html += '<div class="empty-state">'
          + '<div class="empty-title">有冲突信号，但未形成卡点</div>'
          + '<p>检测到 ' + struggleSignals.length + ' 个攻坚信号，但分布稀疏、未达聚类强度——这次协作的小摩擦没有淤积成瓶颈。</p>'
          + '</div>';
      } else {
        html += '<div class="empty-state">'
          + '<div class="empty-title">未检测到卡点</div>'
          + '<p>协作信号分布均匀，或这段对话顺利得不像真实项目。</p>'
          + '</div>';
      }
      box.innerHTML = html;
      return;
    }

    a.hotspots.forEach(function (h, i) {
      var leftPct = (h.firstIndex / n) * 100;
      var widthPct = (h.span / n) * 100;
      html += '<article class="hotspot-card">'
        + '<header class="hotspot-head">'
        + '<span class="hs-id">卡点 ' + String(i + 1).padStart(2, '0') + '</span>'
        + '<span class="hs-range">第 ' + (h.firstIndex + 1) + '—' + (h.lastIndex + 1) + ' 轮 · 跨度 ' + h.span + ' 轮</span>'
        + '<span class="hs-weight">强度 ×' + h.weight + ' · ' + h.intensity + ' 次信号</span>'
        + '</header>';

      if (h.keywords.length) {
        html += '<div class="hs-keywords">'
          + h.keywords.map(function (k) { return '<span class="hs-keyword">' + esc(k) + '</span>'; }).join('')
          + '</div>';
      }

      html += '<ol class="hs-signals">';
      h.signals.forEach(function (s) {
        var meta = EVENT_META[s.type] || { label: s.type };
        html += '<li class="hs-signal-row">'
          + '<button type="button" class="hs-signal-btn" aria-expanded="false">'
          + '<span class="hs-signal-round">第 ' + (s.messageIndex + 1) + ' 轮</span>'
          + '<span class="hs-signal-type" data-type="' + esc(s.type) + '">' + meta.label + '</span>'
          + '<span class="hs-signal-word">「' + esc(s.signal) + '」</span>'
          + '<span class="hs-signal-caret" aria-hidden="true">▾</span>'
          + '</button>'
          + '<p class="hs-signal-full" hidden>' + esc(excerptOf(messages[s.messageIndex].content, 120)) + '</p>'
          + '</li>';
      });
      html += '</ol>';

      html += '<div class="hs-track"><div class="hs-track-fill" style="left:' + leftPct.toFixed(2) + '%;width:' + Math.max(widthPct, 2).toFixed(2) + '%"></div></div>'
        + '<div class="hs-track-label"><span>对话起点</span><span>卡点在全程中的位置</span><span>第 ' + n + ' 轮</span></div>'
        + '</article>';
    });
    box.innerHTML = html;

    // 信号行点击展开原文摘录（互不排斥，便于卡点内对照）
    box.querySelectorAll('.hs-signal-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('.hs-signal-row');
        var full = row.querySelector('.hs-signal-full');
        var willOpen = full.hidden;
        full.hidden = !willOpen;
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        row.classList.toggle('open', willOpen);
      });
    });
  }

  /* ---------- 视图五 · 考古报告 ---------- */

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function renderReport() {
    var a = state.analysis;
    var p = state.parse;
    var box = els.views.report;
    var dateStr = todayStr();
    var counts = {};
    a.events.forEach(function (e) { counts[e.type] = (counts[e.type] || 0) + 1; });

    var html = '<article class="report">';

    // 报告头
    html += '<header class="report-head">'
      + '<div class="report-title-group">'
      + '<span class="report-seal">考</span>'
      + '<div><h3 class="report-title">对话考古报告</h3>'
      + '<p class="report-meta">ChatArch · ' + esc(dateStr) + ' · 样本 ' + p.stats.total + ' 轮 / ' + p.stats.totalChars + ' 字</p></div>'
      + '</div>'
      + '<div class="report-actions">'
      + '<button class="btn btn-small" id="btn-export-img">导出图片</button>'
      + '<button class="btn btn-small" id="btn-export-md">导出文本</button>'
      + '</div>'
      + '</header>';

    // 一、概要
    html += '<section class="report-section"><h4 class="report-h4">一、概要</h4>'
      + '<p class="report-summary">' + esc(a.summary) + '</p>'
      + '<div class="stats">'
      + [['废稿', a.drafts.length], ['卡点', a.hotspots.length],
         ['方向变更', counts['direction-change'] || 0], ['否决', counts['rejection'] || 0],
         ['突破', counts['breakthrough'] || 0], ['定稿', counts['deliverable'] || 0],
         ['协作形态', a.contribution.shape]]
        .map(function (c) { return '<span class="chip"><b>' + esc(c[0]) + '</b>' + esc(c[1]) + '</span>'; }).join('')
      + '</div></section>';

    // 二、阶段谱系
    html += '<section class="report-section"><h4 class="report-h4">二、阶段谱系</h4>'
      + '<table class="report-table"><thead><tr><th>阶段</th><th>轮次范围</th><th>消息数</th><th>人 / 机（字）</th></tr></thead><tbody>';
    a.phases.forEach(function (ph) {
      var bp = null;
      a.contribution.byPhase.forEach(function (x) { if (x.phaseId === ph.id) { bp = x; } });
      html += '<tr><td><span class="report-phase-dot" data-key="' + esc(ph.key) + '"></span>' + esc(ph.name) + '</td>'
        + '<td>第 ' + (ph.startIndex + 1) + '—' + (ph.endIndex + 1) + ' 轮</td>'
        + '<td>' + ph.messageCount + '</td>'
        + '<td>' + (bp ? bp.userChars + ' / ' + bp.aiChars : '-') + '</td></tr>';
    });
    html += '</tbody></table></section>';

    // 三、关键时刻
    var keyEvents = a.events.filter(function (e) {
      return e.type !== 'draft-born' && e.type !== 'draft-died';
    });
    html += '<section class="report-section"><h4 class="report-h4">三、关键时刻</h4>'
      + '<table class="report-table"><thead><tr><th>轮次</th><th>事件</th><th>信号</th><th>原文摘录</th></tr></thead><tbody>';
    keyEvents.forEach(function (e) {
      var meta = EVENT_META[e.type] || { label: e.type };
      html += '<tr><td>' + (e.messageIndex + 1) + '</td>'
        + '<td><span class="report-event-tag" data-type="' + esc(e.type) + '">' + meta.label + '</span></td>'
        + '<td>「' + esc(e.signal || '-') + '」</td>'
        + '<td class="report-excerpt-cell">' + esc(String(e.excerpt).slice(0, 46)) + '</td></tr>';
    });
    html += '</tbody></table></section>';

    // 四、废稿清单
    html += '<section class="report-section"><h4 class="report-h4">四、废稿清单</h4>';
    if (a.drafts.length === 0) {
      html += '<p class="report-note">本次协作未产生被记录的废稿。</p>';
    } else {
      html += '<table class="report-table"><thead><tr><th>编号</th><th>生 → 死</th><th>状态</th><th>死因</th></tr></thead><tbody>';
      a.drafts.forEach(function (d, i) {
        html += '<tr><td>No.' + String(i + 1).padStart(2, '0') + '</td>'
          + '<td>第 ' + (d.bornIndex + 1) + ' → ' + (d.diedIndex + 1) + ' 轮</td>'
          + '<td>' + (d.status === 'revised' ? '被重写' : '被放弃') + '</td>'
          + '<td>' + esc(ROLE_LABEL[p.messages[d.diedIndex].role] || '') + '说「' + esc(d.signal) + '」</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</section>';

    // 五、协作画像
    var c = a.contribution;
    var uPct = Math.round(c.overall.userRatio * 100);
    html += '<section class="report-section"><h4 class="report-h4">五、协作画像</h4>'
      + '<p class="report-note">协作形态：<b>' + esc(c.shape) + '</b> · 人 ' + c.overall.userChars + ' 字（' + uPct + '%）/ 机 ' + c.overall.aiChars + ' 字（' + (100 - uPct) + '%）</p>'
      + '<div class="ratio-bar" style="height:20px">'
      + '<div class="ratio-seg ratio-user" style="width:' + uPct + '%"></div>'
      + '<div class="ratio-seg ratio-ai" style="width:' + (100 - uPct) + '%"></div>'
      + '</div></section>';

    // 六、卡点
    html += '<section class="report-section"><h4 class="report-h4">六、卡点热区</h4>';
    if (a.hotspots.length === 0) {
      html += '<p class="report-note">未检测到卡点。</p>';
    } else {
      html += '<table class="report-table"><thead><tr><th>编号</th><th>位置</th><th>强度</th><th>信号序列</th></tr></thead><tbody>';
      a.hotspots.forEach(function (h, i) {
        var sigs = h.signals.map(function (x) {
          return '第' + (x.messageIndex + 1) + '轮「' + esc(x.signal) + '」';
        }).join('；');
        html += '<tr><td>卡点 ' + String(i + 1).padStart(2, '0') + '</td>'
          + '<td>第 ' + (h.firstIndex + 1) + '—' + (h.lastIndex + 1) + ' 轮</td>'
          + '<td>×' + h.weight + '</td>'
          + '<td class="report-excerpt-cell">' + sigs + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</section>';

    // 尾注
    html += '<footer class="report-footer">'
      + '<p>本报告基于协作行为信号（用词、长度、结构）启发式生成，不声称理解语义；每个结论均可回溯至原始对话文本核对。</p>'
      + '<p class="report-brand">ChatArch · 对话考古 · WorkBuddy 1024 造物挑战参赛作品</p>'
      + '</footer>';

    html += '</article>';
    box.innerHTML = html;

    document.getElementById('btn-export-md').addEventListener('click', function () {
      var md = window.ChatArchReporter.buildMarkdown(p, a, dateStr);
      downloadBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), '对话考古报告-' + dateStr + '.md');
    });

    document.getElementById('btn-export-img').addEventListener('click', function () {
      var canvas = window.ChatArchReporter.drawReportCanvas(p, a, dateStr);
      canvas.toBlob(function (blob) {
        if (blob) { downloadBlob(blob, '对话考古报告-' + dateStr + '.png'); }
      }, 'image/png');
    });
  }

  /* ---------- Tab 切换（带 URL hash 锚点，刷新/分享保持视图） ---------- */

  function switchView(view) {
    if (!els.views[view]) { view = 'timeline'; }
    els.tabs.querySelectorAll('.view-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-view') === view);
    });
    Object.keys(els.views).forEach(function (k) {
      els.views[k].hidden = (k !== view);
    });
    if (window.history && history.replaceState) {
      history.replaceState(null, '', '#' + view);
    }
  }

  els.tabs.querySelectorAll('.view-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      switchView(tab.getAttribute('data-view'));
    });
  });

  // 初始化：读取 #hash 直达对应视图
  (function initViewFromHash() {
    var h = (window.location.hash || '').replace('#', '');
    if (h && els.views[h]) { switchView(h); }
  })();

  /* ---------- 按钮绑定 ---------- */

  els.btnParse.addEventListener('click', function () {
    var raw = els.input.value;
    if (!raw.trim()) {
      showInputError('输入框是空的——请先粘贴一段对话记录（或点「载入示例」）。');
      els.input.focus();
      return;
    }
    run(raw);
  });

  els.btnClear.addEventListener('click', function () {
    els.input.value = '';
    clearInputError();
    els.input.focus();
  });

  els.input.addEventListener('input', clearInputError);

  els.btnReexpand.addEventListener('click', expandInput);

  els.btnSample.addEventListener('click', function () { loadSample('sample_zh.txt'); });
  els.btnSampleEn.addEventListener('click', function () { loadSample('sample_en.txt'); });
  els.btnSampleMd.addEventListener('click', function () { loadSample('sample_md.txt'); });

  function loadSample(file) {
    fetch('testdata/' + file)
      .then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.text();
      })
      .then(function (text) {
        els.input.value = text;
        run(text);
      })
      .catch(function () {
        showInputError('示例数据加载失败：请通过 http 服务访问本页面（当前可能是 file:// 直接打开）。');
      });
  }
})();
