<p align="center">
  <img src="src/icons/icon128.png" alt="Zuri logo" width="80" height="80">
</p>
<h1 align="center">Zuri</h1>

Zuri is an open-source browser agent that runs as a Chrome extension. Describe a task in one
sentence, and it works in the sites you are already signed in to, extracts data, and returns tables,
files, or reports with sources. It works with the model provider you choose, using your own API key.
Task data stays in your browser and is sent only to that provider. See
[Privacy and browser permissions](docs/permissions.md) for what the extension reads and where it goes.

## Install

Install Node.js 24 LTS and npm, then build the extension from the repository root:

```bash
npm ci
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select `dist/extension/`.
3. Click the Zuri icon in the toolbar to open the side panel.
4. Open **Settings**, choose a model provider, enter its API key, and save.

After you change the source, run `npm run build` again and reload the extension on
`chrome://extensions`.

## Changes

**Chat and composer**

- Floating ball launcher, switchable in Settings.
- `@tab` mentions, with the current tab shared by default. Shared tabs, picked page elements (with a
  thumbnail) and Skills appear as chips in the composer. Pasted images show above the input.
- Slash menu with grouped rows and icons, `/new` and `/clear`, and Skills pinned first. The plus menu
  picks individual Skills and opens Skills, Data and History.
- Model menu in the composer that lists every provider's models with vendor icons and friendly names.
- Context usage ring. Click it to see the context composition and the cache hit rate of each request.
- Page-specific suggestions on the landing screen and follow-up suggestions after each reply, in the
  UI language.
- Data tables open from artifact cards in a sheet over the chat. Blank chats are hidden from History.
- Inverse-colored tooltips and a gradient chat surface.

**Providers and context**

- Claude Pro/Max sign-in provider with account model discovery.
- Magpie gateway with discovered model capabilities, and model discovery for custom providers that
  keeps each provider's credentials isolated.
- Anthropic prompt caching, batched image pruning for a stable prompt prefix, and a `cache_usage` trace.
- Superseded page observations are replaced at once.

**Skills**

- Built-in `find-skills`, `task-retrospective` and `site-memory` Skills. `site-memory` keeps and
  corrects per-site notes through `skill-workbench`.
- Skills resolve by exact id. An ambiguous display name is rejected, and truncated ids stay distinct.

**Reliability and Firefox**

- Fill, click and key-press reports state whether the page received the input.
- Sessions report cumulative token usage.
- Firefox keeps a pending navigation when a load is replaced, and file downloads use blob URLs.

**CLI**

- Pair several browser profiles with one CLI. `zuri connect --no-open --name work --json` prints a
  connection URL for a specific profile, `zuri browsers` lists the paired browsers, and
  `--client work` selects one when several are online.
- Connection state tolerates Windows filesystem races.

## License

Apache-2.0. See [LICENSE](LICENSE).

Forked from [alibaba/qz-browser-agent](https://github.com/alibaba/qz-browser-agent).
