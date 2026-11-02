import type { ModelCapabilityContribution } from "#sdk/shared/models";

export default { official: { claudeplan: {
  providerId: "claudeplan",
  providerLabel: "Claude Pro/Max",
  source: "qz-claude-plan-provider-metadata",
  models: ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]
    .map(id => ({ id, contextWindow: 200000, maxOutputTokens: 64000, vision: true })),
} } } satisfies ModelCapabilityContribution;
