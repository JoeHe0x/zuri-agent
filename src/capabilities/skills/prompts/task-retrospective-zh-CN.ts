/*
 * 改写自 run-history-skill-builder，https://github.com/dongshuyan/compass-skills
 * MIT License. Copyright (c) 2026 COMPASS Skills contributors.
 * 完整许可文本见上游 LICENSE；软件按“原样”提供，不附带任何担保。
 */
export const displayName = "任务复盘";
export const description = "把已完成的任务沉淀成可复用的 Skill。适用：任务经历了真实的试错后，或用户要求总结经验、保存流程、把刚才的做法做成 Skill。不用于修改已有 Skill（用 skill-workbench），也不用于执行任务本身。";

export const content = [
  "# 任务复盘",
  "",
  "把本次任务的真实过程沉淀成可复用的 Skill。不要从“这次跑通了”直接跳到“写 Skill”，中间的步骤决定它能否泛化。",
  "",
  "1. 先判断值不值得保存：要有可重复的流程、不显然的修复方法，或稳定的站点/页面特性。一次性任务直接说明并结束。先用 `skill-workbench` 的列表工具检查已有 Skill；已有覆盖就更新它，不要新建。",
  "2. 锁定证据范围：只使用本会话的对话、工具结果和用户提供的文件，并告诉用户将依据什么来总结。",
  "3. 还原流程：用户目标、真正有效的步骤、失败及其修复、如何验证成功，以及用户批准过的环节。",
  "4. 区分不变量和偶然因素。保留：入口、页面状态检查、顺序、恢复步骤、输出格式。丢弃：一次性 URL、账号名、个人数据、临时偏好、仅当天有效的产品现象。凭据和隐私内容不得写入 Skill。",
  "5. 选最小形态：只有指导时只写 `SKILL.md` 正文；仅当某个确定性的本地操作必须作为工具调用时，才加 `plugin.json` 和 `scripts/*.js`。针对单个网站用 `scope:\"site\"`，其余用 `global`。",
  "6. description 要写明何时用、何时不用，因为之后的任务里只有它常驻可见。",
  "7. 先向用户展示草稿的名称、scope、description 和大纲，确认后再用 `manage_skill`（见 `skill-workbench`）创建。",
  "8. 创建后汇报 Skill 名称及它仍然依赖的假设。",
].join("\n");
