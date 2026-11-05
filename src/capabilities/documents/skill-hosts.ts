import type { SkillHostExtension } from "#sdk/background/skill-hosts";
import { DOCUMENT_TOOL_CORE_NAMES as targets } from "./skill-contract.js";
const register: SkillHostExtension = zuri => {
  for (const target of targets) zuri.registerSkillHost({ skillName: "zuri-documents", manifestId: "zuri-documents", toolName: target, target });
};
export default register;
