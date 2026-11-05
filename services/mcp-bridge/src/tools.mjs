import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { BridgeError } from "./state.mjs";
import { waitForTask } from "./task-stream.mjs";
import { PACKAGE_VERSION } from "./package-info.mjs";

// Public MCP tools use the extension's version 1 wire protocol.
export const TOOL_CATALOG = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8"))
  .map(tool => ({ ...tool, inputSchema: { ...tool.inputSchema, additionalProperties: false } }));
const schemaValidator = new AjvJsonSchemaValidator();
const definitions = new Map(TOOL_CATALOG.map(tool => [tool.name, {
  tool, validate: schemaValidator.getValidator(tool.inputSchema),
}]));
const taskInputResults = new Set([
  "zuri_get_session_snapshot", "zuri_get_session_state", "zuri_send_message",
  "zuri_respond_to_user_input", "zuri_continue_task", "zuri_submit_wait_form", "zuri_cancel_wait",
]);
const resourceResults = new Set([
  "zuri_get_skill", "zuri_get_skill_resource", "zuri_export_skill",
  "zuri_list_data_tables", "zuri_delete_data_table", "zuri_export_data_table",
  "zuri_list_image_collections", "zuri_delete_image_collection", "zuri_export_image_collection",
  "zuri_get_settings", "zuri_update_settings",
]);
const observableTools = new Set([
  "zuri_watch_task", "zuri_create_session", "zuri_send_message", "zuri_respond_to_user_input",
]);

function bindInputClient(name, result, clientId) {
  const selectedClient = String(clientId || "").trim();
  const isObject = value => value && typeof value === "object" && !Array.isArray(value);
  if (!selectedClient || !isObject(result)) return result;
  const bind = input => ({
    ...input, clientId: selectedClient,
    ...(isObject(input.responseTemplate)
      ? { responseTemplate: { ...input.responseTemplate, clientId: selectedClient } } : {}),
  });
  if (name === "zuri_get_user_input") return bind(result);
  return taskInputResults.has(name) && isObject(result.input)
    ? { ...result, input: bind(result.input) } : result;
}

function argumentsWithDefaults(definition, input) {
  const validation = definition.validate(input);
  if (!validation.valid) throw new Error(`Invalid arguments: ${validation.errorMessage}`);
  return Object.fromEntries(Object.entries(definition.tool.inputSchema.properties).flatMap(([key, schema]) => {
    if (Object.hasOwn(input, key)) return [[key, input[key]]];
    return Object.hasOwn(schema, "default") ? [[key, structuredClone(schema.default)]] : [];
  }));
}

export async function executeMcpTool(state, name, input = {}, { signal, onTaskUpdate } = {}) {
  const args = validateMcpToolInput(name, input);
  if (name === "zuri_bridge_status") return state.status();
  if (name === "zuri_forget_browser") return state.forgetBrowser(args.clientId);
  if (name === "zuri_get_tool_job") return state.getJob(args.jobId, args.includeResult);
  // One MCP operation, including observation, belongs to one connection.
  const connection = await state.resolveClient(String(args.clientId || "").trim(),
    (args.timeoutSeconds || state.requestTimeoutSeconds || 180) * 1000, state.signal(signal), true);
  args.clientId = connection.id;
  const connectionSignal = state.signal(connection.controller.signal);
  const operationSignal = signal ? AbortSignal.any([connectionSignal, signal]) : connectionSignal;
  operationSignal.throwIfAborted();
  const result = await executeBrowserTool(state, name, args, { signal: operationSignal, connectionSignal, onTaskUpdate });
  return args.clientId && (observableTools.has(name) || taskInputResults.has(name) || ["zuri_list_sessions", "zuri_get_user_input", "zuri_stop_session", "zuri_abort_session"].includes(name)) && result && typeof result === "object" && !Array.isArray(result)
    ? { ...result, clientId: args.clientId } : result;
}

async function executeBrowserTool(state, name, args, { signal, connectionSignal, onTaskUpdate }) {
  const observe = observableTools.has(name) && (name === "zuri_watch_task" || args.wait || args.stream);
  const asyncTool = name === "zuri_execute_tool" && args.wait === false;
  const options = { timeoutSeconds: args.timeoutSeconds, clientId: args.clientId, signal };
  const startedAt = Date.now();
  const watch = async (sessionId, tracking = {}) => {
    try {
      const remaining = args.waitTimeoutSeconds == null ? null : args.waitTimeoutSeconds - (Date.now() - startedAt) / 1000;
      if (remaining !== null && remaining <= 0) throw new DOMException("Stopped watching after waitTimeoutSeconds. The browser task may still be running.", "TimeoutError");
      return await waitForTask({ sessionId, clientId: args.clientId, signal, timeoutSeconds: remaining,
        requestTimeoutSeconds: args.timeoutSeconds || state.requestTimeoutSeconds || 180,
        expectedRunId: tracking.runId, expectedMessageId: tracking.clientMessageId, messageWasQueued: tracking.disposition === "queued",
        ignoreWaitId: tracking.ignoreWaitId, allowIdle: tracking.allowIdle,
        onUpdate: onTaskUpdate && (event => args.stream || !["text", "replace"].includes(event.type) ? onTaskUpdate(event) : undefined),
        getSnapshot: async ({ signal: requestSignal, timeoutSeconds }) => bindInputClient("zuri_get_session_snapshot",
          await state.callExtension("get_session_snapshot", {
            sessionId, compact: false, tail: false, includeArtifacts: false, timeoutSeconds,
          }, { ...options, timeoutSeconds, signal: requestSignal }), args.clientId),
      });
    } catch (cause) {
      const code = typeof cause.code === "string" ? cause.code
        : cause.name === "TimeoutError" ? "timeout" : cause.name === "AbortError" ? "interrupted" : "task_wait_failed";
      const error = Object.assign(new Error(cause.message, { cause }), { code });
      error.details = { ...cause.details, sessionId, clientId: args.clientId,
        recovery: code === "task_deleted"
          ? { tool: "zuri_list_sessions", arguments: { clientId: args.clientId } }
          : { tool: code === "task_changed" ? "zuri_get_session_snapshot" : "zuri_watch_task",
            arguments: { sessionId, clientId: args.clientId } } };
      throw error;
    }
  };
  if (name === "zuri_watch_task") return { sessionId: args.sessionId, snapshot: await watch(args.sessionId, { allowIdle: true }) };
  if (name === "zuri_get_tool") {
    const listed = await state.callExtension("list_tools", { sessionId: args.sessionId, timeoutSeconds: args.timeoutSeconds }, options);
    const tool = (Array.isArray(listed) ? listed : listed?.tools || []).find(tool => (tool.name || tool.function?.name) === args.name);
    if (!tool) throw new BridgeError("tool_not_found", `No browser tool named ${args.name}. Use zuri_list_tools to list available tools.`);
    return tool;
  }
  if (name === "zuri_call") return state.callExtension(args.method.trim(), args.params || {}, options);
  if (name === "zuri_list_capabilities") return state.callExtension("capabilities", {}, options);
  const { clientId, ...params } = args;
  if (observableTools.has(name)) {
    delete params.stream;
    delete params.waitTimeoutSeconds;
    if (name === "zuri_send_message") params.wait = false;
    else delete params.wait;
  }
  if (name === "zuri_follow_up") params.images ||= [];
  if (name === "zuri_submit_wait_form") params.answers ||= {};
  if (name === "zuri_execute_tool") {
    delete params.wait;
    params.args ||= {};
    return asyncTool ? { ...state.startExtensionJob("execute_tool", params, { ...options, connectionSignal }), sessionId: args.sessionId, clientId }
      : state.callExtension("execute_tool", params, options);
  }
  const method = name === "zuri_abort_session" ? "stop_session" : name.slice("zuri_".length);
  let result = await state.callExtension(method, params, options);
  if (resourceResults.has(name) && result && typeof result.code === "string" && typeof result.error === "string") {
    throw new BridgeError(result.code, result.error, {
      ...result.details,
      ...(Array.isArray(result.available) ? { available: result.available } : {}),
      ...(Array.isArray(result.resources) ? { available: result.resources.map(resource => resource.path) } : {}),
    });
  }
  result = bindInputClient(name, result, clientId);
  if (observe) {
    const sessionId = name === "zuri_create_session" ? result?.session?.id || result?.sessionId : args.sessionId;
    if (name === "zuri_create_session") {
      if (!sessionId) throw new BridgeError("invalid_response", "The task was created without an ID. Use zuri_list_sessions to find it before retrying.");
      await onTaskUpdate?.({ type: "created", sessionId, clientId, ...result });
      result = { ...result, snapshot: await watch(sessionId, { allowIdle: !args.firstMessage.trim() }) };
    } else if (name === "zuri_send_message" && result?.accepted === true) {
      if (typeof result.clientMessageId !== "string" || !result.clientMessageId.trim()) {
        throw Object.assign(new BridgeError("invalid_response", "The message was accepted without a tracking ID. Continue watching the same task before sending it again."), {
          details: { sessionId, clientId, recovery: { tool: "zuri_watch_task", arguments: { sessionId, clientId } } },
        });
      }
      result = { ...result, snapshot: await watch(sessionId, { clientMessageId: result.clientMessageId, disposition: result.disposition }) };
    } else if (name === "zuri_respond_to_user_input" && (result?.accepted === true || result?.requiresUserAction)) {
      const snapshot = await watch(sessionId, { runId: result.runId || "", ignoreWaitId: result.requiresUserAction ? "" : args.waitId });
      result = result.requiresUserAction ? { sessionId, waitId: args.waitId, snapshot } : { ...result, snapshot };
    }
  }
  return result;
}

/** Validate input against the advertised tool schema and apply its defaults. */
export function validateMcpToolInput(name, input = {}) {
  const definition = definitions.get(name);
  if (!definition) throw Object.assign(new Error(`Unknown tool: ${name}. Read the MCP tool list for available names.`), { code: "invalid_arguments" });
  try {
    return argumentsWithDefaults(definition, input);
  } catch (error) {
    error.code = "invalid_arguments";
    throw error;
  }
}

export function resultToContent(result) {
  if (result == null) return [];
  if (Array.isArray(result)) return result.flatMap(resultToContent);
  return [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }];
}

export function createMcpServer(state) {
  const server = new Server({ name: "zuri-agent-mcp-bridge", version: PACKAGE_VERSION }, {
    capabilities: { tools: {} }, instructions: "Control zuri tasks and browser tools through the local bridge.",
  });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_CATALOG }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      let progress = 0;
      const progressToken = request.params._meta?.progressToken;
      const result = await executeMcpTool(state, request.params.name, request.params.arguments || {}, { signal: extra.signal,
        onTaskUpdate: progressToken === undefined ? undefined : event => extra.sendNotification({
          method: "notifications/progress", params: { progressToken, progress: ++progress,
            message: ["text", "replace"].includes(event.type) ? event.text : JSON.stringify(event),
            _meta: { "zuri/task-event": event } },
        }).catch(() => {}),
      });
      return { content: resultToContent(result) };
    } catch (error) {
      const message = error.message || String(error);
      const value = typeof error.code === "string" && error.code ? {
        code: error.code, message,
        ...(error.details && Object.keys(error.details).length ? { details: error.details } : {}),
      } : message;
      return { isError: true, content: resultToContent(value) };
    }
  });
  return server;
}
