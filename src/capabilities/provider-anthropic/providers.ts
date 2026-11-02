import { chatAnthropic, chatStreamAnthropic } from "./adapter.js";
import { chatClaudePlan, chatStreamClaudePlan } from "./claude-plan.js";
import type { ProviderAdapter } from "#sdk/background/providers";
export default {
  "anthropic": { label: "Anthropic", chat: chatAnthropic, chatStream: chatStreamAnthropic },
  "claude-plan": { customProvider: false, chat: chatClaudePlan, chatStream: chatStreamClaudePlan },
} satisfies Readonly<Record<string, ProviderAdapter>>;
