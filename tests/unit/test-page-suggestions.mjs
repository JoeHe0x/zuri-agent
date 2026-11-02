import assert from "node:assert/strict";
import { pageSuggestionKeys } from "../../src/sidepanel/features/chat/page-suggestions-feature.js";

assert.equal(pageSuggestionKeys("https://mail.google.com/mail/u/0/")[0], "suggestMailRecent");
assert.equal(pageSuggestionKeys("https://www.youtube.com/watch?v=1")[0], "suggestVideoSummary");
assert.equal(pageSuggestionKeys("https://example.com/")[0], "suggestSummarizePage");
assert.equal(pageSuggestionKeys("not a url")[0], "suggestSummarizePage");
assert.equal(pageSuggestionKeys("https://www.weee.com/en/product/Rice/2071")[0], "suggestWeeeRecipe");
assert.equal(pageSuggestionKeys("https://www.weee.com/category/sale")[0], "suggestWeeeDeals");

const { parse } = await import("../../src/background/services/page-suggestions.js");
assert.deepEqual(parse('Sure: ["a", " b ", 3, "", "c", "d"]'), ["a", "b", "c"]);
assert.deepEqual(parse("not json"), []);
assert.deepEqual(parse('["broken'), []);

const { createPageSuggestions } = await import("../../src/background/services/page-suggestions.js");
{
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const calls = [];
  const { suggest } = createPageSuggestions({
    ready: () => gate,
    getRuntimeConfig: async () => ({}),
    llmChat: async () => { calls.push("chat"); return { message: { content: '["a"]' } }; },
    buildMessages: () => [],
    buildFollowUpMessages: () => [],
  });
  const pending = suggest(1, [], { user: "u", assistant: "a" });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(calls, [], "no model call before the language is ready");
  release();
  assert.deepEqual(await pending, ["a"]);
  assert.deepEqual(calls, ["chat"]);
}
