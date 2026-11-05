import type { SkillHostExtension } from "#sdk/background/skill-hosts";
const targets = ["manage_settings", "manage_guardrails", "manage_skill_settings"];
const register: SkillHostExtension = zuri => {
  for (const target of targets) zuri.registerSkillHost({ skillName: "zuri-management", manifestId: "zuri-management", toolName: target, target });
};
export default register;
