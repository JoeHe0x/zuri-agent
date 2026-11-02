/** Authored built-in Skill instructions; protocol identifiers remain stable across locales. */
export const displayName = "查找技能";
export const description = "从开放的 agent skills 生态中发现并安装 Skill。适用：用户问“怎么做 X”“有没有做 X 的 skill”“找一个 X 的技能”，或想扩展 Weee Agent 的能力。";

export const content = [
  "# 查找技能",
  "",
  "在开放技能生态 https://skills.sh/ 中搜索，并把匹配的 Skill 安装到 Weee Agent。",
  "",
  "1. 明确领域与任务（如 React 测试、PR 评审、changelog）。",
  "2. 用页面或 Network 工具打开 `https://skills.sh/`（排行榜）或 `https://skills.sh/?q=<关键词>` 并阅读结果。关键词要具体，无结果时换近义词重试。",
  "3. 推荐前先核实：优先 1K+ 安装量、官方或知名作者、仓库有真实 star；安装量低于 100 的要谨慎。",
  "4. 向用户展示最合适的一到三个：名称、用途、安装量、来源仓库和 skills.sh 链接。",
  "5. 用户同意后，用 Git 检查/导入工具（`import_git_skill_repository`）从其 GitHub 仓库 URL 安装。名称冲突时未经用户确认不要传 `overwrite:true`。不要运行 `npx skills`，Weee Agent 没有 shell。",
  "6. 没有合适结果时如实说明，主动提出直接完成任务，并提示可用 `skill-workbench` 创建自定义 Skill。",
].join("\n");
