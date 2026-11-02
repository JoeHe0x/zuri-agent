import { chatAnthropic, chatStreamAnthropic } from "./adapter.js";
import { resolveClaudeAuth } from "./auth.js";
import type { ModelMessage } from "#sdk/shared/models";
import type { ProviderDefinition, ModelEvent, ModelOptions, RuntimeConfig } from "#sdk/background/providers";

// Subscription tokens are only accepted for requests that identify as Claude Code.
const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
const BETAS = "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05";
// Keeps custom tool names (e.g. "read", "bash") from colliding with Claude Code's built-in tools.
const TOOL_PREFIX = "_";

async function prepare(messages: ModelMessage[], signal: AbortSignal | undefined, options: ModelOptions) {
  const { token } = await resolveClaudeAuth(signal);
  return {
    messages: [{ role: "system", content: CLAUDE_CODE_IDENTITY } as ModelMessage, ...messages],
    options: { ...options, providerDefinition: { ...options.providerDefinition, anthropicToolPrefix: TOOL_PREFIX } as ProviderDefinition, baseHeaders: { ...options.baseHeaders, "x-app": "cli" }, headers: { ...options.headers, Authorization: `Bearer ${token}`, "anthropic-beta": BETAS } },
  };
}

export async function chatClaudePlan(messages: ModelMessage[], tools: object[], signal: AbortSignal | undefined, options: ModelOptions, config: RuntimeConfig) {
  const prepared = await prepare(messages, signal, options);
  return chatAnthropic(prepared.messages, tools, signal, prepared.options, { ...config, apiKey: "" });
}

export async function* chatStreamClaudePlan(messages: ModelMessage[], tools: object[], signal: AbortSignal | undefined, options: ModelOptions, config: RuntimeConfig): AsyncGenerator<ModelEvent> {
  const prepared = await prepare(messages, signal, options);
  yield* chatStreamAnthropic(prepared.messages, tools, signal, prepared.options, { ...config, apiKey: "" });
}
