# Token optimization

The Agent resends the whole context on every model step, so cost grows roughly with the square of
the step count. This guide records the causes, the changes that shipped, and the remaining plan.
Findings come from reading the code; none are measured on a live run yet.

## Causes

| Cause | Where | Effect |
| --- | --- | --- |
| No prompt caching on the Anthropic path | `src/capabilities/provider-anthropic/adapter.ts` | System prompt (about 9k tokens), 65+ tool schemas, and history billed at full price each step. |
| Large tool results | `MAX_TOOL_RESULT_CHARS = 20000` in `src/background/llm/message-projection.ts` | One page observation is 5–14k tokens, resent on every later step. |
| Late trimming of old results | `_pruneOldToolResultsIfNeeded` in `src/background/agent/agent.ts` | Old results are protected up to 20% of the compaction threshold and trimmed only at run end. Stale DOM and AX trees stay in context. |
| All tools and prompt sections sent every step | `getToolSchemas` in `src/background/tools/runtime.ts`, `prompts/en.ts` | Fixed overhead of 10k+ tokens, mostly unrelated to the task. |
| Compaction tied to the window size | `compaction.ts` | With a large window the context grows to hundreds of thousands of tokens before it shrinks. |

## Shipped

1. **Prompt caching.** The Anthropic adapter adds `cache_control: ephemeral` to the last tool, the
   last system block, and the last block of the last message (3 of the 4 allowed breakpoints).
   Thinking blocks are skipped.
2. **Stable request prefix.** Image history used to slide by one message per new image, which
   changed the prefix on every step. Images now become placeholders in batches of four
   (`IMAGE_PRUNE_BATCH`), so a request keeps between 5 and 8 image-bearing messages and the prefix
   changes once per batch.

3. **Cache hit-rate trace.** Every model call writes a `cache_usage` trace line with `input`, `read`,
   `write`, and `hitRate` (`read / input`). It reads Anthropic, Codex, and OpenAI usage shapes through
   `cacheStatsFromUsage` in `src/background/llm/token-accounting.ts`.

Scope by provider: only item 1 is Anthropic-specific. It covers the `anthropic` protocol, which
includes Kimi Code. OpenAI-compatible endpoints (OpenAI, DeepSeek, Fireworks, and similar) cache an
identical prefix automatically and take no markers; Codex already sends `prompt_cache_key`. Items 2
and 3 apply to every provider. The plan steps below are provider-neutral, except that "clear in
batches" is a cost rule only for providers that cache by prefix. Gemini CLI caching is not checked.

Context and goal capsules are appended to history and do not change earlier messages, so they
need no change. Loading a Skill adds tools at the end of the tool list, which invalidates the
cache once per load.

## Measuring

Run a multi-step task and read the `cache_usage` lines in the trace. The first call of a run writes
the cache (`write` high, `hitRate` near 0); later calls should show a `hitRate` above 0.8. A low rate
points to unstable prefix content, such as Skill list order or system prompt text. The UI does not
show the rate yet, and the session codec drops OpenAI `prompt_tokens_details`, so only the trace has it.

## Plan

Run in order. Check the cache hit rate (see Measuring) before starting steps 2–4.

1. **Limit tool results at the source.** Lower the default cap to about 4000–6000 characters. Store
   the remainder in a Data table or document and return a prefix, the total length, and a stable
   id. Reuse an existing chunk protocol for paging. Set smaller default node count and depth for
   `get_ax_tree` and `read_dom`.
2. **Clear superseded observations.** When a tab has a newer observation (AX tree, DOM,
   screenshot), replace the older one with a placeholder. Clear in batches that free enough tokens to
   pay for one cache rewrite (Anthropic's `clear_at_least`). Count protection in recent tool calls
   instead of user rounds, and lower the 20% / 50% ratios. Keep the URL or id so the observation can
   be fetched again.
3. **Load tools and prompt sections on demand.** Keep every tool name and schema position fixed in
   the request prefix, because a changed tool list invalidates the whole cache. Defer the full
   description of rarely used tools and append it to the messages when the model asks for it, as
   Anthropic's tool search does. Expose about 3–5 frequent tools in full. Reuse `load_skill` and
   `isSkillToolActive`. Inject prompt chapters 4, 5, 6, and 8 only when triggered, also by appending.
   List Skills by name and one line.
4. **Compact earlier and cheaper.** Use a smaller model for the summary if the current code reuses
   the main model. An absolute soft limit (60–80k tokens) independent of the window has no source
   behind it; add it only if measurements justify it.
5. **Isolate large reads in child Sessions.** Anthropic's sub-agent pattern returns a 1,000–2,000
   token summary to the main context. This is the roadmap entry "Sub-agents and parallel tabs".

Steps 2 and 3 change what the model sees. Cover them with E2E tasks to confirm the model does not
take extra steps because of missing context.

## Verification status

- Typecheck and the `provider` and `llm` unit suites pass.
- Not run: `test-context-compaction.mjs` (needs Node 24; the local Node 26 rejects
  `stripTypeScriptTypes` mode `transform`), the E2E suite, and any request against a real API.
- The updated E2E expectation for the ninth screenshot (5 retained, 4 placeholders) comes from
  arithmetic, not from a run.

## Sources

Checked on 2026-10-30. Primary sources:

- [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): at most 4
  breakpoints; each checks 20 positions back; prefix order is tools, system, messages, and a change at
  one level invalidates it and all later levels; minimum cacheable length is 512–4096 tokens by
  model; default TTL is 5 minutes (refreshed on each hit), with a 1-hour option at 2x write price.
  Long pauses between steps, such as waiting for the user, can let the 5-minute entry expire.
- [Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing):
  `clear_tool_uses` clears the oldest tool results past a `trigger` and keeps the latest `keep`
  (default 3). Clearing invalidates the cached prefix, so `clear_at_least` makes sure each clear is
  worth the rewrite.
- [Tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool):
  deferred tools stay out of the prefix and are added inline as `tool_reference` blocks, so the
  prefix and cache are untouched. Recommended above 10 tools or 10k tokens of definitions.
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents):
  tool result clearing is "one of the safest lightest touch forms of compaction"; sub-agents return a
  distilled summary of about 1,000–2,000 tokens; agents keep lightweight identifiers and load data
  just in time.
- [Context Engineering for AI Agents: Lessons from Building Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus):
  KV-cache hit rate is the key production metric; keep the prefix stable (no timestamp at the top);
  keep context append-only; serialize deterministically (JSON key order); do not add or remove tools
  mid-task; make compression restorable by keeping the URL or path.

Secondary sources, not confirmed against official documentation:

- Claude Code caps MCP tool output at 25,000 tokens by default (`MAX_MCP_OUTPUT_TOKENS`). Sources
  disagree on whether the excess is truncated or written to a file
  ([Claude Code MCP runtime notes](https://github.com/xsyetopz/claudetto/wiki/Claude-Code-MCP-Runtime)).
- Playwright MCP returns accessibility snapshots after actions and one write-up reports that old
  snapshots accumulate
  ([Why does Playwright MCP use so many tokens?](https://itnext.io/why-does-playwright-mcp-use-so-many-tokens-da56b6dbd2db)).
  Whether it has an incremental mode by default is not confirmed.

## Checks to run against these sources

- Serialization must be deterministic. Check that tool schema JSON and Skill list order do not vary
  between calls.
- Our tool-result cap (20,000 characters) is far below Claude Code's 25,000 tokens, but one
  observation is still large because it is resent every step; the plan's step 1 addresses that.
