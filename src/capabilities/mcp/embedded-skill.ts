import { modelT } from "./model-messages.js";
import {
  getMcpSkillToolName,
  ZURI_MCP_SKILL_ID,
  ZURI_MCP_TOOL_SPECS,
} from "./skill-contract.js";
import { createSkillHostResources } from "#sdk/shared/skill-definition";

export const BUILTIN_ZURI_MCP_SKILL_NAME = "zuri-mcp";
export const getBuiltinZuriMcpDisplayName = () => (modelT("mcpDisplayName"));
export const getBuiltinZuriMcpDescription = () => (modelT("mcpDescription"));

const INSPECT = getMcpSkillToolName("mcp_inspect_server");
const LIST = getMcpSkillToolName("mcp_list_tools");
const SEARCH = getMcpSkillToolName("mcp_search_tools");
const CALL = getMcpSkillToolName("mcp_call_tool");

export const getBuiltinZuriMcpContent = () => (modelT("builtinContent", { SEARCH, LIST, CALL, INSPECT }));

export const getBuiltinZuriMcpResources = () => (createSkillHostResources({
  id: ZURI_MCP_SKILL_ID,
  get displayName() { return getBuiltinZuriMcpDisplayName(); },
  version: "0.1.0",
  get description() { return getBuiltinZuriMcpDescription(); },
  category: { id: "mcp", label: "MCP" },
  tools: ZURI_MCP_TOOL_SPECS,
  get manifestTitle() { return modelT("mcpManifestTitle"); },
  get manifestDescription() { return modelT("mcpManifestDescription"); },
  get scriptDescription() { return modelT("mcpScriptDescription"); },
}));

export default {
  aliases: ["MCP 接入", "MCP integration"],
  name: BUILTIN_ZURI_MCP_SKILL_NAME, get displayName() { return getBuiltinZuriMcpDisplayName(); },
  get description() { return getBuiltinZuriMcpDescription(); }, get content() { return getBuiltinZuriMcpContent(); },
  get resources() { return getBuiltinZuriMcpResources(); }, order: 4,
};
