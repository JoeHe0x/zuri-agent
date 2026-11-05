# Message channels

Status: design. Nothing in this document is implemented yet.

A channel lets people start and continue browser tasks from a chat app such as Slack. A message
in a conversation becomes a task, and the task's reply returns to the same conversation.

The first channel is Slack. The design keeps the chat-specific code in one adapter file per
platform, so adding Feishu, WeCom, Telegram, or Discord adds one file and one config entry.

## Scope

- Runs on the machine that has the browser, next to the local service. Tasks use the browser's
  existing logins.
- Talks to the browser only through the [MCP bridge](../services/mcp-bridge/README.md) at
  `http://127.0.0.1:18765/mcp`. It does not touch the extension or its storage.
- Each adapter uses an outbound connection (Slack Socket Mode, Feishu WebSocket, Telegram long
  polling), so the machine needs no public URL.

Out of scope for the first version: file and image upload, streaming partial replies, group
administration commands, and pairing codes for unknown senders.

## Layout

```
services/channels/
  package.json            dependencies: MCP SDK; adapter SDKs as optionalDependencies
  src/
    bin.mjs               entry: load config, start gateway
    gateway.mjs           routes inbound messages to tasks and replies to adapters
    bridge.mjs            MCP client wrapper for the zuri_* tools
    access.mjs            sender allowlist and mention rules per channel
    store.mjs             conversation -> task mapping, persisted as JSON
    config.mjs            read channels.json and .env.local
    adapters/
      index.mjs           adapter registry: id -> dynamic import
      slack.mjs           Slack adapter (Bolt, Socket Mode)
```

`services/` keeps independent processes, so this package sits beside `mcp-bridge` and depends
only on the bridge's public MCP tools.

## Adapter contract

An adapter converts one platform to and from a common message shape. It owns the platform SDK,
authentication, event de-duplication, and text formatting. It does not know about tasks.

```js
// adapters/<id>.mjs
export default function createAdapter(config, env) {
  return {
    id: "slack",
    // Call onMessage for every user message. Resolve when the connection is ready.
    async start(onMessage) {},
    // Post text to a conversation. The adapter splits text that exceeds the platform limit.
    async send(conversation, text) {},
    async stop() {},
  };
}
```

Inbound message:

| Field | Meaning |
| --- | --- |
| `channel` | Adapter id, such as `slack`. |
| `conversationId` | Stable key for one thread or chat. Slack: `<channel>:<thread_ts>`. Telegram: chat ID. |
| `messageId` | Platform message ID. The gateway drops repeats, which Slack retries send. |
| `senderId` | Platform user ID, compared against the allowlist. |
| `text` | Message text with the bot mention removed. |
| `direct` | `true` for a one-to-one chat. |
| `mentioned` | `true` when the message addresses the bot. |

`conversation` passed to `send` is the same `{ channel, conversationId }` pair, so a reply
returns to the thread it came from.

A new platform follows this checklist:

1. Create `adapters/<id>.mjs` with the contract above.
2. Register it in `adapters/index.mjs`.
3. Add a `channels.<id>` entry to `channels.json` and its credentials to `.env.local`.
4. Add the platform SDK to `optionalDependencies`. The registry loads an adapter with a dynamic
   `import()`, so unused platforms need no installed SDK.

## Gateway flow

For each inbound message the gateway runs these steps in order:

1. **Filter.** Drop a repeated `messageId`. Drop messages from senders outside the channel's
   allowlist. In a group, drop messages that do not mention the bot.
2. **Serialize.** Queue the message behind earlier messages of the same
   `channel:conversationId`. Different conversations run in parallel.
3. **Resolve the task.** Look up the conversation in the store.
   - No task: call `zuri_create_session` with `firstMessage` and a title, then store the
     returned session ID.
   - Task exists: call `zuri_send_message` with the session ID and `clientMessageId` set to
     `messageId`, so a repeated delivery does not send twice.
4. **Wait.** Pass `wait: true` and a `waitTimeoutSeconds` so the call returns with a snapshot.
5. **Reply.** Send the last assistant text from the snapshot to the conversation. When the
   timeout expires, send a short "still working" note. The next message in the conversation
   continues the same task.
6. **Input requests.** When the snapshot reports a pending question or permission, send the
   question to the conversation and mark the conversation as waiting. The next message from an
   allowed sender goes to `zuri_respond_to_user_input` instead of `send_message`.

The gateway holds no task state beyond the store. The Background service owns tasks; the
store only remembers which task belongs to which conversation.

## Store

One JSON file, `~/.zuri-agent/channels/conversations.json`, mode `600`, versioned
(`{ "version": 1, "conversations": { "<channel>:<conversationId>": { "sessionId", "clientId",
"waitingInput", "updatedAt" } } }`). Writes go to a temporary file and rename into place. If a
task no longer exists, the bridge returns a not-found error and the gateway starts a new task for
the conversation.

## Configuration

`channels.json` in the config directory:

```json
{
  "bridge": { "url": "http://127.0.0.1:18765/mcp", "clientId": "" },
  "waitTimeoutSeconds": 600,
  "channels": {
    "slack": {
      "enabled": true,
      "allowFrom": ["U012ABCDEF"],
      "requireMention": true
    }
  }
}
```

- `clientId` selects the browser. It is required when several browsers are online.
- `allowFrom` is the sender allowlist. An empty list rejects everyone.
- `requireMention` applies to group conversations. Direct messages always qualify.

Credentials stay out of this file. Slack reads `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` from the
ignored `.env.local`, and the gateway redacts them from logs. `.env.example` lists the names with
empty values.

## Security

- The bridge has no authentication. It accepts connections on loopback only and rejects requests
  that carry an `Origin` header. The gateway is the access boundary for chat users.
- The allowlist is the only authorization. A sender who passes it can drive the browser with the
  user's logins, so keep it to the owner and trusted teammates.
- Slack Socket Mode and similar outbound transports avoid exposing a port. Do not add an inbound
  webhook listener without request signature verification.
- Log sender ID, channel, and task ID. Keep message text and replies out of default logs.

## Delivery plan

1. **Slack, text only.** Gateway, bridge wrapper, store, allowlist, one adapter. Verify by sending a
   direct message and a thread reply.
2. **Input requests.** Question and permission round trips through the thread.
3. **Second channel.** Feishu or Telegram, to confirm the adapter contract needs no gateway
   change. A change to the contract at this point means the contract was wrong.
4. **Later.** Pairing codes for unknown senders, file and image replies, and progress updates.

## Tests

- Gateway unit tests use a fake adapter and a fake bridge: new conversation creates a task,
  second message continues it, repeated `messageId` sends once, disallowed sender is dropped,
  timeout sends the wait note, a missing task creates a new one.
- Store tests cover versioned reads, atomic writes, and a corrupt file.
- The Slack adapter test covers mention stripping and `conversationId` for DMs, channel
  messages, and thread replies, with the Bolt client replaced by a stub.

## Open questions

- The snapshot field that holds the final assistant text. Read it from a real `create_session`
  result before writing the extraction code.
- Whether two tasks in different sessions run in parallel in one browser. The bridge has no
  global queue; the extension's behavior is unverified.
- How a pending input request appears in the snapshot. `zuri_get_user_input` returns the
  form; the exact shape decides how the gateway renders a question in chat.
- The bridge tools and CLI still use the `zuri_*` and `zuri` names. The gateway keeps the tool
  names in `bridge.mjs` so a rename touches one file.
