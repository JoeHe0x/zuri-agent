import { t } from "./i18n.js";
import type { ProviderDefinition } from "#sdk/background/providers";
import { clearClaudeAuth, getClaudeAuthStatus, pollClaudeLogin, startClaudeLogin } from "./auth.js";
import { CLAUDE_PLAN_MODELS, claudePlanLimits } from "./model-ids.js";
import { listModels } from "./models.js";
import { modelOptions } from "./options.js";

const BASE_URL = "https://api.anthropic.com";

const STATIC_MODELS = CLAUDE_PLAN_MODELS
  .map((id, index, ids) => ({ id, ownedBy: `Claude Pro/Max · ${claudePlanLimits(id).label} · image`, priority: (ids.length - index) * 100 }));

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
