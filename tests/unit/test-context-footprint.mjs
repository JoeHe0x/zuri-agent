import assert from "node:assert/strict";

globalThis.chrome = { storage: { local: { async get() { return {}; }, async set() {}, async remove() {} } }, debugger: { onEvent: { addListener() {} }, onDetach: { addListener() {} } } };

const { getAgentPrompts } = await import("../../src/background/agent/prompts.js");
const { getToolSchemas, executeTool } = await import("../../src/background/tools/runtime.js");
const { toolGroupLoadName, TOOL_GROUPS } = await import("../../src/shared/tools/tool-groups.js");

// Fixed per-step prefix. Raise a budget only with a measured reason; see docs/token-optimization.md.
const approxTokens = text => Math.ceil(text.length / 4);
const names = schemas => schemas.map(schema => schema.function.name);
const tokens = schemas => approxTokens(JSON.stringify(schemas));
const deferred = { runProfile: { tools: { deferGroups: true } }, language: "en" };

const system = approxTokens(getAgentPrompts("en").SYSTEM_PROMPT);
const all = getToolSchemas({ language: "en" });
const byDefault = getToolSchemas(deferred);
const loaded = getToolSchemas({ ...deferred, loadedPluginSkillNames: TOOL_GROUPS.map(toolGroupLoadName) });
console.log(`context footprint: system≈${system}, all tools≈${tokens(all)} (${all.length}), default tools≈${tokens(byDefault)} (${byDefault.length})`);

assert.ok(system < 6500, `system prompt grew to ≈${system} tokens`);
assert.ok(tokens(all) < 19500, `all-tools schemas grew to ≈${tokens(all)} tokens`);
assert.ok(tokens(byDefault) < 14000, `default tool schemas grew to ≈${tokens(byDefault)} tokens`);

assert.ok(!names(all).includes("enable_tools"), "callers that cannot enable groups do not see enable_tools");
assert.ok(names(byDefault).includes("enable_tools"), "a deferring run can enable groups");
for (const name of ["manage_sessions", "manage_goal", "collect_images", "network_recent", "manage_bookmarks"]) {
  assert.ok(names(all).includes(name) && !names(byDefault).includes(name), `${name} is deferred by default`);
}
for (const name of ["get_ax_tree", "run_script", "data_store", "wait_for_user"]) assert.ok(names(byDefault).includes(name), `${name} stays in the default set`);
assert.deepEqual(names(loaded).filter(name => name !== "enable_tools").sort(), names(all).sort(), "loading every group restores the full tool set");
const networkOnly = getToolSchemas({ ...deferred, loadedPluginSkillNames: [toolGroupLoadName("network")] });
assert.ok(names(networkOnly).includes("network_recent") && !names(networkOnly).includes("manage_sessions"), "only the loaded group is added");

const rejected = await executeTool("manage_sessions", { action: "list" }, undefined, { ...deferred, sessionId: "s1" }).then(() => null, error => error);
assert.ok(rejected, "a tool in an unloaded group is rejected");
assert.match(JSON.stringify([rejected.code, rejected.message, rejected.details]), /TOOL_FORBIDDEN_BY_RUN_PROFILE.*enable_tools/s, "the error names the recovery call");
