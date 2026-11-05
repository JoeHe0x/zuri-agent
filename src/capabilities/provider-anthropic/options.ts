import type { ProviderModelOption } from "#sdk/shared/settings";
const all = ["low", "medium", "high", "xhigh", "max"];
// shortcut: reuses Codex's stored key so presets, Settings and the model menu need no second field; rename when a third provider needs effort.
// Levels and defaults follow the Anthropic effort docs; models matching no rule (Haiku 4.5 and older) take no effort.
export const modelOptions = [{
  key: "codexReasoningEffort", label: "Effort", defaultValue: "high",
  options: Object.entries({ low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max" }).map(([value, label]) => ({ value, label })),
  modelRules: [
    { match: "^claude-(opus|haiku)-5-5", values: all, defaultValue: "medium" },
    { match: "^claude-(fable|mythos|opus|sonnet|haiku)-5|^claude-opus-4-[78]", values: all },
    { match: "^claude-(opus|sonnet)-4-6", values: ["low", "medium", "high", "max"] },
    { match: "^claude-opus-4-5", values: ["low", "medium", "high"] },
  ],
}] satisfies readonly ProviderModelOption[];
