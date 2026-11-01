# 对话考古 · ChatArch

> AI 协作出品会被保留，**生产过程全部丢弃**——而过程才最值钱。

**🔗 在线体验：https://a0217960a7f21e91f.app.workbuddy.host/?sharecode=QZZXLEAWWY**

免登录、免安装，手机浏览器可直接打开。进首页点「**载入示例**」，3 分钟看完一场 50 轮人机协作对话的完整考古现场。

![零依赖](https://img.shields.io/badge/dependencies-0-brightgreen) ![无构建](https://img.shields.io/badge/build-none-blue) ![纯前端](https://img.shields.io/badge/runtime-browser-orange)

---

## 它做什么

粘贴一段你与 AI 的协作对话记录，ChatArch 自动完成 **发掘 → 断代 → 陈列**：

- **发掘**：自动识别格式，切分轮次
- **断代**：按事件锚定划分阶段地层，标记方向变更、否决、犹豫、突破、定稿
- **陈列**：以博物馆图录的质感呈现协作全貌，一键导出考古报告

结论（论文、代码、方案）只占价值的 20%，剩下 80% 埋在被否决的方向、反复的纠结、关键的顿悟里。这个工具负责把它们挖出来陈列。

## 四视图

| 视图 | 展示什么 |
|---|---|
| **共创编年史** | 横向时间线 + 顶部地层压缩带（人/AI/事件密度一眼纵览），点击任意节点展开当时的对话原文 |
| **废稿博物馆** | 卡片墙陈列所有被推翻的产出，标注「死于第几轮」「死因（你的原话）」「是否被重写」 |
| **协作画像** | 人与 AI 的字数配比、分阶段配比、逐轮节奏图（峰值标注） |
| **卡点热区** | 反复纠结的主题按停留轮次排序，附全对话信号总览 |

## 支持 5 种输入格式

| 格式 | 示例 |
|---|---|
| 角色标记（中文） | `用户：…` / `助手：…` |
| 角色标记（英文） | `Human: …` / `Assistant: …`、Q/A |
| Markdown 标题 | `### User` / `### Assistant` |
| emoji 角色 | `🧑 …` / `🤖 …` |
| JSON 导出数组 | `[{"role":"user","content":"…"}]` |
| 纯文本 | 无法识别时按单条内容兜底，并给出明确提示 |

## 快速开始

纯前端零依赖，无需安装、无需构建：

```bash
cd chatarch
python3 -m http.server 8080
# 打开 http://localhost:8080
```

或任意静态服务器 / 直接双击 `index.html`（file:// 打开亦可运行）。

## 方法论立场（诚实边界）

**启发式分析，不声称理解语义。**

分析引擎基于协作行为信号（用词、长度、结构）推断，**不调用任何大模型、不做语义理解**。因此：

- 每个结论都附带触发文本，点击卡片即可展开原文核对
- 无强信号时诚实呈现单阶段，**不虚构叙事**
- 解析失败、格式未知时明确提示，不静默降级

## 项目结构

```
chatarch/
├── index.html            # 入口（着陆页 + 导入 + 工作区五视图）
├── src/css/main.css      # 考古主题设计系统（土层色板 + 博物馆质感）
├── src/js/parser.js      # 多格式对话解析器
├── src/js/analyzer.js    # 启发式分析引擎
├── src/js/reporter.js    # Markdown + Canvas 报告生成
├── src/js/app.js         # 视图渲染与交互
├── test/                 # 27 个单元测试（解析器 13 + 分析引擎 14）
├── scripts/              # E2E / 截图 / 线上巡检工具脚本
├── testdata/             # 3 份等价示例（中文 / 英文 / Markdown，各 50 轮）
└── docs/                 # 规划书、投稿材料、社媒文案、效果截图
```

## 测试

```bash
node test/parser.test.js    # 解析器：13 项
node test/analyzer.test.js  # 分析引擎：14 项
node scripts/e2e.js         # 浏览器 E2E：33 项（需先启动 http 服务，依赖 Playwright）
```

单元测试为 Node 直跑的轻量框架，无外部依赖。**27 项单元测试已在本机实跑通过（0 失败）**。E2E 需 Playwright 环境。

## 技术约束

- 纯前端单页应用，无后端依赖，数据仅存内存
- UMD 模块模式：浏览器全局挂载 + Node require 双端可用
- 图表全部手绘（DOM / SVG / Canvas），不引入任何第三方库
- 零构建：静态文件目录，可直接托管

## 关于

WorkBuddy「1024 造物挑战」程序员节应用创作大赛参赛作品（2026）。

参赛材料见 `docs/`：规划书（`PLAN.md`）、投稿说明（`SUBMISSION.md`）、投稿表单答案（`FORM_ANSWERS.md`）、社媒文案（`SOCIAL_POST.md`）。
