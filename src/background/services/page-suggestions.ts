import { getLanguage } from "../../shared/i18n/index.js";
import { getSecurityGuardrails, matchBlockedUrl } from "../../shared/security-guardrails.js";
import { isWebTabUrl } from "../../shared/tab-utils.js";

import type { ModelMessage } from "../../shared/contracts/model-message.js";

const TEXT_LIMIT = 1500;
const CACHE_LIMIT = 50;

interface PageSuggestionsOptions {
  tabs?: Pick<typeof chrome.tabs, "get">;
  scripting?: Pick<typeof chrome.scripting, "executeScript">;
  getRuntimeConfig(): Promise<unknown>;
  llmChat(messages: ModelMessage[], tools: unknown[], signal: undefined, options: Record<string, unknown>): Promise<{ message?: { content?: unknown } }>;
  buildMessages(page: { title: string; url: string; text: string }, avoid: string[]): ModelMessage[];
  buildFollowUpMessages(conversation: { user: string; assistant: string }, avoid: string[]): ModelMessage[];
}

/** Model-generated prompt suggestions for a tab, cached per URL. Blocked and non-web pages yield none. */
export function createPageSuggestions({
  tabs = globalThis.chrome?.tabs,
  scripting = globalThis.chrome?.scripting,
  getRuntimeConfig,
  llmChat,
  buildMessages,
  buildFollowUpMessages,
}: PageSuggestionsOptions) {
  const cache = new Map<string, string[]>();

  async function suggest(tabId: unknown, exclude: unknown = [], conversation?: { user?: unknown; assistant?: unknown }): Promise<string[]> {
    const avoid = (Array.isArray(exclude) ? exclude : []).filter((item): item is string => typeof item === "string").slice(0, 12).map(item => item.slice(0, 80));
    if (conversation) {
      // Follow-ups depend on the last exchange only, so they skip the page, its guardrails and the cache.
      const { message } = await llmChat(buildFollowUpMessages({ user: String(conversation.user || "").slice(0, TEXT_LIMIT), assistant: String(conversation.assistant || "").slice(0, TEXT_LIMIT) }, avoid), [], undefined, {
        sessionId: "page-suggestions:follow-up",
        config: await getRuntimeConfig(),
        rateLimit: false,
      });
      return parse(message?.content);
    }
    const tab = await tabs.get(Number(tabId)).catch(() => null);
    const url = tab?.url || "";
    if (!tab?.id || !isWebTabUrl(url) || matchBlockedUrl(url, await getSecurityGuardrails())) return [];
    // The suggestion language follows Settings, so a language change must not reuse older entries.
    const key = `${getLanguage()}\n${url}`;
    const cached = avoid.length ? null : cache.get(key);
    if (cached) return cached;
    const [frame] = await scripting.executeScript({
      target: { tabId: tab.id },
      func: limit => String((globalThis as { document?: { body?: { innerText?: string } } }).document?.body?.innerText || "").replace(/\s+/gu, " ").trim().slice(0, limit),
      args: [TEXT_LIMIT],
    }).catch(() => []);
    const { message } = await llmChat(buildMessages({ title: tab.title || "", url, text: String(frame?.result || "") }, avoid), [], undefined, {
      sessionId: `page-suggestions:${tab.id}`,
      config: await getRuntimeConfig(),
      rateLimit: false,
    });
    const suggestions = parse(message?.content);
    if (suggestions.length) {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(key, suggestions);
    }
    return suggestions;
  }

  return { suggest };
}

export function parse(content: unknown): string[] {
  const match = String(content || "").match(/\[[\s\S]*\]/u);
  try {
    const list = match ? JSON.parse(match[0]) : [];
    return Array.isArray(list) ? list.filter(item => typeof item === "string" && item.trim()).map(item => item.trim().slice(0, 80)).slice(0, 3) : [];
  } catch {
    return [];
  }
}
