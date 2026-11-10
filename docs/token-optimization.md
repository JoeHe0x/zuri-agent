# Token optimization

The Agent resends the whole context on every model step, so cost grows roughly with the square of
the step count. This guide records the causes, the changes that shipped, and the remaining plan.
Findings come from reading the code; none are measured on a live run yet.

## Causes

| Cause | Where | Effect |
| --- | --- | --- |
| No prompt caching on the Anthropic path | `src/capabilities/provider-anthropic/adapter.ts` | System prompt (about 9k tokens), 45 tool schemas, and history billed at full price each step. |
| Large tool results | `MAX_TOOL_RESULT_CHARS` in `src/background/llm/message-projection.ts` (20000, unchanged) | `get_ax_tree` is 0.8–2.6k tokens (measured). `read_article`, `read_dom`, and Network reads can be larger; they are bounded only by their `limit` argument and this cap. |
| Late trimming of old results | `_pruneOldToolResultsIfNeeded` in `src/background/agent/agent.ts` | It runs in the `finally` of a run, and the latest two user rounds are protected. Inside one run nothing is trimmed, so stale DOM and AX trees stay in context for every step. |
| All tools and prompt sections sent every step | `getToolSchemas` in `src/background/tools/runtime.ts`, `prompts/en.ts` | Fixed overhead of about 23k tokens (measured, see Footprint), mostly unrelated to the task. Tool groups (shipped item 10) cut the tool part by 27%. |
| Compaction tied to the window size | `compaction.ts` | With a large window the context grows to hundreds of thousands of tokens before it shrinks. |

## Analysis: comparison with agent-browser

`agent-browser` (`/mnt/c/Code/agent-browser`) is a CLI that an agent drives through a shell, so its
output is the only thing that enters the context. Its design keeps each step's addition small and
discardable. The table lists what it does and where Zuri differs.

| Area | agent-browser | Zuri before this change |
| --- | --- | --- |
| Page observation default | `snapshot -i` lists interactive elements only; `-c`, `-s <selector>`, `--depth` narrow it (`cli/src/native/snapshot.rs`). | `get_ax_tree` defaults to depth 16, 120 nodes, 40 actions, with no interactive-only mode. |
| Repeated observation | `snapshot --delta` returns the full tree once, then only changes, and falls back to the full tree when the delta exceeds 70% (`native/actions.rs`). | No delta. A small page change re-sends the whole tree. |
| Output cap | `--max-output` truncates and tells the model how to raise it (`output.rs`). | 20000 characters per result, clipped in the middle. |
| Action results | One status line. The model asks for page state when it needs it. | Also small: `pageAfter` carries URL and title only. No change needed. |
| Instruction loading | A 50-line stub; the 258-line core guide and references load on request (`skills get core --ref ...`). | The full system prompt (about 27 KB) and 45 tool schemas on every step. |
| Cost rules in the prompt | "Prefer snapshots. Never screenshot to check that an element exists or the page loaded." Also `screenshot --if-changed`. | The multimodal prompt recommends a screenshot after structural inspection. No rule about its cost. |
| Text without a browser | `read <url>` fetches markdown over HTTP, with `--outline` and `--filter`. | `read_article` needs an open tab. |
| Regression check | `evals/context-footprint.ts` measures bytes and an estimated token count. | The `cache_usage` trace only; no footprint check. |

### Root cause by layer

1. **Timing (largest).** Old results were trimmed only when a run ended. Inside a run every step
   resends every earlier observation, so tokens grow with the square of the step count. The
   existing exception, replacing a result when the same call repeats with identical arguments,
   misses the common case of the same tab read with a different root or limit.
2. **Tool defaults.** Observations are large and have no incremental form. Each one is the biggest
   item in the context.
3. **Flow.** The fixed prefix is resent on every step, and prompt chapters and tools load whether
   or not the task uses them. Prompt caching hides most of this on Anthropic and does nothing for
   providers that do not cache.
4. **Prompt wording (smallest).** Chapter 3 orders the model to inspect with `get_ax_tree`, then
   `read_article`, then `find_elements`, and the visual protocol recommends screenshots. The
   wording nudges toward more observation but does not force it.

Findings come from reading both code bases. Neither is measured on a live run.

## Measured

Measured on 2026-11-10 with the real-Chromium harness in `tests/support/ax-viewport-harness.mjs` on
the fixtures in `tests/fixtures/ax-snapshot/`. Tokens are characters divided by four.

| Fixture | `get_ax_tree` default result | `uid:` references in it | Result with short refs |
| --- | --- | --- | --- |
| books-home | 1,480 | 508 (34%) | 1,055 |
| books-catalogue | 1,104 | 412 (37%) | 759 |
| long-list | 1,295 | 442 (34%) | 925 |
| viewport-dense-form | 2,387 | 496 (21%) | 1,972 |
| pizza-form | 623 | 184 (29%) | 468 |
| viewport-article | 877 | 160 (18%) | 742 |

- The default scope is the viewport and folds omitted regions (`truncated, 209 more`), so one
  observation is small. The `actions` list the tool builds internally is not returned to the model.
- Every node line carries `target=uid:t1.s00001.4`. That reference is 18–37% of the result.
  `agent-browser` uses `@e4`. A short reference form is the largest remaining saving per observation
  and needs the target resolver to expand it against the latest snapshot.
- Per-step cost model, an estimate with a 23k-token prefix and 1.2–2k tokens of history added per
  step: over 20 steps the prefix is 464k input tokens and the history is 228–380k, so the prefix is
  55–67% of the input without caching. With caching the prefix is billed at the read price, and a
  cache miss (a pause longer than five minutes, or a provider without prefix caching) returns it to full
  price.
- Retained images: up to 8 image messages stay in the request (`IMAGE_MESSAGE_RECENT_LIMIT`), and
  `IMAGE_MAX_EDGE` is 2048 pixels. Images are not measured here.
- Resident Skills are injected in full on every step and have no size limit in the code.

## Footprint

`tests/unit/test-context-footprint.mjs` estimates the fixed per-step prefix as characters divided by
four and fails when it grows past a budget. Measured on 2026-11-10 with the English prompt:

| Part | Tokens | Note |
| --- | --- | --- |
| System prompt kernel | about 5,200 | `SYSTEM_PROMPT` without runtime configuration, Skills, or the context snapshot. |
| 45 tool schemas | about 18,000 (32 tools, about 13,100, by default) | Largest: `run_script` 1,227, `data_store` 1,139, `manage_sessions` 1,101, `act_on_screen` 795, `get_ax_tree` 699, `screenshot` 663. |

Tool schemas are three times the system prompt. The Agent defers 13 of the 45 (shipped item 10), so
the default prefix is about 5,300 + 13,100 tokens instead of 5,300 + 18,000.

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

4. **Superseded observations.** A tool with `model.supersedable` (`get_ax_tree`, `read_article`,
   `read_dom`, `find_elements`) replaces its earlier result when the same call with the same arguments
   runs again on the same tab. `_supersedeObservation` in `agent.ts` marks the earlier result `trim`
   at once, so it becomes a placeholder; the cache rewrite covers only the last step. Different roots,
   tabs, and tools are untouched, and the mapping is in memory, so it resets on restart. Plan step 2
   still covers clearing by recent tool calls.
5. **Cache hit rate in the UI.** The context ring tooltip shows `ctx 57k/64k · cache 92%` instead of
   the window percentage. `Agent` sends `cacheHitRate` with each `context_usage` event.

6. **Observation window.** `_sendWindowPruning` keeps the newest three results of `get_ax_tree` and
   `find_elements` (any tab, any arguments) and replaces older ones with the placeholder in batches
   of two. `read_article` and `read_dom` are exempt: they return page content the model may still
   need after it moves to another page.
   It works on the request copy, so stored messages are unchanged, and it applies inside a run,
   where the end-of-run prune does not. The prefix changes once per batch, like image pruning.
7. **Result cap kept at 20000.** An earlier 8000 cap clipped the middle of long articles, so the
   cap stays at 20000 characters, the same as `agent-browser`'s `--max-output` default. A view
   tool's output is far below it, so the cap saves little there.

8. **Screenshot cost rule.** The multimodal prompt tells the model not to take a screenshot only to
   check that an element exists or that a page has loaded (English and Chinese).
9. **Footprint check.** `test-context-footprint.mjs` (see Footprint).

10. **Tool groups.** A tool may declare `group` (`sessions`, `media`, `network`, `browser`; see
    `src/shared/tools/tool-groups.ts`). The Agent's run profile sets `tools.deferGroups`, which
    removes tools of unloaded groups from the schemas, about 4.9k tokens per step. The model calls
    `enable_tools({group})` once; it reuses the `skill.loaded` effect path, so loaded groups persist
    with the session and the cache is rewritten once per load. Calling a deferred tool fails with
    `TOOL_FORBIDDEN_BY_RUN_PROFILE` and a recovery to `enable_tools`. Page tools, tabs, `run_script`,
    `wait_for_user`, and `data_store` stay in the default set. Child sessions start with no groups
    loaded. MCP listings and other callers without `deferGroups` see every tool. Not yet checked with
    a live model: whether it reaches a deferred tool without extra steps.

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

Summarize a saved trace with `node scripts/cache-usage-report.mjs <trace-file>`: it prints the overall hit
rate and the number of steps that rewrote a large part of the cache.

## Checked and not changed

- **Shorter tool descriptions.** `run_script` carries a sample skeleton, the visual-sequence rule, and
  the last-screenshot promotion note. Removing them saves about 400 tokens (2% of the tool schemas),
  but `tests/unit/test-run-script-source.mjs` pins each of them as part of the tool contract. The
  `data_store` parameter descriptions are 8–98 tokens each and carry the required-field rules, so
  they are already compact. `manage_sessions` is large because of its automation fields and is
  available only in root sessions. Grouping, not rewording, is the saving.
- **Short element references.** Replacing `uid:t1.s00001.4` with `@4` saves 15–30% of an observation,
  but the snapshot id in the reference is what rejects a stale target. A short form must be resolved
  against the snapshot it came from, or an old `@4` would act on a different element after a new
  snapshot. Design it together with the resolver and its stale-target tests.

## Plan

Run in order. Check the cache hit rate (see Measuring) before starting steps 2–4. Add to step 1 an
interactive-only mode and a delta mode for `get_ax_tree`, modelled on `snapshot -i` and `--delta`,
and add a prompt rule against screenshots taken only to confirm that an element exists or a page loaded.
Add a footprint check modelled on `evals/context-footprint.ts` before step 3.

1. **Limit tool results at the source (cap stays at 20000, shipped item 7).** Store
   the remainder in a Data table or document and return a prefix, the total length, and a stable
   id. Reuse an existing chunk protocol for paging. Set smaller default node count and depth for
   `get_ax_tree` and `read_dom`.
2. **Clear superseded observations (partly shipped, items 4 and 6).** When a tab has a newer observation (AX tree, DOM,
   screenshot), replace the older one with a placeholder. Clear in batches that free enough tokens to
   pay for one cache rewrite (Anthropic's `clear_at_least`). Count protection in recent tool calls
   instead of user rounds, and lower the 20% / 50% ratios. Keep the URL or id so the observation can
   be fetched again.
3. **Load prompt sections on demand (tools: shipped item 10).** Keep every tool name and schema position fixed in
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
