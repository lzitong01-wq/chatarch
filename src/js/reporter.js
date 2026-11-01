/* ============================================================
   ChatArch 报告模块（S4）
   - buildMarkdown(parse, analysis, dateStr)：完整文本报告（.md）
   - drawReportCanvas(parse, analysis, dateStr)：报告卡片图（PNG）
   ============================================================ */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { global.ChatArchReporter = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FONT_SERIF = '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", serif';
  var FONT_SANS = '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif';

  var ROLE_LABEL = { user: '用户', ai: '助手' };
  var EVENT_LABEL = {
    'direction-change': '方向变更', 'rejection': '否决', 'hesitation': '犹豫',
    'breakthrough': '突破', 'deliverable': '定稿'
  };
  var PHASE_COLORS = {
    explore: '#c2ad84', struggle: '#8a5a2b', converge: '#b08a3e', plain: '#b0a48c'
  };

  /* ================= 文本报告 ================= */

  function buildMarkdown(parse, analysis, dateStr) {
    var s = parse.stats;
    var L = [];
    var phaseById = {};
    analysis.phases.forEach(function (p) { phaseById[p.id] = p; });

    L.push('# 对话考古报告');
    L.push('');
    L.push('> ChatArch · ' + dateStr + ' · 样本：' + s.total + ' 轮 / ' + s.totalChars +
      ' 字（人 ' + s.userChars + ' / 机 ' + s.aiChars + '）');
    L.push('');

    L.push('## 一、概要');
    L.push('');
    L.push(analysis.summary);
    L.push('');

    L.push('## 二、阶段谱系');
    L.push('');
    L.push('| 阶段 | 轮次范围 | 消息数 | 人 / 机（字） |');
    L.push('| --- | --- | --- | --- |');
    analysis.phases.forEach(function (p) {
      var bp = null;
      analysis.contribution.byPhase.forEach(function (x) { if (x.phaseId === p.id) { bp = x; } });
      L.push('| ' + p.name + ' | 第 ' + (p.startIndex + 1) + '—' + (p.endIndex + 1) + ' 轮 | ' +
        p.messageCount + ' | ' + (bp ? bp.userChars + ' / ' + bp.aiChars : '-') + ' |');
    });
    L.push('');

    L.push('## 三、关键时刻');
    L.push('');
    L.push('| 轮次 | 角色 | 事件 | 信号 | 原文摘录 |');
    L.push('| --- | --- | --- | --- | --- |');
    analysis.events.forEach(function (e) {
      if (e.type === 'draft-born' || e.type === 'draft-died') { return; }
      var label = EVENT_LABEL[e.type] || e.type;
      var role = ROLE_LABEL[e.role] || e.role;
      L.push('| ' + (e.messageIndex + 1) + ' | ' + role + ' | ' + label + ' | ' +
        (e.signal || '-') + ' | ' + String(e.excerpt).replace(/\|/g, '/').slice(0, 50) + ' |');
    });
    L.push('');

    L.push('## 四、废稿清单');
    L.push('');
    if (analysis.drafts.length === 0) {
      L.push('本次协作未产生被记录的废稿。');
    } else {
      analysis.drafts.forEach(function (d, i) {
        L.push((i + 1) + '. **No.' + String(i + 1).padStart(2, '0') + '** 生于第 ' + (d.bornIndex + 1) +
          ' 轮 → 死于第 ' + (d.diedIndex + 1) + ' 轮 · ' +
          (d.status === 'revised' ? '被重写' : '被放弃') +
          ' · 死因：' + (ROLE_LABEL[parse.messages[d.diedIndex].role] || '') + '说「' + d.signal + '」');
        L.push('   - 摘录：' + d.excerpt);
      });
    }
    L.push('');

    L.push('## 五、协作画像');
    L.push('');
    var c = analysis.contribution;
    L.push('- 协作形态：**' + c.shape + '**');
    L.push('- 人 ' + c.overall.userChars + ' 字（' + Math.round(c.overall.userRatio * 100) + '%）/ 机 ' +
      c.overall.aiChars + ' 字（' + Math.round(c.overall.aiRatio * 100) + '%）');
    c.byPhase.forEach(function (bp) {
      L.push('- ' + bp.name + '：人 ' + bp.userChars + ' / 机 ' + bp.aiChars);
    });
    L.push('');

    L.push('## 六、卡点热区');
    L.push('');
    if (analysis.hotspots.length === 0) {
      L.push('未检测到卡点。');
    } else {
      analysis.hotspots.forEach(function (h, i) {
        var sigs = h.signals.map(function (x) {
          return '第' + (x.messageIndex + 1) + '轮 ' + (EVENT_LABEL[x.type] || x.type) + '「' + x.signal + '」';
        }).join('；');
        L.push((i + 1) + '. **卡点 ' + String(i + 1).padStart(2, '0') + '** 第 ' + (h.firstIndex + 1) +
          '—' + (h.lastIndex + 1) + ' 轮 · 强度 ×' + h.weight + ' · ' + sigs);
      });
    }
    L.push('');

    L.push('---');
    L.push('');
    L.push('*方法与边界：本报告由 ChatArch 基于协作行为信号（用词、长度、结构）启发式生成，' +
      '不声称理解语义；每个结论均可回溯至原始对话文本核对。*');
    L.push('');
    L.push('*ChatArch · 对话考古 · WorkBuddy 1024 造物挑战参赛作品*');

    return L.join('\n');
  }

  /* ================= 图片报告（Canvas） ================= */

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    var lines = [];
    String(text).split('\n').forEach(function (para) {
      var line = '';
      for (var i = 0; i < para.length; i++) {
        var ch = para[i];
        if (line && ctx.measureText(line + ch).width > maxWidth) {
          lines.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
      if (line) { lines.push(line); }
    });
    if (maxLines && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.$/, '…');
    }
    return lines;
  }

  function drawReport(ctx, parse, analysis, dateStr) {
    var W = 900, PAD = 56, CW = W - PAD * 2;
    var INK = '#2b2118', SOFT = '#756653', FAINT = '#a5977f', LINE = '#d9cdb6';
    var s = parse.stats;

    // 背景
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, W, 3000);

    var y = 46;

    /* ---- 头部 ---- */
    roundRect(ctx, PAD, y, 46, 46, 5);
    ctx.fillStyle = '#a3392a';
    ctx.fill();
    ctx.fillStyle = '#fdf6e3';
    ctx.font = '600 26px ' + FONT_SERIF;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('考', PAD + 23, y + 25);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 32px ' + FONT_SERIF;
    ctx.fillStyle = INK;
    ctx.fillText('对话考古报告', PAD + 64, y + 12);
    ctx.font = '14px ' + FONT_SANS;
    ctx.fillStyle = SOFT;
    ctx.fillText('ChatArch · ' + dateStr + ' · 样本 ' + s.total + ' 轮 / ' + s.totalChars + ' 字', PAD + 64, y + 38);
    y += 46 + 24;

    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 28;

    /* ---- 概要 ---- */
    ctx.font = '600 18px ' + FONT_SERIF;
    ctx.fillStyle = INK;
    ctx.fillText('概要', PAD, y + 16);
    y += 32;
    ctx.font = '16px ' + FONT_SERIF;
    ctx.fillStyle = INK;
    var sumLines = wrapLines(ctx, analysis.summary, CW, 5);
    sumLines.forEach(function (line) {
      ctx.fillText(line, PAD, y + 14);
      y += 30;
    });
    y += 14;

    /* ---- 统计 chips ---- */
    var counts = {};
    analysis.events.forEach(function (e) { counts[e.type] = (counts[e.type] || 0) + 1; });
    var chips = [
      ['废稿', analysis.drafts.length], ['卡点', analysis.hotspots.length],
      ['方向变更', counts['direction-change'] || 0], ['否决', counts['rejection'] || 0],
      ['突破', counts['breakthrough'] || 0], ['定稿', counts['deliverable'] || 0]
    ];
    var cx = PAD;
    chips.forEach(function (chip) {
      var label = chip[0] + ' ' + chip[1];
      ctx.font = '14px ' + FONT_SANS;
      var tw = ctx.measureText(label).width;
      var bw = tw + 28;
      roundRect(ctx, cx, y, bw, 32, 16);
      ctx.fillStyle = '#ece4d2';
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.stroke();
      ctx.fillStyle = SOFT;
      ctx.textAlign = 'center';
      ctx.fillText(label, cx + bw / 2, y + 22);
      ctx.textAlign = 'left';
      cx += bw + 10;
    });
    y += 32 + 26;

    /* ---- 阶段谱系 ---- */
    ctx.font = '600 18px ' + FONT_SERIF;
    ctx.fillStyle = INK;
    ctx.fillText('阶段谱系', PAD, y + 16);
    y += 34;
    analysis.phases.forEach(function (p) {
      var bp = null;
      analysis.contribution.byPhase.forEach(function (x) { if (x.phaseId === p.id) { bp = x; } });
      // 色带
      roundRect(ctx, PAD, y, 130, 34, 3);
      ctx.fillStyle = PHASE_COLORS[p.key] || '#b0a48c';
      ctx.fill();
      ctx.fillStyle = '#fdf6e3';
      ctx.font = '600 15px ' + FONT_SERIF;
      ctx.textAlign = 'center';
      ctx.fillText(p.name, PAD + 65, y + 23);
      ctx.textAlign = 'left';
      // 说明
      ctx.font = '14px ' + FONT_SANS;
      ctx.fillStyle = INK;
      ctx.fillText('第 ' + (p.startIndex + 1) + '—' + (p.endIndex + 1) + ' 轮 · ' + p.messageCount + ' 条消息', PAD + 146, y + 15);
      ctx.fillStyle = SOFT;
      ctx.fillText(bp ? ('人 ' + bp.userChars + ' / 机 ' + bp.aiChars + ' 字') : '', PAD + 146, y + 31);
      y += 34 + 10;
    });
    y += 16;

    /* ---- 废稿清单 ---- */
    ctx.font = '600 18px ' + FONT_SERIF;
    ctx.fillStyle = INK;
    ctx.fillText('废稿清单', PAD, y + 16);
    y += 34;
    if (analysis.drafts.length === 0) {
      ctx.font = '14px ' + FONT_SANS;
      ctx.fillStyle = FAINT;
      ctx.fillText('本次协作未产生被记录的废稿。', PAD, y + 14);
      y += 30;
    } else {
      analysis.drafts.slice(0, 5).forEach(function (d, i) {
        // 印章
        ctx.font = '12px ' + FONT_SERIF;
        var seal = d.status === 'revised' ? '被重写' : '被放弃';
        var sealColor = d.status === 'revised' ? '#a3392a' : '#5a4f43';
        ctx.fillStyle = sealColor;
        ctx.fillText('No.' + String(i + 1).padStart(2, '0'), PAD, y + 15);
        ctx.fillStyle = INK;
        ctx.font = '14px ' + FONT_SANS;
        var line = '生于第 ' + (d.bornIndex + 1) + ' 轮 → 死于第 ' + (d.diedIndex + 1) + ' 轮 · ' +
          (ROLE_LABEL[parse.messages[d.diedIndex].role] || '') + '说「' + d.signal + '」';
        ctx.fillText(line, PAD + 56, y + 15);
        // 右侧印章
        ctx.font = '12px ' + FONT_SERIF;
        var sw = ctx.measureText(seal).width + 16;
        roundRect(ctx, W - PAD - sw, y + 2, sw, 20, 3);
        ctx.strokeStyle = sealColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = sealColor;
        ctx.textAlign = 'center';
        ctx.fillText(seal, W - PAD - sw / 2, y + 16);
        ctx.textAlign = 'left';
        y += 32;
      });
      if (analysis.drafts.length > 5) {
        ctx.font = '13px ' + FONT_SANS;
        ctx.fillStyle = FAINT;
        ctx.fillText('……等共 ' + analysis.drafts.length + ' 份废稿', PAD, y + 13);
        y += 28;
      }
    }
    y += 14;

    /* ---- 卡点 ---- */
    if (analysis.hotspots.length > 0) {
      ctx.font = '600 18px ' + FONT_SERIF;
      ctx.fillStyle = INK;
      ctx.fillText('卡点热区', PAD, y + 16);
      y += 34;
      analysis.hotspots.slice(0, 2).forEach(function (h, i) {
        var sigs = h.signals.map(function (x) {
          return '第' + (x.messageIndex + 1) + '轮' + (EVENT_LABEL[x.type] || x.type) + '「' + x.signal + '」';
        }).join('；');
        var text = '卡点 ' + String(i + 1).padStart(2, '0') + ' · 第 ' + (h.firstIndex + 1) + '—' + (h.lastIndex + 1) +
          ' 轮 · 强度 ×' + h.weight + ' · ' + sigs;
        ctx.font = '14px ' + FONT_SANS;
        ctx.fillStyle = INK;
        var lines = wrapLines(ctx, text, CW, 2);
        lines.forEach(function (line) {
          ctx.fillText(line, PAD, y + 14);
          y += 26;
        });
        y += 6;
      });
      y += 10;
    }

    /* ---- 协作画像 ---- */
    ctx.font = '600 18px ' + FONT_SERIF;
    ctx.fillStyle = INK;
    ctx.fillText('协作画像', PAD, y + 16);
    y += 34;
    var c = analysis.contribution;
    ctx.font = '14px ' + FONT_SANS;
    ctx.fillStyle = SOFT;
    ctx.fillText('协作形态：' + c.shape + ' · 人 ' + c.overall.userChars + ' 字 / 机 ' + c.overall.aiChars + ' 字', PAD, y + 14);
    y += 28;
    // 比例条
    var barW = CW, uW = Math.round(barW * c.overall.userRatio);
    roundRect(ctx, PAD, y, uW, 18, 3);
    ctx.fillStyle = '#46655a';
    ctx.fill();
    roundRect(ctx, PAD + uW, y, barW - uW, 18, 3);
    ctx.fillStyle = '#8a5a2b';
    ctx.fill();
    ctx.font = '12px ' + FONT_SANS;
    ctx.fillStyle = '#fdf6e3';
    if (c.overall.userRatio > 0.15) { ctx.textAlign = 'center'; ctx.fillText('人 ' + Math.round(c.overall.userRatio * 100) + '%', PAD + uW / 2, y + 13); }
    if (c.overall.aiRatio > 0.15) { ctx.textAlign = 'center'; ctx.fillText('AI ' + Math.round(c.overall.aiRatio * 100) + '%', PAD + uW + (barW - uW) / 2, y + 13); }
    ctx.textAlign = 'left';
    y += 18 + 34;

    /* ---- 页脚 ---- */
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 22;
    ctx.font = '12px ' + FONT_SANS;
    ctx.fillStyle = FAINT;
    ctx.fillText('本报告基于协作行为信号启发式生成，每个结论可回溯至原始对话核对。', PAD, y + 10);
    y += 22;
    ctx.fillText('ChatArch · 对话考古 · WorkBuddy 1024 造物挑战参赛作品', PAD, y + 10);
    y += 30;

    return y;
  }

  function drawReportCanvas(parse, analysis, dateStr) {
    // 第一遍：测量高度
    var scratch = document.createElement('canvas');
    scratch.width = 900;
    scratch.height = 3000;
    var sctx = scratch.getContext('2d');
    var H = drawReport(sctx, parse, analysis, dateStr) + 20;

    // 第二遍：2x 高清正式绘制
    var c = document.createElement('canvas');
    c.width = 900 * 2;
    c.height = H * 2;
    var ctx = c.getContext('2d');
    ctx.scale(2, 2);
    drawReport(ctx, parse, analysis, dateStr);
    return c;
  }

  return {
    buildMarkdown: buildMarkdown,
    drawReportCanvas: drawReportCanvas
  };
});
