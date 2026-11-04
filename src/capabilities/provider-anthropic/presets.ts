import { t } from "./i18n.js";
import type { ProviderDefinition } from "#sdk/background/providers";
import { clearClaudeAuth, getClaudeAuthStatus, pollClaudeLogin, startClaudeLogin } from "./auth.js";
import { listModels } from "./models.js";
import { modelOptions } from "./options.js";

const BASE_URL = "https://api.anthropic.com";

const OWNED_BY = "Claude Pro/Max · 200K · image";
const STATIC_MODELS = ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]
  .map((id, index, ids) => ({ id, ownedBy: OWNED_BY, priority: (ids.length - index) * 100 }));

export default {
  claudeplan: {
    label: "Claude Pro/Max",
    group: { id: "all", get label() { return t("allProviders"); }, priority: 100 },
    api: "claude-plan",
    protocol: "claude-plan",
    baseUrl: BASE_URL,
    endpoint: `${BASE_URL}/v1/messages`,
    anthropicVersion: "2023-06-01",
    staticModels: STATIC_MODELS,
    listModels, modelOptions,
    requiresApiKey: false,
    auth: {
      label: "Claude",
      get hint() { return t("signInWithYourClaudeAccountToUseClaude"); },
      status: getClaudeAuthStatus, start: startClaudeLogin, poll: pollClaudeLogin, clear: clearClaudeAuth,
    },
    defaultContextWindow: 200000,
  },
} satisfies Readonly<Record<string, ProviderDefinition>>;
