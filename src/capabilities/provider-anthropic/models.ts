import { resolveClaudeAuth } from "./auth.js";
import { trace } from "#sdk/background/tools";
import type { ProviderModelDiscovery } from "#sdk/background/providers";

/** Lists the models the signed-in account can use, newest first; the packaged list is the fallback. */
export async function listModels({ definition, signal, read }: ProviderModelDiscovery) {
  try {
    const auth = await resolveClaudeAuth(signal);
    const { response, text } = await read(`${definition.baseUrl}/v1/models?limit=100`, {
      Authorization: `Bearer ${auth.token}`, "anthropic-version": definition.anthropicVersion || "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20", "anthropic-dangerous-direct-browser-access": "true", "x-app": "cli",
    });
    if (!response.ok) throw new Error(`models ${response.status}`);
    const { data } = JSON.parse(text) as { data?: { id?: unknown; display_name?: unknown }[] };
    const models = (data || []).filter(model => typeof model.id === "string" && model.id.startsWith("claude-"))
      .map((model, index, all) => ({ id: String(model.id), ownedBy: "Claude Pro/Max", priority: all.length - index }));
    if (models.length) return models;
    throw new Error("empty model list");
  } catch (error) {
    signal?.throwIfAborted();
    trace(`claude plan models fallback static: ${error instanceof Error ? error.message : String(error)}`);
    return definition.staticModels || [];
  }
}
