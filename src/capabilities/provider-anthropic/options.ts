import type { ProviderModelOption } from "#sdk/shared/settings";
// shortcut: reuses Codex's stored key so presets, Settings and the model menu need no second field; rename when a third provider needs effort.
export const modelOptions = [{
  key: "codexReasoningEffort", label: "Effort", defaultValue: "high",
  options: Object.entries({ low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max" }).map(([value, label]) => ({ value, label })),
}] satisfies readonly ProviderModelOption[];
