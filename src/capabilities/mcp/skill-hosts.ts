import type { SkillHostExtension } from "#sdk/background/skill-hosts";
import { MCP_TOOL_CORE_NAMES as targets } from "./skill-contract.js";
const register: SkillHostExtension = zuri => {
  for (const target of targets) zuri.registerSkillHost({ skillName: "zuri-mcp", manifestId: "zuri-mcp", toolName: target, target });
};
export default register;
