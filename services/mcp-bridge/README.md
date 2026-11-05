# zuri

An open-source browser agent for humans and coding agents.

zuri is a local-first extension for Chrome and Edge.
People use it from the side panel; agents such as Claude Code, Codex, and pi hand it web tasks
through this CLI or MCP. zuri works in your own browser, with your existing logins, and returns
tables, files, or reports with sources. Everything runs locally, and your data goes only to the
model you choose.

[Website](https://alibaba.github.io/qz-browser-agent/) ·
[GitHub](https://github.com/alibaba/qz-browser-agent) ·
[Chrome Web Store](https://chromewebstore.google.com/detail/dknbdgkgoinlgjpfebapkklbmjjgdblm) ·
[Full CLI and MCP reference](https://github.com/alibaba/qz-browser-agent/blob/main/docs/cli.md)

![A coding agent handing a GitHub research task to zuri](https://raw.githubusercontent.com/alibaba/qz-browser-agent/main/docs/images/examples/en/pi-delegate-en.gif)

## Quick start

Requires Node.js 22 or later.

1. **Install the extension.** Click **Add to Chrome** on the
   [Chrome Web Store](https://chromewebstore.google.com/detail/dknbdgkgoinlgjpfebapkklbmjjgdblm),
   open the zuri side panel, and choose a provider and model in **Settings**.
2. **Connect.** This starts the local service and pairs automatically with your default browser.

   ```bash
   npx zuri-agent@latest connect
   ```

3. **Run your first task.**

   ```bash
   npx zuri-agent@latest create "Find this year's Nobel Prize winners in every category and put them in a table with source links." --stream
   ```

   `--stream` shows progress, any questions zuri needs you to answer, and the final result.

For regular use, install the `zuri` command globally and use it in place of
`npx zuri-agent@latest`:

```bash
npm install --global zuri-agent@latest
zuri --version
```

To let your agent learn when and how to use zuri, install the Skill with
`npx skills add alibaba/qz-browser-agent -g`.

## Connect an MCP client

After `connect`, print the MCP URL:

```bash
npx zuri-agent@latest mcp
```

The default is `http://127.0.0.1:18765/mcp`; use the URL your command prints if the port differs.

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.zuri]
url = "http://127.0.0.1:18765/mcp"
```

**Claude Code**:

```bash
claude mcp add --transport http zuri http://127.0.0.1:18765/mcp
```

**Clients with an `mcpServers` JSON config**, such as Cursor:

```json
{
  "mcpServers": {
    "zuri": { "url": "http://127.0.0.1:18765/mcp" }
  }
}
```

CLI and MCP share the same browser connection. The MCP tool list is in the
[reference](https://github.com/alibaba/qz-browser-agent/blob/main/docs/cli.md#task-and-resource-operations).

## Common commands

| Command | What it does |
| --- | --- |
| `zuri connect` | Start the local service and pair a browser |
| `zuri status` | Check the connection and service address |
| `zuri browsers` | List paired browsers, or `forget` an offline one |
| `zuri create "PROMPT"` | Start a task; add `--stream` or `--wait` to follow it |
| `zuri send TASK_ID "MESSAGE"` | Send a follow-up, or `--steer` the current run |
| `zuri tasks` | List tasks |
| `zuri show TASK_ID` | Read a task's status, response, or pending question |
| `zuri watch TASK_ID` | Follow a task until its work and queued messages finish |
| `zuri submit` / `approve` / `reject` | Answer a question or permission request |
| `zuri cancel TASK_ID` | Stop a task |
| `zuri data` | List, export, or delete data tables |
| `zuri images` | List, export, or delete image collections |
| `zuri skills` | Find, read, or export Skills |
| `zuri settings` | Read or update settings |
| `zuri automations` | List or run automations |
| `zuri stop` | Stop the local service and disconnect all browsers |

With several browser profiles connected, choose one with `--client NAME|UUID` (or `-c`).
Run `zuri COMMAND --help` for options. Interactive terminals show readable text; pipes receive JSON.

`watch`, `--wait`, and `--stream` follow the same task across runs until its current work and
accepted follow-ups and steering messages have completed and its queues are empty. Questions
and permission requests keep observation open. Task failure or stopping ends observation.
Timeout or Ctrl-C ends observation while the browser task continues; execute the returned
`watch` command with the same task ID and browser UUID to resume. Observation never resends messages.

## Privacy and local access

The service accepts connections only on your computer, and ordinary websites cannot use its MCP
endpoint. Local programs can control connected zuri tasks while the service is running. `zuri stop`
disconnects all browsers and MCP clients; tasks already running in the browser keep going.
Connection settings are stored in `~/.zuri-agent/run/`, and pairing credentials never
leave your computer.

## Reference

See the [zuri CLI and MCP reference](https://github.com/alibaba/qz-browser-agent/blob/main/docs/cli.md)
for pairing a specific browser profile, Windows PowerShell notes, updates, task responses,
exports, output formats, exit codes, and the MCP tool mapping.

## License

[Apache-2.0](https://github.com/alibaba/qz-browser-agent/blob/main/LICENSE)
