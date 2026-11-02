import assert from "node:assert/strict";
import test from "node:test";

import { cacheStatsFromUsage } from "../../src/background/llm/token-accounting.js";

test("cache stats cover Anthropic, OpenAI and empty usage shapes", () => {
  assert.deepEqual(cacheStatsFromUsage({ input_tokens: 100, cache_read_input_tokens: 800, cache_creation_input_tokens: 100 }), { input: 1000, read: 800, write: 100 });
  assert.deepEqual(cacheStatsFromUsage({ prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 640 } }), { input: 1000, read: 640, write: 0 });
  assert.deepEqual(cacheStatsFromUsage(null), { input: 0, read: 0, write: 0 });
});
