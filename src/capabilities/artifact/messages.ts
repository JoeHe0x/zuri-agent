import { defineMessages } from "#sdk/shared/i18n-definition";

/** Artifact guidance for the model: a floor of fixed rules, then defaults that need a real reason. */
const messages = defineMessages("artifact", {
  displayName: { "zh-CN": "Artifact（预览）", en: "Artifact (Preview)" },
  description: {
    "zh-CN": "分析、调研、审计、评测对比类任务的交付规范：用户让你分析一个实验、一份数据、一个页面或一个产品，并要给出可阅读、可转发的结论时，在开始分析前就加载它。它决定要收集哪些证据，并把结果做成精致的报告、审计、对比、简报或仪表盘文件。单个事实、简短问答、原样下载和格式转换无需加载。",
    en: "Delivery standard for analysis, research, audit, and comparison tasks: when the user asks you to analyze an experiment, a dataset, a page, or a product and the conclusion should be readable and shareable, load it before you start analyzing. It sets which evidence to collect and turns the result into a polished report, audit, comparison, brief, or dashboard file. Not needed for a single fact, a short answer, an unchanged download, or format conversion.",
  },
  content: {
    "zh-CN": `# Artifact

## 先判断要不要做成文件

用户选择或你加载本 skill，说明可能需要一份产物，但是否生成由内容决定：

- **做成文件**：内容会被阅读、转发或留存；有多个部分、数字对比、表格或图表；用户明确要报告、页面、简报或导出。拿不准且内容较多（三节以上或有数字对比）时，倾向做成文件。
- **直接在聊天里答**：单个事实、一次查询、简短总结、追问澄清、闲聊，或用户明确说"直接告诉我"。这时不要为了用 skill 而硬做文件。
- 做成文件时，先把所需内容读取齐全；内容不足就继续读取或查询，不用占位内容凑数。聊天里只给结论、文件名和必要限制。

目标：产物像人设计过，而不是模型默认生成的。先选路径，再守底线，最后自检。

## 文字与标题（少即是多）

读者先扫一眼，只应该看到结论。每多一句废话，重点就被稀释一分。

- 页面标题（h1）是"对象 + 主题"的名词短语，不超过 20 个字，不写成句子，不带冒号和破折号，不放结论。结论放进 \`.verdict\`，一句话，不超过 60 字。
- 章节标题（h2）不超过 12 个字，写这一节讲什么（"肉类占比"），不写论断；\`.lead\` 可选，最多一行。图表和面板标题（h3）不超过 10 个字，单位放在 \`.desc\`。
- 指标名不超过 8 个字，口径放在 \`<em>\` 里；\`.meta\` 最多 3 项，只写日期、范围、口径，不写 trace_id、用户 ID 之类的细节（它们放进文末"数据范围"）。
- 一节一个重点：先给结论，再给证据，删去重复证据、背景铺垫和"值得注意的是"一类的话；同一事实全页只写一次。
- 颜色只用在状态和被比较的那一组数据上；标题、正文、数值一律用墨色，不给文字、粗体或标题染色，不用多个强调色。
- 字号只有三档：标题 1.25rem、章节 0.9375rem、正文和表格 13–15px；用字重和灰度区分层次，不靠加大字号。
- 表格不超过 6 列，约 5 列最佳；更宽的转置，或拆成两张，或把次要列改写进说明文字。
- 首屏元素的标签照套件骨架写：\`h1\`、\`p.verdict\`、\`p.meta\`（内含 \`span\`）、\`ul.summary\`；宿主按这些标签检查文字量，换成 \`div\` 或 \`ol\` 不会被跳过，只会失去检查提示。
- 通篇是"结论—证据—来源"，不要写给读者的话（"本报告旨在…"）、过程叙述（"我首先查询了…"）和结尾总结。
- 只用读取到的真实数据，不为填满网格凑数字或放占位值；\`.note\` 只给风险和必须看到的结果，不当默认开头；每张图表和每个面板都要支撑所在章节标题里的论点。
- 保存时宿主会检查：首屏文字配额、写死的颜色（\`:root\` 之外的 #hex / rgb / hsl）、外部脚本图片样式；不符合会被退回，按提示修正后再保存。

### 首屏文字配额

首屏由标题、verdict、meta、summary、指标条组成，每块各管一件事，不互相重复：

- verdict：一句话，只说"是什么 + 主因"，不超过 60 字，不带数字清单、不带限制条件、不带建议。
- meta：一行，最多 3 项，用 · 分隔（日期 · 场景 · 口径）；trace_id、uid、环境参数放进末尾"数据范围"。
- summary：最多 3 条，每条不超过 30 字，只写 verdict 没有的新事实；数字已经在指标条里的不再重复。
- 需要确认的疑点、限制不放首屏，放进 \`.points\`。
- 写完逐句自问：删掉这句，读者会少知道什么？答不上来就删。

例（改前）：头部几乎全是肉类，原因是 SageMaker 精排分数直接决定了前 100 名的顺序；重排阶段只做过滤和截断，没有任何打散或多样性步骤。
例（改后）：前排被肉类占满，主因是精排分数；重排只过滤、不打散。

## 怎么做

- 分析、审计、对比、简报、仪表盘都做成同一种产物：自包含的 HTML 页面。先 \`load_skill_resource\` 读 \`references/components.md\`（组件套件，必读），做审计或对比时必读 \`references/audit-and-compare.md\`，页面里有任何数字对比时必读 \`references/charts.md\`（数字对比先画图，不要用表格代替），需要时间线、对比、清单、占比条、大数字、流程漏斗、待确认事项和数据范围时再读 \`references/components-extra.md\`，需要特定气质再读 \`references/themes/\` 下一个主题（实验、审计、监控类用 \`instrument\`；趋势图卡片和仪表盘用 \`console-charts\`），然后用 \`save_file\` 写自包含的 \`.html\`，页面开头保留 \`<!-- zuri-artifact -->\` 戳记，侧边栏会预览。分析类页面也走这条路径，不要手写一套新 CSS。

## 底线（不可违反）

1. 所有颜色和字体都经由 \`:root\` 里的变量，变量之外不出现颜色字面量。
2. 不用纯黑 \`#000\`、纯白 \`#fff\`；中性色带一点色相。
3. 段落正文 15px 以上，行高 1.5–1.65，行宽不超过 68ch；表格、图例、图注可到 13px；对比度至少 4.5:1。
4. 容器限制最大宽度并居中；手机宽度下不出现横向滚动，宽表格放进可滚动容器。
5. 每个可交互元素有 \`:focus-visible\`；动画要有 \`prefers-reduced-motion\` 降级；不用 \`transition: all\`。
6. 标签、表头、图注用正文字体、小一号、句首大写，不加字距、不全大写、不用等宽字体装饰。
7. 不用紫蓝渐变、emoji 当图标、卡片套卡片、装饰性状态圆点；不手绘浏览器或系统窗口。
8. 每屏文字克制，一个重点；用字号、留白和分组建立层次，而不是更多文字或更多边框。
9. **不编造**：数字、引言、来源、图片都只来自已读取的内容。缺数据时写明"未获取"和原因，不用占位数字。
10. **每个关键结论带来源**：页面 URL、文件名或表格位置，放在结论旁或段末。

## 完成度（像成熟的 dashboard，而不是演示页）

- 克制：圆角不超过 6px，不用药丸、大阴影、渐变和超大数字；指标最大 1.75rem 左右，层次靠字重、灰度和细线。
- 有密度：数据文字 13–15px，面板紧凑；每个面板有标题，标题写清度量和单位。
- 有结构：第一屏是标题加一句判断，其下是一条指标条（标签在上、数值在下）；之后每节一个论点，证据放进面板。
- 范围清楚：日期范围、数据来源、口径写在 meta 行，不藏在段落里。
- 状态用小标签（badge）表达，同时写出文字；一页只用一个强调色。
- 数字对比先画图，表格放配置和明细；合并重复内容，不把每个来源都铺成一整节。
- 来源写在每节末尾一行 \`.src\`，页尾来源列表只列去重后的链接。

## 反射（模型的默认习惯，需要真实理由才能用）

- 每个标题上方加一行小标签；标题里只给一个词换色；三列等宽图标卡片。
- 奶油纸、衬线标题加赤陶色强调；黑底加荧光点缀；药丸按钮铺满页面。
- 结尾固定加"下一步"或订阅区块，哪怕读者并不需要。

## 按任务组织

先读 \`components.md\`；数字对比读 \`charts.md\`；审计和对比读 \`audit-and-compare.md\`。

- **报告/分析**：hero（标题写结论、verdict、最多 3 条 summary、指标条）→ 按论点分节，每节先图后表 → 时间线、对比、清单按内容需要使用 → 证据范围（\`.checks\`）和下一步 → 来源。
- **审计**：hero 里放总评分数和严重程度计数 → 按严重、警告、建议分节的 \`.issues\`，每条有依据、影响、来源 → \`.actions\` 行动清单（优先级、收益、验证方式）→ 审计范围和方法。
- **对比/评测**：推荐 \`.note\` → \`.matrix\` 对比矩阵 → 数值维度的横条图 → 每个选项最不适合的场景 → 来源。
- **简报**：一页内读完：标题、verdict、最多 3 条 summary、不超过 4 个指标、一节要点、来源；不加章节导航和装饰块。研究简报同理：结论在前，证据在后，来源在末尾。
- **仪表盘/数据页**：读 \`themes/dashboard.md\`：\`.toolbar\` 筛选范围 → \`.kpis\` → \`.dash\` 面板网格 → 页脚口径；没有长篇叙述。

## 图表

- 一个值用大数字，不画单柱图；2–5 个值用数字行或横向条；时间序列用折线；超过约 7 个类别改用表格；占比用堆叠横条，不用饼图、环形图或仪表盘。
- 一个系列用强调色，其余用中性色；柱从零开始；只用一个 y 轴；网格线不超过 5 条，实线细线；不加阴影、3D、渐变。
- 文字不染数据色，系列用色块图例标识；数字用 \`font-variant-numeric: tabular-nums\`。

## 交付前自检

1. 逐条核对数字和来源，删掉无法追溯的内容。
2. 想象 375px 和 1280px 宽度：有没有溢出、重叠、过窄的文字列？
3. 浅色和深色下对比度都够吗？强调色是否只在一两处？
4. 最终回复只给一句摘要、文件名和必要限制，不复制整份内容。`,
    en: `# Artifact

## Decide whether a file is warranted

The user selecting this skill, or you loading it, suggests a deliverable may be needed, but the content decides whether to produce one:

- **Make a file** when the content will be read, shared, or kept; has several parts, numeric comparisons, tables, or charts; or the user asked for a report, page, brief, or export. When unsure and the content is substantial (three or more sections, or any numeric comparison), lean toward a file.
- **Answer in chat** for a single fact, one lookup, a short summary, a clarifying question, or small talk, or when the user says "just tell me". Do not force a file just to use the skill.
- When making a file, gather all the content first; if something is missing, keep reading or querying rather than padding with placeholders. Keep the chat reply to the conclusion, the filename, and material limitations.

The goal is an output that looks designed, not generated by default. Pick the path, hold the floor, then self-check.

## Text and titles (less is more)

Readers scan first and should see the conclusion first. Every filler sentence dilutes the point.

- The page title (h1) is a noun phrase of object + topic, at most 12 words, never a sentence, no colon or dash, no conclusion. The conclusion goes in \`.verdict\`, one sentence, at most 40 words.
- Section titles (h2) are at most 6 words and say what the section covers ("Meat share"), not a claim; \`.lead\` is optional, one line at most. Panel and chart titles (h3) are at most 5 words; the unit goes in \`.desc\`.
- Metric names are at most 4 words with the definition in \`<em>\`; \`.meta\` has at most 3 items, only date, scope, and definition. Detail such as trace IDs or user IDs goes in a closing "Data scope" section.
- One point per section: conclusion first, then evidence. Cut repeated evidence, background build-up, and "it is worth noting" phrasing; state each fact once on the page.
- Colour marks status and the compared group only. Titles, body text, and values stay in ink; no coloured text, coloured bold, or multiple accents.
- Three type sizes: title 1.25rem, section 0.9375rem, body and tables 13–15px. Separate levels with weight and grey, not size.
- Tables have at most 6 columns, about 5 at best; transpose a wider one, split it in two, or move minor columns into the description text.
- Write first-screen elements with the kit skeleton's tags: \`h1\`, \`p.verdict\`, \`p.meta\` (with \`span\` items), \`ul.summary\`. The host checks text length on these tags; other tags are not checked.
- The page reads conclusion, evidence, source. No addressing the reader ("This report aims to…"), no narrating process ("I first queried…"), no closing summary.
- Use only real data you have read; do not invent numbers to fill a grid or leave placeholder values. Use \`.note\` for risks and results the reader must not miss, not as a default opener. Every chart and panel must back the point in its section title.
- On save the host checks the first-screen text budget, hard-coded colours (#hex / rgb / hsl outside \`:root\`), and remote scripts, images, or styles; a page that fails is sent back, so fix what it lists and save again.

### First-screen text budget

The first screen has a title, verdict, meta, summary, and metric strip. Each owns one job and none repeats another:

- verdict: one sentence saying "what + main cause", at most 40 words, with no number lists, caveats, or recommendations.
- meta: one line, at most 3 items separated by · (date · scenario · definition); trace IDs, uids, and environment parameters go in the closing "Data scope".
- summary: at most 3 bullets of at most 20 words each, only facts the verdict lacks; do not repeat numbers already in the metric strip.
- Open questions and limits stay off the first screen; put them in \`.points\`.
- After writing, ask of each sentence: what would the reader miss without it? Delete it if there is no answer.

Before: The head is almost all meat because the SageMaker ranking score directly decides the order of the top 100; the rerank stage only filters and truncates, with no diversification step.
After: Meat fills the top slots because of the ranking score; rerank only filters, it does not diversify.

## How to build it

- Reports, audits, comparisons, briefs, and dashboards are all the same kind of artifact: one self-contained HTML page. Read \`references/components.md\` with \`load_skill_resource\` (the component kit, required), read \`references/audit-and-compare.md\` for an audit or a comparison, read \`references/charts.md\` whenever the page compares numbers (draw a chart first; do not substitute a table), read \`references/components-extra.md\` for a trail, diff, checklist, ratio bar, big figure, pipeline funnel, open items, or data scope, and read one theme under \`references/themes/\` when a specific character is needed (\`instrument\` for experiment, audit, and monitoring content; \`console-charts\` for trend chart cards and dashboards), then write a self-contained \`.html\` with \`save_file\`, keeping the \`<!-- zuri-artifact -->\` stamp at the top; the side panel previews it. Analysis pages take this path too; do not hand-write a new stylesheet.

## Floor (never broken)

1. Every colour and font goes through a variable on \`:root\`; no colour literals outside the variable block.
2. No pure black \`#000\` or pure white \`#fff\`; tint neutrals slightly.
3. Paragraph text 15px or more, line height 1.5–1.65, prose no wider than 68ch; tables, legends, and captions may go down to 13px; contrast at least 4.5:1.
4. A capped, centred container; no horizontal scroll at phone width; wide tables sit in a scrollable wrapper.
5. Every interactive element has \`:focus-visible\`; animation has a \`prefers-reduced-motion\` fallback; never \`transition: all\`.
6. Labels, table heads, and captions use the body face, one step smaller, sentence case, untracked: no all-caps, no letter-spacing, no monospace as decoration.
7. No purple-to-blue gradients, emoji as icons, cards inside cards, decorative status dots, or hand-drawn browser or OS windows.
8. Restrained text per screen, one point at a time; build hierarchy with size, space, and grouping, not more words or more borders.
9. **Never invent**: numbers, quotes, sources, and images come only from content you have read. When data is missing, write "not retrieved" and why; never use a placeholder figure.
10. **Cite every key conclusion**: page URL, filename, or table location, beside the claim or at the end of the paragraph.

## Finish (a mature dashboard, not a demo page)

- Restrained: radius no more than 6px; no pills, heavy shadows, gradients, or oversized numbers; the largest metric is about 1.75rem, and hierarchy comes from weight, grey steps, and hairlines.
- Dense: data text 13–15px and compact panels; every panel has a title that names the measure and its unit.
- Structured: the first screen is a title and one line of judgment, then a metric strip (label above, value below); each later section makes one point with its evidence inside panels.
- Scope is explicit: date range, data source, and definitions sit in the meta line, not buried in paragraphs.
- Status is a small tag (badge) that also carries a word; one accent colour per page.
- Draw numeric comparisons first; tables hold configuration and detail; merge duplicate content, and do not give every source its own section.
- Put sources in one \`.src\` line at the end of each section; the footer list holds deduplicated links only.

## Reflex (model defaults that need a real reason)

- A small label above every heading; one recoloured word in a headline; three equal icon cards.
- Cream paper with serif headings and a terracotta accent; black with a neon accent; pill buttons everywhere.
- A fixed "next steps" or signup block at the end whether or not the reader needs it.

## Build from the task

Read \`components.md\` first; \`charts.md\` for numeric comparisons; \`audit-and-compare.md\` for audits and comparisons.

- **Report or analysis**: the hero (a title that states the conclusion, a verdict, up to three summary lines, a metric strip) → sections by claim, chart before table in each → a trail, diff, or checklist where the content needs one → evidence scope (\`.checks\`) and next steps → sources.
- **Audit**: the hero carries the overall score and severity counts → \`.issues\` grouped as critical, warning, and advice, each entry with evidence, impact, and source → \`.actions\` (priority, benefit, how to verify) → audit scope and method.
- **Comparison or review**: a recommendation \`.note\` → the \`.matrix\` → bar charts for numeric dimensions → each option's worst-fit scenario → sources.
- **Brief**: readable on one page: a title, a verdict, up to three summary lines, no more than four metrics, one section of key points, sources; no section navigation or decorative blocks. A research brief is the same: conclusion first, evidence after, sources at the end.
- **Dashboard or data page**: read \`themes/dashboard.md\`: the \`.toolbar\` scope → \`.kpis\` → the \`.dash\` panel grid → footer definitions; no long narrative.

## Charts

- One value is a big number, never a one-bar chart; two to five values are a number row or horizontal bars; a time series is a line; more than about seven categories become a table; parts of a whole are a stacked horizontal bar, never a pie, donut, or gauge.
- One accent series with the rest neutral; bars start at zero; one y-axis; no more than five thin solid gridlines; no shadows, 3D, or gradients.
- Text never wears a data colour; identify series with a swatch legend; numbers use \`font-variant-numeric: tabular-nums\`.

## Check before delivering

1. Verify every number and source; delete anything you cannot trace.
2. Picture 375px and 1280px: any overflow, overlap, or too-narrow text column?
3. Is contrast sufficient in light and dark? Is the accent used in only one or two places?
4. In the reply, give one summary line, the filename, and material limitations; do not paste the content.`,
  },
  themeKit: {
    "zh-CN": `# 组件套件（自定义页面的起点）

自定义页面从这里开始，不要从空白 CSS 写起。把下面的样式原样放进 \`<style>\`，只改 \`:root\` 里的颜色变量来换气质，再用这些 class 搭页面。需要特定气质时先读一个主题，用它的变量覆盖 \`:root\`。

\`\`\`css
:root {
  --paper: oklch(97.5% .005 255); --surface: oklch(99% .003 255); --ink: oklch(23% .02 255); --muted: oklch(47% .02 255); --rule: oklch(90% .008 255);
  --accent: oklch(47% .14 255); --ok: oklch(46% .11 155); --warn: oklch(50% .12 70); --bad: oklch(48% .16 27);
  --r: 6px; --font: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
@media (prefers-color-scheme: dark) { :root { --paper: oklch(18.5% .012 255); --surface: oklch(22.5% .014 255); --ink: oklch(93% .008 255); --muted: oklch(72% .015 255); --rule: oklch(32% .015 255); --accent: oklch(76% .11 255); --ok: oklch(76% .12 155); --warn: oklch(80% .12 75); --bad: oklch(74% .15 27); } }
* { box-sizing: border-box; }
html, body { overflow-x: clip; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.6 var(--font); -webkit-font-smoothing: antialiased; }
.wrap { max-width: 76rem; margin: 0 auto; padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 2rem) 4rem; }
h1, h2, h3 { line-height: 1.3; margin: 0; text-wrap: balance; }
p { margin: 0 0 .75rem; max-width: 68ch; }
a { color: var(--accent); text-underline-offset: .15em; }
a:focus-visible, .scroll:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
code { font-size: .875em; background: color-mix(in oklch, var(--ink) 7%, transparent); padding: .1em .35em; border-radius: 3px; }
.hero { padding-bottom: 1.25rem; border-bottom: 1px solid var(--rule); }
.hero h1 { font-size: 1.25rem; font-weight: 600; letter-spacing: -.01em; max-width: 42ch; }
.hero .verdict { margin: .6rem 0 0; max-width: 72ch; }
.meta { display: flex; flex-wrap: wrap; gap: .2rem 1rem; margin: .75rem 0 0; font-size: .8125rem; color: var(--muted); }
.meta span + span::before { content: "·"; margin-right: 1rem; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10.5rem), 1fr)); gap: 1px; margin: 1.25rem 0 0; background: var(--rule); border: 1px solid var(--rule); border-radius: var(--r); overflow: hidden; }
.kpi { background: var(--surface); padding: .8rem 1rem; }
.kpi span { display: block; font-size: .8125rem; color: var(--muted); line-height: 1.35; }
.kpi b { display: block; margin-top: .25rem; font-size: 1.5rem; line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; }
.kpi em { font-style: normal; font-size: .8125rem; color: var(--muted); }
.sec { margin-top: clamp(1.5rem, 4vw, 2.25rem); }
.sec > h2 { font-size: .9375rem; font-weight: 600; }
.sec > .lead { margin: .25rem 0 .85rem; font-size: .875rem; color: var(--muted); }
.sec > h2 + :not(.lead) { margin-top: .85rem; }
.card { background: var(--surface); border: 1px solid var(--rule); border-radius: var(--r); overflow: hidden; }
.sec > .card + .card, .sec > .card + p { margin-top: .75rem; }
.card > h3 { padding: .6rem 1rem; font-size: .8125rem; font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--rule); }
.card > .pad { padding: .85rem 1rem; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: .8125rem; }
th, td { text-align: left; padding: .5rem .85rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
thead th { background: color-mix(in oklch, var(--ink) 4%, var(--surface)); color: var(--muted); font-weight: 600; white-space: nowrap; }
tbody th { font-weight: 600; white-space: nowrap; width: 1%; }
tbody tr:last-child > * { border-bottom: 0; }
tbody tr:hover > * { background: color-mix(in oklch, var(--accent) 5%, transparent); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.badge { display: inline-block; padding: .05em .5em; border-radius: 4px; font-size: .75rem; font-weight: 600; white-space: nowrap; color: var(--c, var(--muted)); background: color-mix(in oklch, var(--c, var(--muted)) 14%, transparent); }
.badge.ok { --c: var(--ok); } .badge.warn { --c: var(--warn); } .badge.bad { --c: var(--bad); } .badge.info { --c: var(--accent); }
.note { --c: var(--accent); border: 1px solid color-mix(in oklch, var(--c) 38%, var(--rule)); background: color-mix(in oklch, var(--c) 7%, var(--surface)); border-radius: var(--r); padding: .7rem .9rem; margin: .75rem 0; font-size: .9375rem; }
.note.ok { --c: var(--ok); } .note.warn { --c: var(--warn); } .note.bad { --c: var(--bad); }
.note > b { display: block; margin-bottom: .15rem; }
.note p:last-child { margin: 0; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: .75rem; }
.chart { padding-bottom: 1rem; }
.chart > h3 { margin-bottom: .75rem; }
.chart > :not(h3) { margin-left: 1rem; margin-right: 1rem; }
.legend { max-width: none; display: flex; flex-wrap: wrap; gap: .2rem 1rem; margin-top: 0; margin-bottom: .6rem; font-size: .8125rem; color: var(--muted); }
.legend i { display: inline-block; width: .5rem; height: .5rem; margin-right: .4rem; border-radius: 2px; vertical-align: middle; background: var(--c); }
svg { display: block; width: 100%; height: auto; }
.chart > svg { width: calc(100% - 2rem); }
svg text { fill: var(--muted); font: 11px var(--font); }
.src { font-size: .8125rem; color: var(--muted); margin: .5rem 0 0; }
ol.refs { padding-left: 1.25rem; font-size: .8125rem; color: var(--muted); }
@media print { body { background: none; } .hero, .kpis, .card, .note { break-inside: avoid; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
\`\`\`

## 骨架

\`\`\`html
<!-- zuri-artifact -->
<div class="wrap">
  <header class="hero">
    <h1>对象 + 主题（≤ 20 字，不写句子）</h1>
    <p class="verdict">一句结论，≤ 60 字。</p>
    <p class="meta"><span>日期</span><span>数据范围</span></p>
    <div class="kpis">
      <div class="kpi"><span>指标名（口径或来源）</span><b>1,023</b><em>对比基线的一句话</em></div>
    </div>
  </header>
  <section class="sec">
    <h2>章节标题</h2>
    <p class="lead">这一节想让读者记住的一句话。</p>
    <div class="card scroll"><table>…</table></div>
    <div class="note warn"><b>需注意</b><p>事实 + 影响。</p></div>
    <p class="src">来源：<a href="…">页面名</a></p>
  </section>
  <section class="sec">
    <h2>图表</h2>
    <div class="card chart"><h3>图名（单位）</h3><p class="legend"><span style="--c:var(--accent)"><i></i>test</span></p><svg>…</svg></div>
  </section>
</div>
\`\`\`

## 用法

- 骨架开头的 \`<!-- zuri-artifact -->\` 戳记必须保留，宿主靠它确认页面用了本套件。
- 第一屏只有 \`.hero\`：标题写结论，\`.verdict\` 写判断和最大的限制，\`.kpis\` 只放值得对比的数字（通常 2–5 个），没有就不放指标条。
- 每个 \`.sec\` 一个论点：h2 加一句 \`.lead\` 说明读者该带走什么，再放证据。
- 表格一律放进 \`.card.scroll\`；状态词用 \`.badge.ok/.warn/.bad/.info\`，不要只靠文字颜色。
- 同一节不要连放两张以上表：把相近的合并，或把次要的写成 \`.note\`、列表。
- 判断、异常、未核实的事项用 \`.note\`，一页不超过 3 个。
- 图表放 \`.card.chart\`，系列颜色写在 \`style="--c:var(--accent)"\`，不要写色值。
- 不要用内联 style 调间距或字号；需要新样式就在 \`<style>\` 末尾追加 class。`,
    en: `# Component kit (starting point for custom pages)

Start a custom page here instead of from blank CSS. Paste the stylesheet below into \`<style>\` unchanged, change only the colour variables in \`:root\` to set the character, and build the page from these classes. When a specific character is needed, read a theme and override \`:root\` with its variables.

\`\`\`css
:root {
  --paper: oklch(97.5% .005 255); --surface: oklch(99% .003 255); --ink: oklch(23% .02 255); --muted: oklch(47% .02 255); --rule: oklch(90% .008 255);
  --accent: oklch(47% .14 255); --ok: oklch(46% .11 155); --warn: oklch(50% .12 70); --bad: oklch(48% .16 27);
  --r: 6px; --font: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
@media (prefers-color-scheme: dark) { :root { --paper: oklch(18.5% .012 255); --surface: oklch(22.5% .014 255); --ink: oklch(93% .008 255); --muted: oklch(72% .015 255); --rule: oklch(32% .015 255); --accent: oklch(76% .11 255); --ok: oklch(76% .12 155); --warn: oklch(80% .12 75); --bad: oklch(74% .15 27); } }
* { box-sizing: border-box; }
html, body { overflow-x: clip; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.6 var(--font); -webkit-font-smoothing: antialiased; }
.wrap { max-width: 76rem; margin: 0 auto; padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 2rem) 4rem; }
h1, h2, h3 { line-height: 1.3; margin: 0; text-wrap: balance; }
p { margin: 0 0 .75rem; max-width: 68ch; }
a { color: var(--accent); text-underline-offset: .15em; }
a:focus-visible, .scroll:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
code { font-size: .875em; background: color-mix(in oklch, var(--ink) 7%, transparent); padding: .1em .35em; border-radius: 3px; }
.hero { padding-bottom: 1.25rem; border-bottom: 1px solid var(--rule); }
.hero h1 { font-size: 1.25rem; font-weight: 600; letter-spacing: -.01em; max-width: 42ch; }
.hero .verdict { margin: .6rem 0 0; max-width: 72ch; }
.meta { display: flex; flex-wrap: wrap; gap: .2rem 1rem; margin: .75rem 0 0; font-size: .8125rem; color: var(--muted); }
.meta span + span::before { content: "·"; margin-right: 1rem; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10.5rem), 1fr)); gap: 1px; margin: 1.25rem 0 0; background: var(--rule); border: 1px solid var(--rule); border-radius: var(--r); overflow: hidden; }
.kpi { background: var(--surface); padding: .8rem 1rem; }
.kpi span { display: block; font-size: .8125rem; color: var(--muted); line-height: 1.35; }
.kpi b { display: block; margin-top: .25rem; font-size: 1.5rem; line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; }
.kpi em { font-style: normal; font-size: .8125rem; color: var(--muted); }
.sec { margin-top: clamp(1.5rem, 4vw, 2.25rem); }
.sec > h2 { font-size: .9375rem; font-weight: 600; }
.sec > .lead { margin: .25rem 0 .85rem; font-size: .875rem; color: var(--muted); }
.sec > h2 + :not(.lead) { margin-top: .85rem; }
.card { background: var(--surface); border: 1px solid var(--rule); border-radius: var(--r); overflow: hidden; }
.sec > .card + .card, .sec > .card + p { margin-top: .75rem; }
.card > h3 { padding: .6rem 1rem; font-size: .8125rem; font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--rule); }
.card > .pad { padding: .85rem 1rem; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: .8125rem; }
th, td { text-align: left; padding: .5rem .85rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
thead th { background: color-mix(in oklch, var(--ink) 4%, var(--surface)); color: var(--muted); font-weight: 600; white-space: nowrap; }
tbody th { font-weight: 600; white-space: nowrap; width: 1%; }
tbody tr:last-child > * { border-bottom: 0; }
tbody tr:hover > * { background: color-mix(in oklch, var(--accent) 5%, transparent); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.badge { display: inline-block; padding: .05em .5em; border-radius: 4px; font-size: .75rem; font-weight: 600; white-space: nowrap; color: var(--c, var(--muted)); background: color-mix(in oklch, var(--c, var(--muted)) 14%, transparent); }
.badge.ok { --c: var(--ok); } .badge.warn { --c: var(--warn); } .badge.bad { --c: var(--bad); } .badge.info { --c: var(--accent); }
.note { --c: var(--accent); border: 1px solid color-mix(in oklch, var(--c) 38%, var(--rule)); background: color-mix(in oklch, var(--c) 7%, var(--surface)); border-radius: var(--r); padding: .7rem .9rem; margin: .75rem 0; font-size: .9375rem; }
.note.ok { --c: var(--ok); } .note.warn { --c: var(--warn); } .note.bad { --c: var(--bad); }
.note > b { display: block; margin-bottom: .15rem; }
.note p:last-child { margin: 0; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: .75rem; }
.chart { padding-bottom: 1rem; }
.chart > h3 { margin-bottom: .75rem; }
.chart > :not(h3) { margin-left: 1rem; margin-right: 1rem; }
.legend { max-width: none; display: flex; flex-wrap: wrap; gap: .2rem 1rem; margin-top: 0; margin-bottom: .6rem; font-size: .8125rem; color: var(--muted); }
.legend i { display: inline-block; width: .5rem; height: .5rem; margin-right: .4rem; border-radius: 2px; vertical-align: middle; background: var(--c); }
svg { display: block; width: 100%; height: auto; }
.chart > svg { width: calc(100% - 2rem); }
svg text { fill: var(--muted); font: 11px var(--font); }
.src { font-size: .8125rem; color: var(--muted); margin: .5rem 0 0; }
ol.refs { padding-left: 1.25rem; font-size: .8125rem; color: var(--muted); }
@media print { body { background: none; } .hero, .kpis, .card, .note { break-inside: avoid; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
\`\`\`

## Skeleton

\`\`\`html
<!-- zuri-artifact -->
<div class="wrap">
  <header class="hero">
    <h1>Object + topic (≤ 12 words, not a sentence)</h1>
    <p class="verdict">One-sentence conclusion, ≤ 40 words.</p>
    <p class="meta"><span>Date</span><span>Scope</span></p>
    <div class="kpis">
      <div class="kpi"><span>指标名（口径或来源）</span><b>1,023</b><em>对比基线的一句话</em></div>
    </div>
  </header>
  <section class="sec">
    <h2>章节标题</h2>
    <p class="lead">这一节想让读者记住的一句话。</p>
    <div class="card scroll"><table>…</table></div>
    <div class="note warn"><b>需注意</b><p>事实 + 影响。</p></div>
    <p class="src">来源：<a href="…">页面名</a></p>
  </section>
  <section class="sec">
    <h2>图表</h2>
    <div class="card chart"><h3>图名（单位）</h3><p class="legend"><span style="--c:var(--accent)"><i></i>test</span></p><svg>…</svg></div>
  </section>
</div>
\`\`\`

## Usage

- Keep the \`<!-- zuri-artifact -->\` stamp at the top of the skeleton; the host uses it to confirm the page was built with this kit.
- The first screen is only \`.hero\`: the title states the conclusion, \`.verdict\` gives the judgment and the biggest caveat, \`.kpis\` holds only the numbers worth comparing (usually 2–5); with none, leave the strip out.
- Each \`.sec\` makes one point: an h2, a one-line \`.lead\` saying what the reader should take away, then the evidence.
- Put every table in \`.card.scroll\`; mark status with \`.badge.ok/.warn/.bad/.info\`, not text colour alone.
- Do not stack more than two tables in one section: merge related ones, or turn minor ones into a \`.note\` or a list.
- Use \`.note\` for judgments, anomalies, and unverified items, at most three per page.
- Put charts in \`.card.chart\`; set series colour with \`style="--c:var(--accent)"\`, never a colour literal.
- Do not use inline style for spacing or size; append a class to the end of \`<style>\` for anything new.`,
  },
  themeKitExtra: {
    "zh-CN": `# 组件套件扩展（时间线、对比、清单、占比条、大数字、流程漏斗）

在读过 \`components.md\` 之后，内容里有以下情形时再读这里，把样式追加到 \`<style>\` 末尾。

\`\`\`css
.summary { margin: 1rem 0 0; padding-left: 1.2rem; max-width: 62ch; }
.summary li { margin: .3rem 0; padding-left: .2rem; }
.summary li::marker { color: var(--accent); }
.figure { display: flex; flex-wrap: wrap; align-items: baseline; gap: .4rem 1.5rem; margin: 1.25rem 0 0; }
.figure b { font-size: clamp(2rem, 5vw, 3rem); line-height: 1; font-weight: 680; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.figure span { max-width: 32ch; font-size: 1.125rem; line-height: 1.4; }
.trail { list-style: none; margin: 0; padding: .25rem 1.25rem; border-left: 1px solid var(--rule); margin-left: .4rem; }
.trail li { position: relative; padding: .6rem 0 .6rem 1.1rem; }
.trail li::before { content: ""; position: absolute; left: -1.25rem; top: 1.05rem; width: .5rem; height: .5rem; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); transform: translateX(-50%); }
.trail time { display: block; font-size: .875rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.diff { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); }
.diff > div + div { border-left: 1px solid var(--rule); }
.diff h3 { margin: 0; padding: .6rem 1rem; font-size: .8125rem; color: var(--muted); background: color-mix(in oklch, var(--ink) 4%, var(--surface)); border-bottom: 1px solid var(--rule); }
.diff .r { margin: 0; max-width: none; padding: .55rem 1rem; border-bottom: 1px solid var(--rule); font-size: .9375rem; }
.diff .r.add { background: color-mix(in oklch, var(--ok) 11%, transparent); }
.diff .r.add::before { content: "+ "; color: var(--ok); font-weight: 700; }
.diff .r.del { background: color-mix(in oklch, var(--bad) 9%, transparent); text-decoration: line-through; text-decoration-color: color-mix(in oklch, var(--bad) 55%, transparent); }
.checks { list-style: none; margin: 0; padding: 0; }
.checks li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .15rem 1rem; align-items: baseline; padding: .6rem 1rem; border-bottom: 1px solid var(--rule); }
.checks li:last-child { border-bottom: 0; }
.checks small { grid-column: 1 / -1; color: var(--muted); font-size: .8125rem; }
.split { display: flex; height: .5rem; border-radius: 2px; overflow: hidden; background: var(--rule); gap: 2px; }
.split i { flex: var(--w) 1 0; background: var(--c); }
.points { list-style: none; margin: 0; padding: 0; }
.points li { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: .1rem 1rem; align-items: baseline; padding: .65rem 1rem; border-bottom: 1px solid var(--rule); font-size: .875rem; }
.points li:last-child { border-bottom: 0; }
.points .badge { justify-self: start; }
.points b { font-weight: 600; }
.points p { grid-column: 2; margin: 0; max-width: none; color: var(--muted); font-size: .8125rem; }
.kv { display: grid; grid-template-columns: 7rem minmax(0, 1fr); margin: 0; }
.kv dt, .kv dd { margin: 0; padding: .5rem 1rem; border-bottom: 1px solid var(--rule); font-size: .8125rem; }
.kv dt { color: var(--muted); }
.kv > :nth-last-child(-n+2) { border-bottom: 0; }
.flow { list-style: none; margin: 0; padding: 0; }
.flow li { display: grid; grid-template-columns: 9rem minmax(0, 1fr) 4.5rem; gap: .15rem .75rem; align-items: center; padding: .6rem 1rem; border-bottom: 1px solid var(--rule); font-size: .8125rem; }
.flow li:last-child { border-bottom: 0; }
.flow i { display: block; height: 1.25rem; width: calc(var(--v) * 1%); min-width: 2px; border-radius: 3px; background: var(--c, color-mix(in oklch, var(--accent) 55%, var(--paper))); }
.flow b { text-align: right; font-variant-numeric: tabular-nums; }
.flow small { grid-column: 2 / -1; color: var(--muted); }
.flow .same > span { color: var(--muted); }
@page { margin: 16mm; }
\`\`\`

## 用法

\`\`\`html
<header class="hero">
  <h1>对象 + 结论</h1>
  <p class="figure"><b>1,023 : 720</b><span>一句话说明这个数字意味着什么</span></p>
  <ul class="summary"><li>要点一</li><li>要点二</li></ul>
</header>
<ol class="trail"><li><time>2026-10-26 11:33</time>放量比例 0 → 100%（He, Youjun）</li></ol>
<div class="card diff">
  <div><h3>Default</h3><p class="r">售罄沉底</p></div>
  <div><h3>828-test</h3><p class="r add">OOS 商品替换 CDU</p><p class="r">售罄沉底</p></div>
</div>
<ul class="card checks"><li>实验配置 <span class="badge ok">已核对</span><small>来源或缺口</small></li></ul>
<div class="split"><i style="--w:1023;--c:var(--muted)"></i><i style="--w:720;--c:var(--accent)"></i></div>
\`\`\`

- 操作记录、变更历史、里程碑用 \`.trail\`，不要做成表格。\`.trail\` 自带左侧竖线，直接放在章节里，不要再套 \`.card\`。
- 两个版本、两条流程、前后差异用 \`.diff\`：新增行 \`.add\`，删除行 \`.del\`，差异靠 + 号和删除线表达，不只靠颜色。
- 证据范围、检查项、已核对和未核对用 \`.checks\` 加 badge。
- 两三个数量之比（曝光比、流量分配）用 \`.split\`，数字写在旁边；\`--w\` 填真实数值。
- 流程里每一步都有数量变化时（召回 → 精排 → 重排 → 截断）用 \`.flow\` 漏斗：条长 = 数量 ÷ 起点数量 × 100 填入 \`--v\`，条尾写数字，下一行小字写"去掉了什么"。连续多个无变化的步骤合并成一行（加 \`.same\`），不逐个列出；没有日志证实的步骤在小字里写"未确认"。步骤名不超过 8 个字，组件的类名、参数放进文末"数据范围"。这类数据不要做成表格。

\`\`\`html
<ul class="flow">
  <li><span>召回</span><i style="--v:100"></i><b>309</b><small>两路合并</small></li>
  <li class="same"><span>9 个重排节点</span><i style="--v:100"></i><b>309</b><small>不过滤、不改顺序</small></li>
  <li><span>截取前 100</span><i style="--v:32"></i><b>100</b><small>丢弃 209 个</small></li>
</ul>
\`\`\`

- 需确认的事项、已知限制、风险、未验证的推断统一写成一张 \`.points\` 列表：每行结构相同——状态标签（需确认/限制/未验证/已核对，用 \`.badge\`）+ 一句加粗标题 + 一行灰色说明；按严重程度排序，放进一个 \`.card\`。不要给每项单独做卡片、也不要每项换一种版式。
- 数据范围和口径写成 \`.kv\` 两列清单（左灰色名称，右值），放在页面末尾，每项一行，不写成段落。

\`\`\`html
<div class="card"><ul class="points">
  <li><span class="badge warn">需确认</span><b>uid 不一致</b><p>日志 uid=1，请求头 user=8708978。</p></li>
  <li><span class="badge info">限制</span><b>没有打散步骤</b><p>前 4 位是 4 个相近猪排骨商品。</p></li>
</ul></div>
<div class="card"><dl class="kv"><dt>日志</dt><dd>Loki，ec-recommend，now-12h，46 行</dd><dt>商品</dt><dd>309 个，按标题分类</dd></dl></div>
\`\`\`

- 数字本身就是结论时，hero 用 \`.figure\`：大数字加一句话含义，大数字只放一个。
- \`.summary\` 放在 hero 里，不超过 3 条，每条是一个判断。`,
    en: `# Component kit extension (trail, diff, checklist, ratio bar, big figure, pipeline funnel)

After reading \`components.md\`, read this when the content has one of the cases below, and append the styles to the end of \`<style>\`.

\`\`\`css
.summary { margin: 1rem 0 0; padding-left: 1.2rem; max-width: 62ch; }
.summary li { margin: .3rem 0; padding-left: .2rem; }
.summary li::marker { color: var(--accent); }
.figure { display: flex; flex-wrap: wrap; align-items: baseline; gap: .4rem 1.5rem; margin: 1.25rem 0 0; }
.figure b { font-size: clamp(2rem, 5vw, 3rem); line-height: 1; font-weight: 680; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.figure span { max-width: 32ch; font-size: 1.125rem; line-height: 1.4; }
.trail { list-style: none; margin: 0; padding: .25rem 1.25rem; border-left: 1px solid var(--rule); margin-left: .4rem; }
.trail li { position: relative; padding: .6rem 0 .6rem 1.1rem; }
.trail li::before { content: ""; position: absolute; left: -1.25rem; top: 1.05rem; width: .5rem; height: .5rem; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); transform: translateX(-50%); }
.trail time { display: block; font-size: .875rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.diff { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); }
.diff > div + div { border-left: 1px solid var(--rule); }
.diff h3 { margin: 0; padding: .6rem 1rem; font-size: .8125rem; color: var(--muted); background: color-mix(in oklch, var(--ink) 4%, var(--surface)); border-bottom: 1px solid var(--rule); }
.diff .r { margin: 0; max-width: none; padding: .55rem 1rem; border-bottom: 1px solid var(--rule); font-size: .9375rem; }
.diff .r.add { background: color-mix(in oklch, var(--ok) 11%, transparent); }
.diff .r.add::before { content: "+ "; color: var(--ok); font-weight: 700; }
.diff .r.del { background: color-mix(in oklch, var(--bad) 9%, transparent); text-decoration: line-through; text-decoration-color: color-mix(in oklch, var(--bad) 55%, transparent); }
.checks { list-style: none; margin: 0; padding: 0; }
.checks li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .15rem 1rem; align-items: baseline; padding: .6rem 1rem; border-bottom: 1px solid var(--rule); }
.checks li:last-child { border-bottom: 0; }
.checks small { grid-column: 1 / -1; color: var(--muted); font-size: .8125rem; }
.split { display: flex; height: .5rem; border-radius: 2px; overflow: hidden; background: var(--rule); gap: 2px; }
.split i { flex: var(--w) 1 0; background: var(--c); }
.points { list-style: none; margin: 0; padding: 0; }
.points li { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: .1rem 1rem; align-items: baseline; padding: .65rem 1rem; border-bottom: 1px solid var(--rule); font-size: .875rem; }
.points li:last-child { border-bottom: 0; }
.points .badge { justify-self: start; }
.points b { font-weight: 600; }
.points p { grid-column: 2; margin: 0; max-width: none; color: var(--muted); font-size: .8125rem; }
.kv { display: grid; grid-template-columns: 7rem minmax(0, 1fr); margin: 0; }
.kv dt, .kv dd { margin: 0; padding: .5rem 1rem; border-bottom: 1px solid var(--rule); font-size: .8125rem; }
.kv dt { color: var(--muted); }
.kv > :nth-last-child(-n+2) { border-bottom: 0; }
.flow { list-style: none; margin: 0; padding: 0; }
.flow li { display: grid; grid-template-columns: 9rem minmax(0, 1fr) 4.5rem; gap: .15rem .75rem; align-items: center; padding: .6rem 1rem; border-bottom: 1px solid var(--rule); font-size: .8125rem; }
.flow li:last-child { border-bottom: 0; }
.flow i { display: block; height: 1.25rem; width: calc(var(--v) * 1%); min-width: 2px; border-radius: 3px; background: var(--c, color-mix(in oklch, var(--accent) 55%, var(--paper))); }
.flow b { text-align: right; font-variant-numeric: tabular-nums; }
.flow small { grid-column: 2 / -1; color: var(--muted); }
.flow .same > span { color: var(--muted); }
@page { margin: 16mm; }
\`\`\`

## Usage

\`\`\`html
<header class="hero">
  <h1>对象 + 结论</h1>
  <p class="figure"><b>1,023 : 720</b><span>一句话说明这个数字意味着什么</span></p>
  <ul class="summary"><li>要点一</li><li>要点二</li></ul>
</header>
<ol class="trail"><li><time>2026-10-26 11:33</time>放量比例 0 → 100%（He, Youjun）</li></ol>
<div class="card diff">
  <div><h3>Default</h3><p class="r">售罄沉底</p></div>
  <div><h3>828-test</h3><p class="r add">OOS 商品替换 CDU</p><p class="r">售罄沉底</p></div>
</div>
<ul class="card checks"><li>实验配置 <span class="badge ok">已核对</span><small>来源或缺口</small></li></ul>
<div class="split"><i style="--w:1023;--c:var(--muted)"></i><i style="--w:720;--c:var(--accent)"></i></div>
\`\`\`

- Use \`.trail\` for operation logs, change history, and milestones, not a table. \`.trail\` draws its own left spine, so place it directly in the section and do not wrap it in \`.card\`.
- Use \`.diff\` for two versions, two flows, or before and after: \`.add\` for added rows, \`.del\` for removed rows; the difference is carried by the plus sign and strikethrough, not colour alone.
- Use \`.checks\` with a badge for evidence scope and checked or unchecked items.
- Use \`.split\` for the ratio of two or three quantities (impressions, traffic split) with the numbers written beside it; fill \`--w\` with the real values.
- When every step of a flow changes a count (recall → ranking → rerank → truncation), use a \`.flow\` funnel: set \`--v\` to count ÷ starting count × 100, put the number at the bar end and what was removed in the small line below. Merge consecutive no-change steps into one row (add \`.same\`) instead of listing each; write "unconfirmed" in the small line for steps the logs do not show. Step names are at most 4 words; class names and parameters go in the closing "Data scope". Do not render such data as a table.

\`\`\`html
<ul class="flow">
  <li><span>Recall</span><i style="--v:100"></i><b>309</b><small>two sources merged</small></li>
  <li class="same"><span>9 rerank steps</span><i style="--v:100"></i><b>309</b><small>no filtering, no reorder</small></li>
  <li><span>Keep top 100</span><i style="--v:32"></i><b>100</b><small>209 dropped</small></li>
</ul>
\`\`\`

- Write open items, known limits, risks, and unverified inferences as one \`.points\` list: every row has the same shape — a status badge (Open / Limit / Unverified / Verified, using \`.badge\`), a one-line bold title, and one grey line of detail — ordered by severity inside a single \`.card\`. Do not give each item its own card or switch layout per item.
- Write data scope and definitions as a two-column \`.kv\` list (grey name, value), one row each at the end of the page, not as paragraphs.

\`\`\`html
<div class="card"><ul class="points">
  <li><span class="badge warn">Open</span><b>uid mismatch</b><p>Log uid=1, request header user=8708978.</p></li>
  <li><span class="badge info">Limit</span><b>No diversification step</b><p>The first 4 slots are four similar pork-rib items.</p></li>
</ul></div>
<div class="card"><dl class="kv"><dt>Logs</dt><dd>Loki, ec-recommend, now-12h, 46 rows</dd><dt>Items</dt><dd>309, classified by title</dd></dl></div>
\`\`\`

- When the number is the conclusion, the hero takes \`.figure\`: one big number plus one line of meaning; only one big number per page.
- Put \`.summary\` in the hero, at most three items, each one a judgment.`,
  },
  themeInstrument: {
    "zh-CN": `# 主题：仪器

石墨底，三档明度：底、面板、最深处。适合实验结果、审计、监控、运营记录这类"有人记录、有仪器测量"的内容。

\`\`\`css
:root {
  color-scheme: dark;
  --paper: oklch(17% .008 250); --surface: oklch(21% .009 250); --ink: oklch(94% .006 250); --muted: oklch(72% .01 250); --rule: oklch(31% .01 250);
  --r: 4px; --accent: oklch(80% .14 80); --cool: oklch(77% .11 245);
  --ok: oklch(76% .14 150); --warn: oklch(80% .13 80); --bad: oklch(72% .16 25);
  --font: "Host Grotesk", system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace;
}
@media (prefers-color-scheme: light) { :root { color-scheme: light; --paper: oklch(97.5% .005 250); --surface: oklch(99% .003 250); --ink: oklch(21% .012 250); --muted: oklch(46% .014 250); --rule: oklch(89% .008 250); --accent: oklch(52% .13 70); --cool: oklch(50% .13 250); --ok: oklch(46% .11 155); --warn: oklch(50% .12 70); --bad: oklch(48% .16 27); } }
.num, td.num, time { font-family: var(--mono); font-weight: 500; }
\`\`\`

## 版面

- 覆盖 \`components.md\` 的 \`:root\`（含其深色媒体查询），再追加上面的 \`.kpi b\` 等规则；组件 class 不变。
- 语义分工：琥珀（\`--accent\`）代表人做的事（操作人、决定、备注），冷蓝（\`--cool\`）代表系统或仪器给出的读数（面板数据、日志）。每页只用这两种含义。
- 面板用 1px 细线，一张面板里的多行用同一张面板的分隔线；不加阴影、发光和渐变。
- 测得的数值、编号、时间用等宽字体，且数字等宽；标题和正文用无衬线。
- 最深的一档只给代码、日志和被改动的行。`,
    en: `# Theme: Instrument

A graphite ground in three lightness steps: the ground, a panel, and the deepest step. Fits experiment results, audits, monitoring, and operations records, where a person writes things down and an instrument measures.

\`\`\`css
:root {
  color-scheme: dark;
  --paper: oklch(17% .008 250); --surface: oklch(21% .009 250); --ink: oklch(94% .006 250); --muted: oklch(72% .01 250); --rule: oklch(31% .01 250);
  --r: 4px; --accent: oklch(80% .14 80); --cool: oklch(77% .11 245);
  --ok: oklch(76% .14 150); --warn: oklch(80% .13 80); --bad: oklch(72% .16 25);
  --font: "Host Grotesk", system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace;
}
@media (prefers-color-scheme: light) { :root { color-scheme: light; --paper: oklch(97.5% .005 250); --surface: oklch(99% .003 250); --ink: oklch(21% .012 250); --muted: oklch(46% .014 250); --rule: oklch(89% .008 250); --accent: oklch(52% .13 70); --cool: oklch(50% .13 250); --ok: oklch(46% .11 155); --warn: oklch(50% .12 70); --bad: oklch(48% .16 27); } }
.num, td.num, time { font-family: var(--mono); font-weight: 500; }
\`\`\`

## Layout

- Replace the \`:root\` in \`components.md\` (including its dark media query) and append the rules above such as \`.kpi b\`; the component classes stay the same.
- Meaning is split: amber (\`--accent\`) is what a person did (operator, decision, remark), cool blue (\`--cool\`) is what the system or an instrument reported (panel data, logs). Use only these two meanings on a page.
- Panels use 1px hairlines; rows in one panel share that panel's dividers; no shadows, glow, or gradients.
- Measured values, ids, and times use the monospace face with tabular figures; headings and prose use the sans face.
- The deepest step is only for code, logs, and changed rows.`,
  },
  themeCharts: {
    "zh-CN": `# 图表套件（数据对比一律先画图）

读过 \`components.md\` 后，页面里有任何数字对比时读这里，把样式追加到 \`<style>\` 末尾。

## 先选图形，再考虑表格

| 数据的形状 | 用什么 |
| --- | --- |
| 几个分组 × 每组 2–4 个系列（如前 10/20/30 位 × 两种方案） | **分组柱状图 \`.cc\`**：竖柱从零起，柱顶标数值，同组并排；此类数据的默认形状，不要拆成一排排进度条 |
| 单个指标在几个分组间的比较（3–8 项） | 每个指标一块 \`.metric\`，\`.bar\` 横条，条尾标精确数值 |
| 一批条目在两个状态下的名次/数值（前后对照） | 哑铃图 \`.dumb\`：两点一线，点旁写变化 |
| 相对基线的变化（提升、下降） | \`.dv\` 双向条，零线居中，正绿负红，数值带 + 或 − |
| 时间序列（5 个点以上） | 内联 SVG 折线，一个系列用强调色，其余用 --muted |
| 占总量的比例（流量分配、构成） | \`.split\` 占比条，数字写在旁边 |
| 流程各步数量变化（漏斗） | \`.flow\`（见 \`components-extra.md\`），不用表格 |
| 日志、里程碑 | \`.trail\` |
| 配置项、属性对照（键值对） | 表格 |
| 8 行以上、需要逐格查精确值的数据 | 表格，放在对应图表之后，作为"精确数值" |

小样本规则：事件数（点击、订单、转化）个位数，或曝光不足以支撑比率时，不画比率条、折线和变化条，只列原始数字并写明"样本不足"；图会把噪声放大成结论。

硬性规则：数字对比先画图，表格只放配置属性和逐格查值的明细；一页的表格不超过 2 张（选型的对比矩阵是例外，见 \`audit-and-compare.md\`，单独算一张）；不要把同一组数字既做成表格又做成图。

## 样式

\`\`\`css
:root { --s1: color-mix(in oklch, var(--accent) 38%, var(--paper)); --s2: color-mix(in oklch, var(--accent) 66%, var(--paper)); --s3: var(--accent); --s4: color-mix(in oklch, var(--accent) 72%, var(--ink)); }
.chart > h3 { padding: 1rem 1rem 0; border: 0; color: var(--ink); font-size: .9375rem; }
.chart > .desc { margin: .15rem 1rem .85rem; font-size: .8125rem; color: var(--muted); }
.chart > .foot { margin: .85rem 1rem 0; font-size: .8125rem; color: var(--muted); }
.chart > .foot b { display: block; color: var(--ink); font-weight: 600; }
.metric { padding: .85rem 1rem; border-bottom: 1px solid var(--rule); }
.metric:last-child { border-bottom: 0; }
.metric h4 { margin: 0 0 .4rem; font-size: .8125rem; font-weight: 600; color: var(--muted); }
.bar { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr) auto; gap: .75rem; align-items: center; margin: .3rem 0; font-size: .8125rem; }
.bar .track { height: .625rem; border-radius: 4px; background: color-mix(in oklch, var(--ink) 6%, transparent); overflow: hidden; }
.bar .fill { display: block; height: 100%; width: calc(var(--v) * 1%); border-radius: 4px; background: var(--c, var(--s1)); }
.bar b { min-width: 5.5ch; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.delta { font-weight: 600; font-variant-numeric: tabular-nums; }
.delta.up { color: var(--ok); } .delta.down { color: var(--bad); }
.dv .track { position: relative; overflow: visible; }
.dv .track::after { content: ""; position: absolute; left: 50%; top: -.25rem; bottom: -.25rem; width: 1px; background: var(--muted); }
.dv .fill { position: absolute; top: 0; bottom: 0; width: calc(var(--v) * .5%); }
.dv .pos { left: 50%; background: var(--ok); } .dv .neg { right: 50%; background: var(--bad); }
.line { fill: none; stroke: var(--c, var(--s3)); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.area { stroke: none; fill: var(--c, var(--s3)); fill-opacity: .14; }
.grid { stroke: var(--rule); stroke-width: 1; stroke-dasharray: 3 3; }
.cc { display: flex; gap: 1.5rem; padding: 1.5rem 1rem 0; }
.cc .g { flex: 1; min-width: 0; }
.cc .pl { height: 10rem; display: flex; align-items: flex-end; gap: 4px; border-bottom: 1px solid var(--rule); background: repeating-linear-gradient(to top, transparent 0 calc(25% - 1px), var(--rule) calc(25% - 1px) 25%); }
.cc .col { font-style: normal; position: relative; flex: 1; max-width: 3.5rem; height: calc(var(--v) * 1%); background: var(--c, var(--s1)); border-radius: 4px 4px 0 0; }
.cc .col b { position: absolute; bottom: 100%; left: -1rem; right: -1rem; padding-bottom: .15rem; text-align: center; font-size: .8125rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.cc .g > span { display: block; margin-top: .4rem; text-align: center; font-size: .8125rem; color: var(--muted); }
.dumb { display: grid; grid-template-columns: 9rem minmax(0, 1fr) auto; gap: .75rem; align-items: center; margin: .45rem 0; font-size: .8125rem; }
.dumb .track { position: relative; height: 1.25rem; border-bottom: 1px solid var(--rule); }
.dumb .link { position: absolute; top: 50%; height: 2px; background: var(--muted); left: calc(min(var(--a), var(--b)) * 1%); width: calc((max(var(--a), var(--b)) - min(var(--a), var(--b))) * 1%); }
.dumb .pt { position: absolute; top: 50%; width: .625rem; height: .625rem; margin: -.3125rem 0 0 -.3125rem; border-radius: 50%; background: var(--s1); }
.dumb .pt.to { background: var(--s3); }
.dumb .pt.a { left: calc(var(--a) * 1%); } .dumb .pt.b { left: calc(var(--b) * 1%); }
\`\`\`

## 用法

\`\`\`html
<div class="card chart"><h3>前 N 位肉类占比</h3><p class="desc">两种顺序对比</p>
  <p class="legend"><span style="--c:var(--s1)"><i></i>feed 原序</span><span style="--c:var(--s3)"><i></i>score 降序</span></p>
  <div class="cc">
    <div class="g"><div class="pl"><i class="col" style="--v:50"><b>50%</b></i><i class="col" style="--v:80;--c:var(--s3)"><b>80%</b></i></div><span>前 10 位</span></div>
    <div class="g"><div class="pl"><i class="col" style="--v:50"><b>50%</b></i><i class="col" style="--v:90;--c:var(--s3)"><b>90%</b></i></div><span>前 20 位</span></div>
  </div>
</div>
<div class="card chart"><h3>名次变化</h3><p class="desc">浅点 = 原序，强调色点 = 最终；--a、--b 为名次 ÷ 总数 × 100</p>
  <div class="dumb"><span>猪排骨 寸排</span><span class="track"><i class="link" style="--a:3;--b:1"></i><i class="pt a" style="--a:3"></i><i class="pt b to" style="--b:1"></i></span><b>8 → 2</b></div>
</div>
<div class="card chart"><h3>每日曝光</h3><p class="desc">10/25–10/31</p>
  <svg viewBox="0 0 640 220" role="img" aria-label="每日曝光折线图">
    <line class="grid" x1="40" x2="624" y1="30" y2="30"/><line class="grid" x1="40" x2="624" y1="120" y2="120"/><line class="grid" x1="40" x2="624" y1="200" y2="200"/>
    <polygon class="area" points="40,150 332,100 624,120 624,200 40,200"/>
    <polyline class="line" points="40,150 332,100 624,120"/>
    <text x="40" y="216">10/25</text>
  </svg>
</div>
\`\`\`

- 图表卡片的结构：\`h3\` 标题 + \`.desc\` 一行灰色说明（写明日期范围或口径）+ 图 + \`.foot\`（一句加粗的结论，一行灰色注释）。没有结论可写时省略 \`.foot\`。
- 配色：同一色相的明度梯度 \`--s1\`（最浅）到 \`--s4\`（最深），不用多色；基线用最浅或 \`--muted\`，被比较的组用 \`--s3\`。
- 图的笔法：只画水平虚线网格（不超过 4 条），不画坐标轴线和刻度线，标签灰色、缩写（10/25、1月）；折线 2px、不画数据点；面积图只用 14% 的纯色填充，不用渐变；柱 4px 圆角。
- 静态页面没有悬停提示，所以每个数值都要直接标在条尾或线端。
- \`--v\` 是该条占本组最大值的百分比，条从零开始，由你按真实数值计算：\`--v = 值 ÷ 本组最大值 × 100\`。\`.dv\` 的 \`--v\` 是 |变化| ÷ 本页最大 |变化| × 100。
- 折线坐标：x = 48 + 序号 × (576 ÷ (点数 − 1))，y = 200 − 值 ÷ 轴最大值 × 180；轴最大值取整，网格线不超过 5 条。点数不足 5 个就写成数字，不画线。
- 图上的每个数字都来自已读取的数据；事后推算的值（比如汇总、比例）标注"自行汇总"。`,
    en: `# Chart kit (draw a chart before any numeric comparison)

After reading \`components.md\`, read this whenever the page compares numbers, and append the styles to the end of \`<style>\`.

## Pick the form first, then consider a table

| Shape of the data | Use |
| --- | --- |
| A few groups × 2–4 series each (e.g. top 10/20/30 × two schemes) | **Grouped columns \`.cc\`**: vertical bars from zero, value on top, series side by side. The default form for such data; do not split it into rows of progress bars |
| One metric across 3–8 items | One \`.metric\` block per metric, one \`.bar\` per item, the exact value at the end of each bar |
| Items before vs after (rank or value shift) | Dumbbell \`.dumb\`: two dots and a link, the change beside it |
| Change against a baseline (lift, drop) | \`.dv\` diverging bars with a centred zero line, positive green and negative red, the value carrying a + or − |
| Time series (five points or more) | Inline SVG line, one series in the accent and the rest in --muted |
| Share of a total (traffic split, composition) | \`.split\` with the numbers written beside it |
| Counts through a pipeline (funnel) | \`.flow\` (see \`components-extra.md\`), not a table |
| Log, milestones | \`.trail\` |
| Configuration, attribute lists (key-value) | A table |
| Eight or more rows where readers look up exact cells | A table, placed after the matching chart as "exact values" |

Small-sample rule: when events (clicks, orders, conversions) are in single digits, or impressions are too few to support a rate, draw no rate bars, lines, or change bars; list the raw numbers and write "insufficient sample". A chart turns noise into a conclusion.

Hard rules: draw numeric comparisons first; tables are for configuration attributes and look-up detail; no more than two tables per page (a selection comparison matrix is the exception, see \`audit-and-compare.md\`, and counts on its own); never show the same numbers as both a table and a chart.

## Styles

\`\`\`css
:root { --s1: color-mix(in oklch, var(--accent) 38%, var(--paper)); --s2: color-mix(in oklch, var(--accent) 66%, var(--paper)); --s3: var(--accent); --s4: color-mix(in oklch, var(--accent) 72%, var(--ink)); }
.chart > h3 { padding: 1rem 1rem 0; border: 0; color: var(--ink); font-size: .9375rem; }
.chart > .desc { margin: .15rem 1rem .85rem; font-size: .8125rem; color: var(--muted); }
.chart > .foot { margin: .85rem 1rem 0; font-size: .8125rem; color: var(--muted); }
.chart > .foot b { display: block; color: var(--ink); font-weight: 600; }
.metric { padding: .85rem 1rem; border-bottom: 1px solid var(--rule); }
.metric:last-child { border-bottom: 0; }
.metric h4 { margin: 0 0 .4rem; font-size: .8125rem; font-weight: 600; color: var(--muted); }
.bar { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr) auto; gap: .75rem; align-items: center; margin: .3rem 0; font-size: .8125rem; }
.bar .track { height: .625rem; border-radius: 4px; background: color-mix(in oklch, var(--ink) 6%, transparent); overflow: hidden; }
.bar .fill { display: block; height: 100%; width: calc(var(--v) * 1%); border-radius: 4px; background: var(--c, var(--s1)); }
.bar b { min-width: 5.5ch; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.delta { font-weight: 600; font-variant-numeric: tabular-nums; }
.delta.up { color: var(--ok); } .delta.down { color: var(--bad); }
.dv .track { position: relative; overflow: visible; }
.dv .track::after { content: ""; position: absolute; left: 50%; top: -.25rem; bottom: -.25rem; width: 1px; background: var(--muted); }
.dv .fill { position: absolute; top: 0; bottom: 0; width: calc(var(--v) * .5%); }
.dv .pos { left: 50%; background: var(--ok); } .dv .neg { right: 50%; background: var(--bad); }
.line { fill: none; stroke: var(--c, var(--s3)); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.area { stroke: none; fill: var(--c, var(--s3)); fill-opacity: .14; }
.grid { stroke: var(--rule); stroke-width: 1; stroke-dasharray: 3 3; }
.cc { display: flex; gap: 1.5rem; padding: 1.5rem 1rem 0; }
.cc .g { flex: 1; min-width: 0; }
.cc .pl { height: 10rem; display: flex; align-items: flex-end; gap: 4px; border-bottom: 1px solid var(--rule); background: repeating-linear-gradient(to top, transparent 0 calc(25% - 1px), var(--rule) calc(25% - 1px) 25%); }
.cc .col { font-style: normal; position: relative; flex: 1; max-width: 3.5rem; height: calc(var(--v) * 1%); background: var(--c, var(--s1)); border-radius: 4px 4px 0 0; }
.cc .col b { position: absolute; bottom: 100%; left: -1rem; right: -1rem; padding-bottom: .15rem; text-align: center; font-size: .8125rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.cc .g > span { display: block; margin-top: .4rem; text-align: center; font-size: .8125rem; color: var(--muted); }
.dumb { display: grid; grid-template-columns: 9rem minmax(0, 1fr) auto; gap: .75rem; align-items: center; margin: .45rem 0; font-size: .8125rem; }
.dumb .track { position: relative; height: 1.25rem; border-bottom: 1px solid var(--rule); }
.dumb .link { position: absolute; top: 50%; height: 2px; background: var(--muted); left: calc(min(var(--a), var(--b)) * 1%); width: calc((max(var(--a), var(--b)) - min(var(--a), var(--b))) * 1%); }
.dumb .pt { position: absolute; top: 50%; width: .625rem; height: .625rem; margin: -.3125rem 0 0 -.3125rem; border-radius: 50%; background: var(--s1); }
.dumb .pt.to { background: var(--s3); }
.dumb .pt.a { left: calc(var(--a) * 1%); } .dumb .pt.b { left: calc(var(--b) * 1%); }
\`\`\`

## Usage

\`\`\`html
<div class="card chart"><h3>Meat share of the top N</h3><p class="desc">Two orderings</p>
  <p class="legend"><span style="--c:var(--s1)"><i></i>feed order</span><span style="--c:var(--s3)"><i></i>score order</span></p>
  <div class="cc">
    <div class="g"><div class="pl"><i class="col" style="--v:50"><b>50%</b></i><i class="col" style="--v:80;--c:var(--s3)"><b>80%</b></i></div><span>Top 10</span></div>
    <div class="g"><div class="pl"><i class="col" style="--v:50"><b>50%</b></i><i class="col" style="--v:90;--c:var(--s3)"><b>90%</b></i></div><span>Top 20</span></div>
  </div>
</div>
<div class="card chart"><h3>Rank change</h3><p class="desc">Light dot = original, accent dot = final; --a and --b are rank ÷ total × 100</p>
  <div class="dumb"><span>Pork ribs</span><span class="track"><i class="link" style="--a:3;--b:1"></i><i class="pt a" style="--a:3"></i><i class="pt b to" style="--b:1"></i></span><b>8 → 2</b></div>
</div>
<div class="card chart"><h3>每日曝光</h3><p class="desc">10/25–10/31</p>
  <svg viewBox="0 0 640 220" role="img" aria-label="每日曝光折线图">
    <line class="grid" x1="40" x2="624" y1="30" y2="30"/><line class="grid" x1="40" x2="624" y1="120" y2="120"/><line class="grid" x1="40" x2="624" y1="200" y2="200"/>
    <polygon class="area" points="40,150 332,100 624,120 624,200 40,200"/>
    <polyline class="line" points="40,150 332,100 624,120"/>
    <text x="40" y="216">10/25</text>
  </svg>
</div>
\`\`\`

- Chart card structure: an \`h3\` title, a one-line grey \`.desc\` (date range or definition), the chart, then \`.foot\` (one bold conclusion and one grey note). Omit \`.foot\` when there is no conclusion to state.
- Colour: one hue in a lightness ramp, \`--s1\` (lightest) to \`--s4\` (deepest), never many hues; the baseline takes the lightest step or \`--muted\`, the compared group takes \`--s3\`.
- Drawing: horizontal dashed gridlines only (at most four), no axis lines or tick marks, grey abbreviated labels (10/25, Jan); 2px lines with no data dots; area charts use a flat 14% fill, never a gradient; bars have 4px radius.
- A static page has no hover tooltip, so label every value at the end of its bar or line.
- \`--v\` is the bar's percentage of the group's maximum; bars start at zero and you compute them from real values: \`--v = value ÷ group max × 100\`. For \`.dv\`, \`--v\` is |change| ÷ the page's largest |change| × 100.
- Line coordinates: x = 48 + index × (576 ÷ (points − 1)), y = 200 − value ÷ axis max × 180; round the axis max and use at most five gridlines. With fewer than five points, write the numbers and draw no line.
- Every number in a chart comes from data you read; mark derived values (sums, ratios) as "self-computed".`,
  },
  themeAudit: {
    "zh-CN": `# 审计与对比组件

读过 \`components.md\` 后，做审计或对比时读这里，把样式追加到 \`<style>\` 末尾。

\`\`\`css
.score { display: flex; align-items: baseline; gap: .6rem; margin: 1rem 0 0; }
.score b { font-size: 2rem; line-height: 1; font-weight: 650; font-variant-numeric: tabular-nums; }
.score span { color: var(--muted); font-size: .875rem; }
.issues, .actions { list-style: none; margin: 0; padding: 0; }
.issue { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: .2rem 1rem; padding: .75rem 1rem; border-bottom: 1px solid var(--rule); }
.issue:last-child, .action:last-child { border-bottom: 0; }
.issue h4 { margin: 0; font-size: .9375rem; font-weight: 600; }
.issue p { margin: .2rem 0 0; font-size: .875rem; max-width: 70ch; }
.issue .impact { color: var(--muted); }
.action { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr) minmax(0, 14rem); gap: .2rem 1rem; padding: .7rem 1rem; border-bottom: 1px solid var(--rule); font-size: .875rem; }
.action small { display: block; color: var(--muted); font-size: .8125rem; }
.issue .badge, .action .badge { align-self: start; justify-self: start; }
.matrix table { min-width: 36rem; }
.matrix th:first-child, .matrix td:first-child { position: sticky; left: 0; background: var(--surface); font-weight: 600; text-align: left; }
.matrix thead th, .matrix td { text-align: center; }
.matrix thead th:first-child { text-align: left; }
.matrix tbody tr:hover > :first-child { background: var(--surface); }
.matrix .rec { background: color-mix(in oklch, var(--accent) 6%, var(--surface)); }
.matrix thead .rec { color: var(--ink); box-shadow: inset 0 -2px 0 var(--accent); }
.mark::before { margin-right: .3em; font-weight: 700; }
.mark.y { color: var(--ok); } .mark.y::before { content: "✓"; }
.mark.n { color: var(--muted); } .mark.n::before { content: "✕"; }
.mark.na { color: var(--muted); } .mark.na::before { content: "–"; }
@media (max-width: 40rem) { .issue, .action { grid-template-columns: 1fr; } }
\`\`\`

## 用法

\`\`\`html
<header class="hero">
  <h1>对象 + 审计结论</h1>
  <p class="verdict">总体判断和最大的风险。</p>
  <p class="score"><b>72</b><span>/ 100 总评 · 良</span></p>
  <div class="kpis">
    <div class="kpi"><span>严重</span><b>2</b></div>
    <div class="kpi"><span>警告</span><b>7</b></div>
    <div class="kpi"><span>建议</span><b>11</b></div>
  </div>
</header>
<section class="sec"><h2>严重问题</h2><p class="lead">必须先处理的。</p>
  <ul class="card issues"><li class="issue"><span class="badge bad">严重</span>
    <div><h4>问题标题</h4><p>依据：看到了什么，在哪里。</p><p class="impact">影响：不处理会怎样。</p><p class="src">来源：<a href="…">页面</a></p></div></li></ul>
</section>
<section class="sec"><h2>行动清单</h2>
  <ul class="card actions"><li class="action"><span class="badge warn">P1</span><div>做什么<small>预期收益</small></div><small>验证：怎么确认已解决</small></li></ul>
</section>
<section class="sec"><h2>方案对比</h2>
  <div class="card scroll matrix"><table>
    <thead><tr><th>维度</th><th>方案 A</th><th class="rec">方案 B（推荐）</th></tr></thead>
    <tbody><tr><td>价格</td><td>$20/月</td><td class="rec">$15/月</td></tr>
      <tr><td>导出</td><td><span class="mark n">不支持</span></td><td class="rec"><span class="mark y">支持</span></td></tr></tbody>
  </table></div>
</section>
\`\`\`

- 审计：hero 里放 \`.score\`（总评分数或等级）和严重程度计数条；问题按严重、警告、建议分节，每节一张 \`.issues\` 面板，每条写标题、依据、影响、来源；最后是 \`.actions\`，每行写优先级、做什么和预期收益、怎么验证。
- 严重程度用 badge（bad、warn、info）并写出文字；问题多于 15 条时，建议级的合并成一张简表。
- 对比矩阵：\`.matrix\` 包住表格，第一列是维度名并固定，推荐项的表头和整列加 \`.rec\`（表头下划线加淡底，不整列填满色）。有无用 \`.mark.y/.n/.na\` 加文字，数值直接写；数据来源在表后一行 \`.src\`。
- 对比矩阵是该用表格的场景，一页放一张；数值型对比另外用 \`charts.md\` 画图，不要重复同一组数字。
- 推荐放在矩阵之前，用一个 \`.note\`（不超过 80 字：推荐谁、适合谁、最大的取舍）；矩阵之后用 \`.cols\` 列出每个选项最不适合的场景。`,
    en: `# Audit and comparison components

After reading \`components.md\`, read this for an audit or a comparison, and append the styles to the end of \`<style>\`.

\`\`\`css
.score { display: flex; align-items: baseline; gap: .6rem; margin: 1rem 0 0; }
.score b { font-size: 2rem; line-height: 1; font-weight: 650; font-variant-numeric: tabular-nums; }
.score span { color: var(--muted); font-size: .875rem; }
.issues, .actions { list-style: none; margin: 0; padding: 0; }
.issue { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: .2rem 1rem; padding: .75rem 1rem; border-bottom: 1px solid var(--rule); }
.issue:last-child, .action:last-child { border-bottom: 0; }
.issue h4 { margin: 0; font-size: .9375rem; font-weight: 600; }
.issue p { margin: .2rem 0 0; font-size: .875rem; max-width: 70ch; }
.issue .impact { color: var(--muted); }
.action { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr) minmax(0, 14rem); gap: .2rem 1rem; padding: .7rem 1rem; border-bottom: 1px solid var(--rule); font-size: .875rem; }
.action small { display: block; color: var(--muted); font-size: .8125rem; }
.issue .badge, .action .badge { align-self: start; justify-self: start; }
.matrix table { min-width: 36rem; }
.matrix th:first-child, .matrix td:first-child { position: sticky; left: 0; background: var(--surface); font-weight: 600; text-align: left; }
.matrix thead th, .matrix td { text-align: center; }
.matrix thead th:first-child { text-align: left; }
.matrix tbody tr:hover > :first-child { background: var(--surface); }
.matrix .rec { background: color-mix(in oklch, var(--accent) 6%, var(--surface)); }
.matrix thead .rec { color: var(--ink); box-shadow: inset 0 -2px 0 var(--accent); }
.mark::before { margin-right: .3em; font-weight: 700; }
.mark.y { color: var(--ok); } .mark.y::before { content: "✓"; }
.mark.n { color: var(--muted); } .mark.n::before { content: "✕"; }
.mark.na { color: var(--muted); } .mark.na::before { content: "–"; }
@media (max-width: 40rem) { .issue, .action { grid-template-columns: 1fr; } }
\`\`\`

## Usage

\`\`\`html
<header class="hero">
  <h1>Subject + audit conclusion</h1>
  <p class="verdict">Overall judgment and the biggest risk.</p>
  <p class="score"><b>72</b><span>/ 100 overall · good</span></p>
  <div class="kpis">
    <div class="kpi"><span>Critical</span><b>2</b></div>
    <div class="kpi"><span>Warning</span><b>7</b></div>
    <div class="kpi"><span>Advice</span><b>11</b></div>
  </div>
</header>
<section class="sec"><h2>Critical issues</h2><p class="lead">Fix these first.</p>
  <ul class="card issues"><li class="issue"><span class="badge bad">Critical</span>
    <div><h4>Issue title</h4><p>Evidence: what was seen, and where.</p><p class="impact">Impact: what happens if it stays.</p><p class="src">Source: <a href="…">Page</a></p></div></li></ul>
</section>
<section class="sec"><h2>Action list</h2>
  <ul class="card actions"><li class="action"><span class="badge warn">P1</span><div>What to do<small>Expected benefit</small></div><small>Verify: how to confirm it is fixed</small></li></ul>
</section>
<section class="sec"><h2>Comparison</h2>
  <div class="card scroll matrix"><table>
    <thead><tr><th>Dimension</th><th>Option A</th><th class="rec">Option B (recommended)</th></tr></thead>
    <tbody><tr><td>Price</td><td>$20/mo</td><td class="rec">$15/mo</td></tr>
      <tr><td>Export</td><td><span class="mark n">Not supported</span></td><td class="rec"><span class="mark y">Supported</span></td></tr></tbody>
  </table></div>
</section>
\`\`\`

- Audit: the hero carries \`.score\` (overall score or grade) and a severity count strip; group issues into critical, warning, and advice sections, each one \`.issues\` panel, each entry with a title, evidence, impact, and source; finish with \`.actions\`, each row giving the priority, what to do and the expected benefit, and how to verify.
- Severity uses a badge (bad, warn, info) that also carries the word; when there are more than 15 issues, merge the advice-level ones into one short table.
- Comparison matrix: wrap the table in \`.matrix\`, make the first column the dimension names and keep it fixed, and mark the recommended option's header and whole column with \`.rec\` (an underlined header and a faint tint, never a full-colour column). Show presence with \`.mark.y/.n/.na\` plus the word, and write numbers directly; put the data source on one \`.src\` line after the table.
- A comparison matrix is a case where a table is the right form; use one per page. Draw numeric comparisons with \`charts.md\` separately and do not repeat the same numbers.
- Put the recommendation before the matrix in one \`.note\` (at most 80 words: who to pick, who it suits, the biggest trade-off); after the matrix, list each option's worst-fit scenario with \`.cols\`.`,
  },
  themeConsole: {
    "zh-CN": `# 主题：控制台图表

成熟 SaaS 控制台风格的图表卡片：大圆角、宽松内边距、单一蓝色色阶、平滑面积图。这是 \`components.md\`、\`charts.md\` 之上的一层覆盖。

\`\`\`css
/* 追加在 components.md 与 charts.md 的样式之后，覆盖变量 */
:root {
  --paper: oklch(98.5% .002 250); --surface: oklch(99.6% .001 250); --ink: oklch(14.5% .004 250); --muted: oklch(55.6% .01 250); --rule: oklch(92.2% .004 250);
  --accent: oklch(54.6% .245 262.9); --s1: oklch(80.9% .105 251.8); --s2: oklch(62.3% .214 259.8); --s3: oklch(54.6% .245 262.9); --s4: oklch(48.8% .243 264.4);
  --r: 12px;
}
@media (prefers-color-scheme: dark) { :root { --paper: oklch(14.5% .004 250); --surface: oklch(20.5% .004 250); --ink: oklch(98.5% .002 250); --muted: oklch(70.8% .01 250); --rule: oklch(30% .004 250); --accent: oklch(68% .19 260); } }
.charts { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr)); }
.charts .wide { grid-column: 1 / -1; }
.charts > .card { margin: 0; }
.chart.sc { padding-bottom: 1.5rem; }
.sc > h3 { padding: 1.5rem 1.5rem 0; font-size: 1rem; line-height: 1; }
.sc > .desc { margin: .5rem 1.5rem 1.5rem; font-size: .875rem; }
.sc > :not(h3):not(.desc) { margin-left: 1.5rem; margin-right: 1.5rem; }
.sc > p { max-width: none; }
.sc > svg { width: calc(100% - 3rem); }
.sc svg text { font-size: 12px; }
.sc .grid { opacity: .5; stroke-dasharray: none; }
.sc .line { stroke-width: 1; }
.sc .area { fill-opacity: .4; }
.sc .area.grad { fill: url(#g1); fill-opacity: 1; }
.sc > .legend { justify-content: center; gap: .25rem 1rem; font-size: .75rem; }
.sc > .legend i { width: 8px; height: 8px; margin-right: 6px; }
.sc > .foot { margin-top: 1.5rem; font-size: .875rem; }
.sc > .foot b { font-weight: 500; line-height: 1; }
\`\`\`

## 用法

\`\`\`html
<div class="charts"><div class="card chart sc wide">
  <h3>每日曝光</h3><p class="desc">10/25–10/31 · 趋势接口原值</p>
  <svg viewBox="0 0 560 260" role="img" aria-label="每日曝光面积图">
    <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stop-color="var(--s2)" stop-opacity=".8"/><stop offset="95%" stop-color="var(--s2)" stop-opacity=".1"/></linearGradient></defs>
    <line class="grid" x1="12" x2="548" y1="20" y2="20"/><line class="grid" x1="12" x2="548" y1="220" y2="220"/>
    <path class="area grad" d="M12,150 C… L548,220 L12,220Z"/><path class="line" style="--c:var(--s2)" d="M12,150 C…"/>
    <text x="12" y="248">10/25</text>
  </svg>
  <p class="legend"><span style="--c:var(--s2)"><i></i>test</span></p>
  <p class="foot"><b>两组曝光接近，分流无明显偏差</b>自行汇总</p>
</div></div>
\`\`\`

- 平滑曲线：点 P0…Pn 转三次贝塞尔，第 i 段的两个控制点是 Pi + (Pi+1 − Pi−1) ÷ 6 和 Pi+1 − (Pi+2 − Pi) ÷ 6，首尾点用自身补位；点少或要精确读数时用折线 \`L\`。
- viewBox 宽度取卡片的像素宽度：整行卡用 1100 × 260，半行卡用 540 × 260；文字固定 12 单位，不要用 560 宽的 viewBox 拉伸到整行，否则文字会被放大。
- 图的结构：不画轴线和刻度线，x 轴标签缩写；水平网格 5 条含底线，半透明；面积用 40% 纯色，或同一色相的渐变（5% 处 .8 到 95% 处 .1），不跨色相。
- 静态页面没有悬停提示：在线端标最新值，或在左侧留 3–4 个刻度；不要隐藏 y 轴后一个数字也不标。
- 两个系列用 \`--s2\` 和 \`--s1\`（深在上），堆叠面积不超过 3 个系列，同一色相不同明度。
- 卡片尾部 \`.foot\` 的结论必须来自数据本身，自行汇总的涨跌幅标注"自行汇总"，不要沿用示例里的数值数字。
- 与 \`charts.md\` 的取舍：本主题卡片 12px 圆角、24px 内边距，允许同色相渐变和 40% 填充；仍然不用纯黑纯白，按钮不用药丸形，正文不低于 15px。
- 适用：趋势类时间序列、仪表盘卡片网格。类别比较用横条，占比用 \`.split\`，超过 7 个类别用表格；样本不足时遵守 \`charts.md\` 的小样本规则。`,
    en: `# Theme: console charts

Chart cards in the style of a mature SaaS console: large radius, generous padding, a single blue ramp, smooth area charts. This is a layer over \`components.md\` and \`charts.md\`.

\`\`\`css
/* Append after the components.md and charts.md styles; this overrides the variables */
:root {
  --paper: oklch(98.5% .002 250); --surface: oklch(99.6% .001 250); --ink: oklch(14.5% .004 250); --muted: oklch(55.6% .01 250); --rule: oklch(92.2% .004 250);
  --accent: oklch(54.6% .245 262.9); --s1: oklch(80.9% .105 251.8); --s2: oklch(62.3% .214 259.8); --s3: oklch(54.6% .245 262.9); --s4: oklch(48.8% .243 264.4);
  --r: 12px;
}
@media (prefers-color-scheme: dark) { :root { --paper: oklch(14.5% .004 250); --surface: oklch(20.5% .004 250); --ink: oklch(98.5% .002 250); --muted: oklch(70.8% .01 250); --rule: oklch(30% .004 250); --accent: oklch(68% .19 260); } }
.charts { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr)); }
.charts .wide { grid-column: 1 / -1; }
.charts > .card { margin: 0; }
.chart.sc { padding-bottom: 1.5rem; }
.sc > h3 { padding: 1.5rem 1.5rem 0; font-size: 1rem; line-height: 1; }
.sc > .desc { margin: .5rem 1.5rem 1.5rem; font-size: .875rem; }
.sc > :not(h3):not(.desc) { margin-left: 1.5rem; margin-right: 1.5rem; }
.sc > p { max-width: none; }
.sc > svg { width: calc(100% - 3rem); }
.sc svg text { font-size: 12px; }
.sc .grid { opacity: .5; stroke-dasharray: none; }
.sc .line { stroke-width: 1; }
.sc .area { fill-opacity: .4; }
.sc .area.grad { fill: url(#g1); fill-opacity: 1; }
.sc > .legend { justify-content: center; gap: .25rem 1rem; font-size: .75rem; }
.sc > .legend i { width: 8px; height: 8px; margin-right: 6px; }
.sc > .foot { margin-top: 1.5rem; font-size: .875rem; }
.sc > .foot b { font-weight: 500; line-height: 1; }
\`\`\`

## Usage

\`\`\`html
<div class="charts"><div class="card chart sc wide">
  <h3>Daily impressions</h3><p class="desc">10/25–10/31 · trend API values</p>
  <svg viewBox="0 0 560 260" role="img" aria-label="Daily impressions面积图">
    <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stop-color="var(--s2)" stop-opacity=".8"/><stop offset="95%" stop-color="var(--s2)" stop-opacity=".1"/></linearGradient></defs>
    <line class="grid" x1="12" x2="548" y1="20" y2="20"/><line class="grid" x1="12" x2="548" y1="220" y2="220"/>
    <path class="area grad" d="M12,150 C… L548,220 L12,220Z"/><path class="line" style="--c:var(--s2)" d="M12,150 C…"/>
    <text x="12" y="248">10/25</text>
  </svg>
  <p class="legend"><span style="--c:var(--s2)"><i></i>test</span></p>
  <p class="foot"><b>Impressions are close across groups, so the split looks even</b>self-computed</p>
</div></div>
\`\`\`

- Smooth curves: convert points P0…Pn to cubic Béziers; the two control points of segment i are Pi + (Pi+1 − Pi−1) ÷ 6 and Pi+1 − (Pi+2 − Pi) ÷ 6, using the point itself at the ends; with few points, or when exact reading matters, use straight \`L\` segments.
- Set the viewBox width to the card's pixel width: 1100 × 260 for a full-row card and 540 × 260 for a half-row card, with text fixed at 12 units; do not stretch a 560-wide viewBox across a full row, which enlarges the text.
- Chart structure: no axis lines or tick marks, abbreviated x labels; five horizontal gridlines including the baseline, semi-transparent; area fill is a flat 40%, or a same-hue gradient (.8 at 5% to .1 at 95%), never across hues.
- A static page has no hover tooltip: label the latest value at the end of the line, or keep three or four ticks on the left; do not hide the y axis and then label no number at all.
- Two series use \`--s2\` and \`--s1\` (deeper on top); stacked areas have at most three series, one hue in different lightness.
- The conclusion in \`.foot\` must come from the data itself; mark self-computed changes "self-computed" and never copy the example numbers.
- Trade-offs against \`charts.md\`: this theme uses 12px card radius and 24px padding and allows same-hue gradients and a 40% fill; it still avoids pure black and white, pill buttons, and body text under 15px.
- Use for trend time series and dashboard card grids. Use bars for category comparison, \`.split\` for shares, and a table beyond seven categories; follow the small-sample rule in \`charts.md\` when data is thin.`,
  },
  themeResearch: {
    "zh-CN": `# 主题：研究报告

安静、可长时间阅读。适合研究简报、调研、方案。

\`\`\`css
:root {
  --paper: oklch(98.6% .004 200); --surface: oklch(96% .006 200); --ink: oklch(24% .02 215); --muted: oklch(48% .02 215); --rule: oklch(88% .008 200);
  --accent: oklch(44% .09 195);
  --font: "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) { :root { --paper: oklch(20% .012 215); --surface: oklch(24% .014 215); --ink: oklch(93% .008 200); --muted: oklch(72% .015 200); --rule: oklch(34% .015 215); --accent: oklch(76% .09 195); } }
\`\`\`

## 版面

- 单列，最大宽度 44rem；标题 650 字重，h2 上方一条细线分节。
- 表格只用细横线，不做斑马纹；表头用 --muted，小一号。
- 来源用方括号编号 [1]，列表放在末尾；引用块只用左侧缩进和 --muted，不加色条。
- 强调色只用于链接、编号和一处关键结论。`,
    en: `# Theme: Research

Quiet and readable for long stretches. Fits research briefs, surveys, and proposals.

\`\`\`css
:root {
  --paper: oklch(98.6% .004 200); --surface: oklch(96% .006 200); --ink: oklch(24% .02 215); --muted: oklch(48% .02 215); --rule: oklch(88% .008 200);
  --accent: oklch(44% .09 195);
  --font: "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) { :root { --paper: oklch(20% .012 215); --surface: oklch(24% .014 215); --ink: oklch(93% .008 200); --muted: oklch(72% .015 200); --rule: oklch(34% .015 215); --accent: oklch(76% .09 195); } }
\`\`\`

## Layout

- One column, 44rem maximum; headings at weight 650, a hairline above each h2 to separate sections.
- Tables use thin horizontal rules only, no zebra stripes; table heads in --muted, one step smaller.
- Sources are numbered in square brackets [1], listed at the end; block quotes use indentation and --muted only, no colour bar.
- The accent is for links, numbering, and one key conclusion.`,
  },
  themeDashboard: {
    "zh-CN": `# 主题：数据看板

信息密度高、数字优先，像运营或监控后台。适合指标汇总、监控、业务看板。这是 \`components.md\` 之上的一层覆盖，不替换变量。

\`\`\`css
/* 追加在 components.md 的样式之后 */
:root { --r: 4px; }
body { font-size: 14px; }
.wrap { max-width: 84rem; }
.kpi b { font-size: 1.5rem; }
.toolbar { display: flex; flex-wrap: wrap; gap: .4rem .5rem; align-items: center; padding: .6rem 0; margin-top: .75rem; border-bottom: 1px solid var(--rule); font-size: .8125rem; color: var(--muted); }
.chip { border: 1px solid var(--rule); border-radius: 4px; padding: .1rem .5rem; background: var(--surface); }
.chip b { color: var(--ink); font-weight: 600; }
.dash { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: .75rem; margin-top: 1rem; }
.dash > * { grid-column: span 12; }
.dash > .card { margin: 0; }
@media (min-width: 56rem) { .dash > .s4 { grid-column: span 4; } .dash > .s6 { grid-column: span 6; } .dash > .s8 { grid-column: span 8; } }
\`\`\`

## 版面

- 顶部：标题加一行 meta，下面是 \`.toolbar\`，用 \`.chip\` 写明日期范围、平台、分群等筛选范围（静态展示，不做交互）。
- 其次是一条 \`.kpis\`，3–6 个指标，标签在上、数值在下，带对比基线的变化（\`<em>\` 内写 +/− 百分比）。
- 主体是 \`.dash\` 面板网格：主图 \`.s8\` 加侧栏 \`.s4\`，或两张 \`.s6\`；每个面板是 \`.card.chart\`，有标题、说明和单位；小表放在面板里，不单独成节。
- 看板没有长篇叙述：判断写在 hero 的 verdict，口径和限制写在页脚 meta 和 \`.note\`。
- 状态用 badge；图表遵循 \`charts.md\`。`,
    en: `# Theme: Data dashboard

Dense and number-first, like an operations or monitoring console. Fits metric summaries, monitoring, and business dashboards. This is a layer over \`components.md\` and does not replace its variables.

\`\`\`css
/* Append after the components.md styles */
:root { --r: 4px; }
body { font-size: 14px; }
.wrap { max-width: 84rem; }
.kpi b { font-size: 1.5rem; }
.toolbar { display: flex; flex-wrap: wrap; gap: .4rem .5rem; align-items: center; padding: .6rem 0; margin-top: .75rem; border-bottom: 1px solid var(--rule); font-size: .8125rem; color: var(--muted); }
.chip { border: 1px solid var(--rule); border-radius: 4px; padding: .1rem .5rem; background: var(--surface); }
.chip b { color: var(--ink); font-weight: 600; }
.dash { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: .75rem; margin-top: 1rem; }
.dash > * { grid-column: span 12; }
.dash > .card { margin: 0; }
@media (min-width: 56rem) { .dash > .s4 { grid-column: span 4; } .dash > .s6 { grid-column: span 6; } .dash > .s8 { grid-column: span 8; } }
\`\`\`

## Layout

- Top: the title and one meta line, then a \`.toolbar\` that states the filter scope (date range, platform, segment) with \`.chip\` elements (static, not interactive).
- Next, one \`.kpis\` strip of 3–6 metrics, label above and value below, with the change against a baseline (a +/− percentage in \`<em>\`).
- The body is a \`.dash\` panel grid: a main chart \`.s8\` with a side column \`.s4\`, or two \`.s6\`; each panel is a \`.card.chart\` with a title, a description, and a unit; small tables sit inside panels rather than forming their own section.
- A dashboard has no long narrative: put the judgment in the hero verdict, and definitions and limits in the footer meta and a \`.note\`.
- Status uses a badge; charts follow \`charts.md\`.`,
  },
  themeComparison: {
    "zh-CN": `# 主题：对比评测

便于并排判断，青绿色强调，中性底。适合产品对比、方案评估、选型建议。

\`\`\`css
/* 替换 components.md 的 :root 和深色媒体查询 */
:root {
  --paper: oklch(98.4% .004 250); --surface: oklch(99.4% .002 250); --ink: oklch(23% .018 255); --muted: oklch(47% .018 255); --rule: oklch(90% .007 250);
  --accent: oklch(46% .11 195); --ok: oklch(46% .11 155); --warn: oklch(50% .12 70); --bad: oklch(48% .16 27);
  --r: 6px; --font: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
@media (prefers-color-scheme: dark) { :root { --paper: oklch(19% .01 250); --surface: oklch(23% .012 250); --ink: oklch(93% .007 250); --muted: oklch(72% .012 250); --rule: oklch(33% .012 250); --accent: oklch(76% .1 195); --ok: oklch(76% .12 155); --warn: oklch(80% .12 75); --bad: oklch(74% .15 27); } }
\`\`\`

## 版面

- 先用一个 \`.note\` 给推荐：推荐谁、适合谁、最大的取舍，不超过 80 字。
- 然后是 \`.matrix\` 对比矩阵（组件见 \`audit-and-compare.md\`）：第一列固定为维度名，推荐项整列加 \`.rec\`；每个单元格的数据后标来源编号，缺失写"未获取"，不适用写"不适用"。
- 有数值的维度（价格、性能、评分）另外画一张 \`charts.md\` 的横条，不重复矩阵里的数字。
- 矩阵之后是"取舍"：用 \`.cols\` 列出每个选项最不适合的场景；来源列表放末尾。
- 强调色只用于推荐列、链接和一处关键结论。`,
    en: `# Theme: Comparison

Built for side-by-side judgment, with a teal accent on a neutral ground. Fits product comparisons, option evaluations, and selection advice.

\`\`\`css
/* Replace the :root and dark media query in components.md */
:root {
  --paper: oklch(98.4% .004 250); --surface: oklch(99.4% .002 250); --ink: oklch(23% .018 255); --muted: oklch(47% .018 255); --rule: oklch(90% .007 250);
  --accent: oklch(46% .11 195); --ok: oklch(46% .11 155); --warn: oklch(50% .12 70); --bad: oklch(48% .16 27);
  --r: 6px; --font: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
@media (prefers-color-scheme: dark) { :root { --paper: oklch(19% .01 250); --surface: oklch(23% .012 250); --ink: oklch(93% .007 250); --muted: oklch(72% .012 250); --rule: oklch(33% .012 250); --accent: oklch(76% .1 195); --ok: oklch(76% .12 155); --warn: oklch(80% .12 75); --bad: oklch(74% .15 27); } }
\`\`\`

## Layout

- Start with one \`.note\` giving the recommendation: who to pick, who it suits, and the biggest trade-off, in at most 80 words.
- Then the \`.matrix\` (component in \`audit-and-compare.md\`): the first column fixed as dimension names and the recommended option's whole column marked \`.rec\`; put a source number after each data cell, write "not retrieved" for missing data and "not applicable" where it does not apply.
- Draw numeric dimensions (price, performance, ratings) as a separate \`charts.md\` bar, and do not repeat the matrix numbers.
- After the matrix comes the trade-offs: list each option's worst-fit scenario with \`.cols\`; put the source list at the end.
- Use the accent only for the recommended column, links, and one key conclusion.`,
  },
});

export default messages;
