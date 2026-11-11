import { defineMessages } from "#sdk/shared/i18n-definition";
import { createTranslator } from "#sdk/shared/i18n";

/** Model-facing documentation stays with the tool contribution, outside the UI catalog. */
const messages = defineMessages("script-tools", {
  pageContextRecovery: { "zh-CN": "先检查当前页面状态，必要时刷新或重新打开后重试；不要盲目重放结果尚不确定的操作。", en: "Inspect the current page first, then refresh or reopen it if needed before retrying. Do not blindly replay actions with uncertain outcomes." },
  scriptContextRecovery: { "zh-CN": "重新加载扩展并连接浏览器；重试任何操作前先检查页面当前状态。", en: "Reload the extension and reconnect. Inspect the current browser state before retrying any action." },
  toolAccessRecovery: { "zh-CN": "请在 run_script 中通过 zuri SDK 操作浏览器；传给 page.evaluate 的页面函数须保持自包含。", en: "Use the zuri SDK in run_script for browser operations; keep page.evaluate functions self-contained." },
  runScriptDescription: {
    "zh-CN": "在页面外执行 JavaScript 编排（支持顶层 await 和 return，页面导航或重载不会销毁外层脚本）。通过 args 读取入参；使用 zuri SDK：zuri.openTab({url,tabAlias}) 打开页面，zuri.tab(tabRef) 绑定明确页面，page.locator(target或查询).click()/fill(value) 定位并操作元素，page.read() 读取正文，page.evaluate(code,args) 执行页面内自包含函数。定位器默认要求唯一匹配，动作前自动等待可操作；locator.wait({state:\"visible\"}) 等待状态，locator.wait({count:3}) 等待数量，locator.count() 读取当前数量。用 zuri.listTools({names}) 查询扩展工具参数，zuri.call(name,args) 调用已加载 Skill 等工具；await 成功返回业务值，失败抛错。包含副作用的动作按需通过 waitFor:\"navigation\" 或 waitFor:\"popup\" 复合等待，避免竞态。",
    en: "Run JavaScript orchestration outside the page with top-level await and return. Page navigations or reloads do not destroy the outer script. Read inputs via args; use the zuri SDK: zuri.openTab({url,tabAlias}) opens a page, zuri.tab(tabRef) binds an explicit page, page.locator(target or query).click()/fill(value) locates and interacts with elements, page.read() reads main content, page.evaluate(code,args) executes a self-contained in-page function. Locators require unique matches by default and wait for actionability before interacting. locator.wait({state:\"visible\"}) waits for element state, locator.wait({count:3}) waits for element counts, locator.count() reads the current count. Use zuri.listTools({names}) to inspect tool schemas and zuri.call(name,args) to call loaded Skill tools. Awaited calls return business values directly and throw on failure. Actions with side effects can compound wait conditions via waitFor:\"navigation\" or waitFor:\"popup\" to prevent races.",
  },
  evaluateDescription: {
    "zh-CN": "在 tabRef 指定的页面内执行自包含函数并返回其可 JSON 序列化的业务值。函数可访问 document/window 与页面登录态，但不能调用 zuri SDK 或捕获外层变量；外部参数统一通过 args 传入并由函数形参接收。脚本中 code 可直接传函数，JSON 调用传函数源码字符串。仅返回所需的 JSON 值；从框架 state 中选取相关字段，DOM 节点和函数不能跨页面边界返回。点击、填表与导航请使用外层工具；默认等待当前文档 DOMContentLoaded 后执行（早期观察传 waitUntil:\"commit\"），动态内容请配合具体等待条件。页面卸载可能中断本次 evaluate，代码不会自动重放。",
    en: "Evaluate a self-contained function in the page specified by tabRef and return its JSON-serializable business value. The function can access document/window and page authentication state, but cannot call the zuri SDK or capture outer variables; external arguments are passed through args and received by the function parameter. Code can be passed directly as a function in scripts, or as a source string in JSON calls. Return only the needed JSON values; extract relevant fields from framework state, as DOM nodes and functions cannot cross page boundaries. Use outer tools for clicks, form fills, and navigation. Evaluates after DOMContentLoaded by default (pass waitUntil:\"commit\" for early observation); pair dynamic content with explicit wait conditions. Page unloads may interrupt this evaluation and the code will not automatically replay.",
  },
  evaluateCode: {
    "zh-CN": "自包含的普通函数、箭头函数或 async 函数表达式（脚本中可直接传函数，JSON 调用传函数字符串）。",
    en: "A self-contained ordinary, arrow, or async function expression (pass a function in scripts or its source string in JSON calls).",
  },
  evaluateWaitUntil: {
    "zh-CN": "执行前的文档就绪状态：domcontentloaded（默认，等待 HTML 解析与延迟脚本完成）或 commit（导航提交后即可执行，适合早期观察）；均不等待图片或网络空闲。",
    en: "Document readiness before execution: domcontentloaded (default; waits for HTML parsing and deferred scripts) or commit (allows early observation after navigation commits). Neither waits for images or network idle.",
  },
  evaluateArgs: {
    "zh-CN": "作为函数唯一参数传入的 JSON 值。",
    en: "A JSON value passed as the function's single argument.",
  },
  listToolsDescription: {
    "zh-CN": "查询当前会话可用工具。省略 names 返回所有可发现工具的紧凑签名；传入 names 返回指定工具定义的完整参数 schema。",
    en: "Inspect tools available in this session. Omit names for compact signatures of all discoverable tools; pass names for the complete parameter schemas of specific tools.",
  },
  runSkillScriptDescription: {
    "zh-CN": "内部工具：执行已加载 Skill 包内的脚本资源（模型不直接调用）。page 必须使用当前任务已拥有的网页 tab；inner 运行在内部 Worker，不需要网页 tab。",
    en: "Internal tool: execute a script resource from a loaded Skill package (not called directly by the model). page requires a web tab owned by the current task; inner runs in zuri's internal Worker without a web tab.",
  },
  runSkillScriptTarget: {
    "zh-CN": "执行目标：省略或 page=当前任务网页；inner=内部 Worker。",
    en: "Execution target: omitted or page for the current task's web page; inner for the internal Worker.",
  },
  runSkillScriptTabId: {
    "zh-CN": "本次调用的目标标签页 tabRef：别名或 open_tab/list_tabs 返回的 id。",
    en: "Target tabRef for this call: an alias or the id returned by open_tab/list_tabs.",
  },
  runSkillScriptSkill: {
    "zh-CN": "Skill 名称。",
    en: "Skill name.",
  },
  runSkillScriptScript: {
    "zh-CN": "Skill 包内脚本相对路径，如 scripts/collect-feed.js。",
    en: "Relative script path in the Skill package, such as scripts/collect-feed.js.",
  },
  runSkillScriptArgs: {
    "zh-CN": "传给脚本的参数对象（脚本内通过 args 读取）。",
    en: "Arguments object passed to the script (read via args).",
  },
  runSkillScriptMutatesPage: {
    "zh-CN": "脚本是否会修改页面 DOM、表单或状态，默认 false。",
    en: "Whether the script modifies page DOM, forms, or state. Default: false.",
  },
  runScriptArgs: {
    "zh-CN": "作为 args 传入外层脚本的 JSON 值。",
    en: "A JSON value exposed as args in the outer script.",
  },
  runScriptCode: {
    "zh-CN": "页面外执行的 JavaScript 编排代码，支持顶层 await 和 return。",
    en: "Outer JavaScript orchestration code with top-level await and return.",
  },
  scriptTimeout: {
    "zh-CN": "脚本超时秒数，默认 120；0 表示不设单次时限，仍受任务取消和调用方期限约束。",
    en: "Script timeout in seconds (default 120). Zero removes the per-call limit while retaining task cancellation and caller deadlines.",
  },
});

export const toolT = createTranslator(messages);
