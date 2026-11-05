import { CLAUDE_PLAN_MODELS, claudePlanLimits } from "./model-ids.js";
import type { ModelCapabilityContribution } from "#sdk/shared/models";

export default { official: { claudeplan: {
  providerId: "claudeplan",
  providerLabel: "Claude Pro/Max",
  source: "zuri-claude-plan-provider-metadata",
  models: CLAUDE_PLAN_MODELS
    .map(id => { const { contextWindow, maxOutputTokens } = claudePlanLimits(id); return { id, contextWindow, maxOutputTokens, vision: true }; }),
} } } satisfies ModelCapabilityContribution;
