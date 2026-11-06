# Message channels

Status: WeCom and personal WeChat are built into the extension (`src/background/channels/`, settings page in
`src/capabilities/channels/`). `services/channels` is a headless gateway for the same flow through
the MCP bridge.

## Channels in the extension

**Settings → Channels** has one section per channel. Each section has the channel's credentials,
**Receive tasks from …**, **Allow everyone the bot is available to**, and the approval lists.
Every channel keeps its own allowlist, pending senders, and conversations in `_zuri_channels`.

### WeCom

Open **Settings → Channels**, paste the Bot ID and Secret from a WeCom intelligent bot (API mode,
long connection), turn on **Receive tasks from WeCom**, and save. The Background connects to
`wss://openws.work.weixin.qq.com` and keeps the connection while Chrome runs.

- The first person to send a direct message becomes the owner automatically. Group messages never do.
  **Allow everyone the bot is available to** skips approval for every sender; WeCom's "usable
  members" list for the bot is then the only gate, so turn it on only for people you trust.
- A later sender who is not allowed appears under **Waiting for your approval** with the first words of
  their message. Click **Allow** to let them run tasks; **Ignore** removes the entry. The sender gets
  one reply that you were notified.
- Each person has one Session; in a group each member has their own. Group replies quote the first
  20 characters of the question.
- A pending confirmation or single-field form is sent to the chat. Reply `同意` or `拒绝`, or the
  answer. Browser permissions and location consent are handled in the browser.
- The Secret is stored in `chrome.storage.local` under `_zuri_channels`, like the CLI pairing token,
  and the Side Panel never reads it back.
- Messages go through the same Background commands as the CLI (`create_session`, `send_message`,
  `get_session_snapshot`, `respond_to_user_input`).

### WeChat (personal account)

WeChat connects through Tencent's iLink Bot API, the interface behind WeChat's ClawBot. The account
signs in by scanning a QR code, so there is no token to paste.

1. Open **Settings → Channels → WeChat** and click **Scan to log in**.
2. Scan the QR code with WeChat and confirm. The page shows **Logged in** and the connection starts.
3. Send a message to the bot from WeChat.

The account that scanned becomes the first allowed person. Anyone else who messages the bot appears
under **Waiting for your approval**. Text, images, files, and voice messages (as WeChat's transcript)
reach the task. Replies are plain text: Markdown markers are removed, links keep their address, and
text over 2000 characters is split into messages sent 1.5 seconds apart.

- The Background long-polls `getupdates` with a saved cursor, so a message that arrives while the
  worker is asleep is delivered after the next wake-up. Each reply carries the sender's latest
  `context_token`; a stale token is retried once without it.
- When the login expires the status line says to scan again, and polling stops until you do.
- Other failures reconnect after 2 s, and after three in a row every 30 s.
- Group messages are handled when iLink delivers them (a message with a `room_id`): the conversation is
  `group:<room>`, replies go to the room, and each member needs approval. Hermes notes that iLink
  usually does not deliver ordinary group chats to bot accounts, so this is untested against a real
  group; the Background logs `group_message` with the room id (never the text) when one arrives.
- Sending pictures and files back is not implemented; WeChat's CDN needs AES-128-ECB, which WebCrypto
  lacks.
- The QR code is drawn in the page with `qrcode-generator`.

### Add a channel

A channel is one adapter in `src/background/channels/<id>-socket.ts` that exports a `ChannelAdapter`
(`channel-adapter.ts`):

| Member | Purpose |
| --- | --- |
| `id`, `label` | Storage key and session-key prefix; the name used in chat. |
| `fields` | The settings the user fills in. `secret: true` fields are stored and never read back by the page; `optional: true` fields are not needed to connect; `managed: true` fields are filled in by `login` and get no input. |
| `login` | Optional QR sign-in: `start()` returns a `ticket` and the text to draw as a QR code, `poll(ticket)` returns `wait`, `scanned`, `expired`, or `done` with the managed fields and the person who logged in. The settings page then shows a **Scan to log in** button. |
| `createSocket({ fields, state, onMessage, onState })` | Opens the connection. It returns `start`, `send`, `stop`, and optionally `sendMedia`, `sendImageLink`, and `stream`. `state` keeps small strings (a polling cursor) across restarts. |
| `loadImage`, `loadFile`, `fetchMedia` | Optional. Download attachments the platform sent; fetch media to send back. |

The socket turns platform events into a `ChannelMessage`. `conversationId` is opaque to the runtime:
use whatever `send` needs to address the chat (WeCom: `single:<userid>` or `group:<chatid>`). Reconnect,
rate limits, and message splitting belong to the socket. Then:

1. Add the adapter to `channelAdapters` in `service-worker.ts`.
2. Add its id to `CHANNELS` in `src/capabilities/channels/ui.ts`.
3. Add `<id>Title`, `<id>Intro`, `<id>Field_<key>` for each typed field, and optional `<id>Hint_<key>` to
   `src/capabilities/channels/messages.ts`.

The settings form, status, approval flow, session handling, progress, and media delivery come from
the runtime.

A channel lets people start and continue browser tasks from a chat app such as Feishu or Telegram. A message
in a conversation becomes a task, and the task's reply returns to the same conversation.

The design keeps the chat-specific code in one adapter file per platform, so adding Feishu,
Telegram, or Discord adds one file and one config entry.

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
      wecom.mjs           WeCom adapter (WebSocket long connection)
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
    "wecom": {
      "enabled": true,
      "allowFrom": ["HeFei"],
      "requireMention": true
    }
  }
}
```

- `clientId` selects the browser. It is required when several browsers are online.
- `allowFrom` is the sender allowlist. An empty list rejects everyone.
- `requireMention` applies to group conversations. Direct messages always qualify.

Credentials stay out of this file. WeCom reads `WECOM_BOT_ID` and `WECOM_BOT_SECRET` from the
ignored `.env.local`, and the gateway redacts them from logs.

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

## WeCom

Create the bot in the WeCom admin console: **Intelligent bot → Create → API mode → long
connection**. Copy the BotID and Secret into `.env.local`, then start the gateway:

```bash
WECOM_BOT_ID=...
WECOM_BOT_SECRET=...
node services/channels/src/bin.mjs
```

- `conversationId` is `single:<userid>` for a direct chat and `group:<chatid>` for a group. A group
  has no threads, so the gateway keeps one task per sender in a group, and a stuck task never blocks
  another member. Group replies start with a quote of the first 20 characters of the question.
- Only the sender IDs in `allowFrom` run tasks. The console's "usable members" list is a second
  filter in front of it. `userid` is encrypted unless the bot's creator is a super admin; copy the
  value from the gateway's `drop` log line.
- Replies use `aibot_send_msg` (markdown), which works up to 24 hours after the user's last message.
  WeCom allows 30 messages per minute per conversation.
- A bot keeps one connection. A second client with the same BotID disconnects the first, and the
  gateway then stops instead of reconnecting.
- Only text messages run tasks. Other message types get a short "text only" reply.

### Input requests

While a task runs, the gateway checks for a pending request every 4 seconds and sends it to the
conversation once.

| Request | Chat reply |
| --- | --- |
| Confirmation | Reply `同意` or `拒绝`. One reply answers one request. |
| Form with one text or single-choice field | Reply the text, or the option number or label. |
| Browser permission, location consent, other forms | The gateway names the request and asks you to handle it in the browser. |

The answer goes to the sender who started the task. Their reply skips the queue, so it reaches the
waiting task.
