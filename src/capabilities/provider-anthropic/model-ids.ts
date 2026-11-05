/** Packaged fallback, newest first; account discovery below replaces it when it succeeds. */
export const CLAUDE_PLAN_MODELS = [
  "claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5",
  "claude-fable-5", "claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7",
  "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5",
];

/** Generation 5 serves its full 1M window on subscriptions without the long-context beta; earlier models stay at 200K (oh-my-pi's Anthropic policy). */
export const claudePlanLimits = (id: string) => /^claude-(fable|mythos|opus|sonnet|haiku)-5/.test(id)
  ? { contextWindow: 1000000, maxOutputTokens: 128000, label: "1M" }
  : { contextWindow: 200000, maxOutputTokens: 64000, label: "200K" };
