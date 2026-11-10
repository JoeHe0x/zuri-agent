import assert from "node:assert/strict";
import { test } from "node:test";
import { createChannelRuntime, describeInput } from "../../src/background/channels/channel-runtime.js";
import { createChannelStorage, normalizeRecord, normalizeRoot } from "../../src/background/channels/channel-store.js";
import { createHash } from "node:crypto";
import { md5 } from "../../src/background/channels/md5.js";
import { chunks, createWecomSocket, fetchWecomMedia, loadWecomFile, loadWecomImage, wecomAdapter } from "../../src/background/channels/wecom-socket.js";

const WECOM = { id: wecomAdapter.id, label: wecomAdapter.label, fields: wecomAdapter.fields };
const createChannelStore = storage => createChannelStorage(storage)("wecom");

const memory = () => { const data = {}; return { get: async key => ({ [key]: structuredClone(data[key]) }), set: async values => { Object.assign(data, structuredClone(values)); } }; };
const flush = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));
const message = (over = {}) => ({ messageId: "m1", senderId: "u1", conversationId: "single:u1", direct: true, text: "你好", supported: true, ...over });

function setup({ snapshots, dispatch, burstMs = 0, suggest, idleMs, graceMs } = {}) {
  const calls = [], sent = [];
  let handlers;
  const store = createChannelStore(memory());
  const snapshotFor = clientMessageId => ({ status: "completed", runtime: {}, transcript: [{ type: "user", clientMessageId }, { type: "assistant", content: [{ type: "text", text: "完成" }] }] });
  const runtime = createChannelRuntime({ ...WECOM,
    store, pollMs: 5, waitTimeoutMs: 400, burstMs, suggest, idleMs, graceMs,
    loadImage: async () => ({ dataUrl: "data:image/png;base64,AA==", type: "image/png", name: "a.png" }),
    loadFile: async file => ({ base64: "AQID", name: file.name, mimeType: "application/pdf", size: 3 }),
    createSocket: options => { handlers = options; return { start: async () => options.onState("connected"), send: async (to, text) => { sent.push([to, text]); }, stop() {} }; },
    dispatch: async ({ method, params }) => {
      calls.push([method, params]);
      if (dispatch) { const result = await dispatch(method, params); if (result !== undefined) return result; }
      if (method === "create_session") return { session: { id: "s1" } };
      if (method === "send_message") return { accepted: true, clientMessageId: params.clientMessageId };
      if (method === "get_session_snapshot") return (snapshots || snapshotFor)(calls.findLast(call => call[0] === "send_message")[1].clientMessageId);
      return {};
    },
  });
  return { runtime, store, calls, sent, emit: over => handlers.onMessage(message(over)), state: (...args) => handlers.onState(...args) };
}
const enable = async (runtime, allowed = ["u1"]) => {
  await runtime.saveConfig({ enabled: true, fields: { botId: "b", secret: "s" } });
  for (const id of allowed) await runtime.approve(id);
};

test("a QR login saves the managed fields, allows the person who scanned, and starts the connection", async () => {
  const storage = createChannelStorage(memory());
  const made = [];
  let step = { status: "wait" };
  const adapter = { id: "weixin", label: "微信", fields: [{ key: "token", secret: true, managed: true }, { key: "accountId", managed: true }, { key: "baseUrl", optional: true, managed: true }],
    login: { start: async () => ({ ticket: "t1", qr: "https://qr" }), poll: async ticket => ({ ...step, ticket: ticket + "!" }) } };
  const runtime = createChannelRuntime({ ...adapter, store: storage("weixin"), burstMs: 0, dispatch: async () => ({}),
    createSocket: options => { made.push(options); return { start: async () => options.onState("connected"), send: async () => {}, stop() {} }; } });
  assert.deepEqual(await runtime.loginStart(), { ticket: "t1", qr: "https://qr" });
  assert.deepEqual(await runtime.loginPoll("t1"), { status: "wait", ticket: "t1!" });
  assert.equal((await runtime.status()).state, "disabled");
  step = { status: "done", fields: { token: "tok", accountId: "bot1", baseUrl: "https://h" }, owner: "owner@im.wechat" };
  assert.deepEqual(await runtime.loginPoll("t1"), { status: "done" });
  assert.equal((await runtime.status()).state, "connected");
  assert.deepEqual((await runtime.status()).allowed, ["owner@im.wechat"]);
  assert.deepEqual(made.at(-1).fields, { token: "tok", accountId: "bot1", baseUrl: "https://h" });
  assert.deepEqual(await runtime.getConfig(), { enabled: true, autoAllowAll: false, progress: false, suggest: false, fields: {}, secrets: ["token", "accountId", "baseUrl"] });
  // The connection's saved state survives, is dropped by a new login, and a stale connection cannot write into the new one.
  const first = made.at(-1);
  await first.state.write({ cursor: "c1" });
  assert.deepEqual(await first.state.read(), { cursor: "c1" });
  await runtime.saveConfig({ enabled: true, progress: false, fields: {} });
  assert.deepEqual(made.at(-1).fields, { token: "tok", accountId: "bot1", baseUrl: "https://h" }, "saving keeps what the login stored");
  await first.state.write({ cursor: "stale" });
  assert.equal((await storage("weixin").read()).state.cursor, "c1");
  await runtime.stop();
  await assert.rejects(createChannelRuntime({ ...WECOM, store: storage("wecom"), dispatch: async () => ({}), createSocket: () => ({}) }).loginStart(), /no QR sign-in/);
});

test("two channels share one storage but keep their own settings, allowlists and sessions", async () => {
  const storage = createChannelStorage(memory());
  const made = [];
  const build = adapter => {
    let handlers;
    const runtime = createChannelRuntime({ id: adapter.id, label: adapter.label, fields: adapter.fields, store: storage(adapter.id), burstMs: 0, pollMs: 5, waitTimeoutMs: 400,
      createSocket: options => { handlers = options; made.push([adapter.id, options.fields]); return { start: async () => options.onState("connected"), send: async () => {}, stop() {} }; },
      dispatch: async ({ method, params }) => method === "create_session" ? { session: { id: `s-${adapter.id}` } }
        : method === "send_message" ? { accepted: true }
        : { status: "completed", runtime: {}, transcript: [{ type: "user", clientMessageId: params.messageId }, { type: "assistant", content: "ok" }] } });
    return { runtime, emit: message => handlers.onMessage(message) };
  };
  const wecom = build(wecomAdapter), other = build({ id: "other", label: "Other", fields: [{ key: "apiKey", secret: true }] });
  await wecom.runtime.saveConfig({ enabled: true, fields: { botId: "b", secret: "s" } });
  await other.runtime.saveConfig({ enabled: true, fields: { apiKey: "k" } });
  assert.deepEqual(made.at(-1), ["other", { apiKey: "k" }]);
  await other.runtime.saveConfig({ enabled: true, fields: { apiKey: "" } });
  assert.deepEqual(made.at(-1), ["other", { apiKey: "k" }], "an empty secret keeps the stored one");
  await other.runtime.approve("U1");
  assert.deepEqual([(await wecom.runtime.status()).allowed, (await other.runtime.status()).allowed, (await other.runtime.status()).id], [[], ["U1"], "other"]);
  other.emit({ messageId: "m1", senderId: "U1", conversationId: "D1", direct: true, text: "hi", supported: true });
  await flush(60);
  assert.deepEqual(Object.keys((await storage("other").read()).conversations), ["other:D1"]);
  assert.deepEqual((await storage("wecom").read()).conversations, {});
  await wecom.runtime.stop(); await other.runtime.stop();
});

test("record normalization drops unknown versions and malformed entries", () => {
  assert.deepEqual(normalizeRoot({ schemaVersion: 9, channels: { wecom: { allowed: ["x"] } } }).channels, {});
  const record = normalizeRecord({ conversations: { a: { sessionId: "s" }, b: {} }, config: { fields: { botId: "b", n: 3 } } });
  assert.deepEqual(Object.keys(record.conversations), ["a"]);
  assert.deepEqual(record.config.fields, { botId: "b" });
});

test("a version 1 file becomes the WeCom channel and each channel keeps its own allowlist", async () => {
  const data = { _zuri_channels: { schemaVersion: 1, wecom: { enabled: true, botId: "b", secret: "s", autoAllowAll: true, botName: "Bot", progress: false }, allowed: ["u1"], seen: ["wecom:m1"], conversations: { k: { sessionId: "s1", updatedAt: 1 } } } };
  const storage = createChannelStorage({ get: async key => ({ [key]: structuredClone(data[key]) }), set: async values => { Object.assign(data, structuredClone(values)); } });
  const wecom = await storage("wecom").read();
  assert.deepEqual(wecom.config, { enabled: true, autoAllowAll: true, progress: false, suggest: false, fields: { botId: "b", secret: "s", botName: "Bot" } });
  assert.deepEqual([wecom.allowed, wecom.seen, Object.keys(wecom.conversations)], [["u1"], ["wecom:m1"], ["k"]]);
  await storage("other").update(record => { record.allowed.push("U1"); });
  assert.deepEqual((await storage("other").read()).allowed, ["U1"]);
  assert.deepEqual((await storage("wecom").read()).allowed, ["u1"]);
  assert.equal(data._zuri_channels.schemaVersion, 2);
});

test("the first direct chat becomes the owner; later strangers wait for approval", async () => {
  const { runtime, sent, emit, calls } = setup();
  await enable(runtime, []);
  await emit({ senderId: "owner", conversationId: "single:owner" });
  await flush(60);
  assert.deepEqual((await runtime.status()).allowed, ["owner"]);
  assert.equal(sent.at(-1)[1], "完成");
  await emit({ messageId: "m2", senderId: "stranger", conversationId: "single:stranger" });
  await flush();
  assert.deepEqual((await runtime.status()).pending.map(item => item.senderId), ["stranger"]);
  assert.equal(calls.filter(call => call[0] === "create_session").length, 1);
});

test("group members are never let in automatically; autoAllowAll admits direct chats only", async () => {
  const { runtime, emit } = setup();
  await enable(runtime, []);
  await emit({ conversationId: "group:g", direct: false });
  await flush();
  assert.deepEqual((await runtime.status()).allowed, []);
  await runtime.saveConfig({ enabled: true, autoAllowAll: true, fields: { botId: "b" } });
  await emit({ messageId: "m2", conversationId: "group:g", direct: false });
  await flush(60);
  const status = await runtime.status();
  assert.deepEqual(status.allowed, []);
  assert.deepEqual(status.pending.map(item => item.senderId), ["u1"]);
  await emit({ messageId: "m3", senderId: "u2", conversationId: "single:u2" });
  await flush(60);
  assert.deepEqual((await runtime.status()).allowed, ["u2"]);
});

test("an unknown sender is listed for approval and told once; approval lets them in", async () => {
  const { runtime, sent, emit, calls } = setup();
  await enable(runtime, ["owner"]);
  await emit();
  await emit({ messageId: "m2" });
  await flush();
  assert.equal(sent.length, 1);
  assert.deepEqual((await runtime.status()).pending.map(item => item.senderId), ["u1"]);
  assert.equal(calls.length, 0);
  await runtime.approve("u1");
  await emit({ messageId: "m3" });
  await flush(60);
  assert.deepEqual((await runtime.status()).pending, []);
  assert.equal(sent.at(-1)[1], "完成");
});

test("an allowed sender gets a task, a reply, and the same task on the next message", async () => {
  const { runtime, sent, emit, calls } = setup();
  await enable(runtime);
  await emit();
  await flush(60);
  await emit({ messageId: "m2", text: "再来" });
  await flush(60);
  assert.deepEqual(calls.filter(call => ["create_session", "send_message"].includes(call[0])).map(call => call[0]), ["create_session", "send_message", "send_message"]);
  assert.deepEqual(sent.map(item => item[1]), ["完成", "完成"]);
});

test("group members get separate tasks and a quoted reply", async () => {
  const { runtime, sent, emit, calls } = setup();
  await enable(runtime, ["u1", "u2"]);
  const group = over => emit({ conversationId: "group:g", direct: false, ...over });
  await group({ text: "打开 example.com 并告诉我页面标题是什么，谢谢" });
  await group({ messageId: "m2", senderId: "u2", text: "另一个问题" });
  await flush(80);
  assert.equal(calls.filter(call => call[0] === "create_session").length, 2);
  assert.equal(sent[0][1], "> 打开 example.com 并告诉我页…\n\n完成");
});

test("a pending confirmation is relayed and the reply skips the queue", async () => {
  let status = "waiting_user";
  const { runtime, sent, emit, calls } = setup({
    snapshots: id => ({ status, runtime: {}, transcript: [{ type: "user", clientMessageId: id }, ...(status === "completed" ? [{ type: "assistant", content: "好了" }] : [])] }),
    dispatch: async method => {
      if (method === "get_user_input") return { waiting: true, kind: "confirmation", waitId: "w1", title: "允许？", message: "要登录" };
      if (method === "respond_to_user_input") { status = "completed"; return { accepted: true }; }
    },
  });
  await enable(runtime);
  await emit();
  await flush(40);
  assert.match(sent[0][1], /允许[\s\S]*同意/);
  await emit({ messageId: "m2", text: "同意" });
  await flush(40);
  assert.deepEqual(calls.find(call => call[0] === "respond_to_user_input")[1], { sessionId: "s1", waitId: "w1", action: "approve" });
  assert.equal(sent.at(-1)[1], "好了");
});

test("a deleted task is recreated once; a stuck task reports a timeout note", async () => {
  let first = true;
  const gone = setup({ dispatch: async method => {
    if (method === "send_message" && first) { first = false; throw Object.assign(new Error("gone"), { code: "task_deleted" }); }
  } });
  await enable(gone.runtime);
  await gone.emit();
  await flush(60);
  assert.equal(gone.calls.filter(call => call[0] === "create_session").length, 2);
  assert.equal(gone.sent.at(-1)[1], "完成");

  const stuck = setup({ snapshots: () => ({ status: "running", runtime: { running: true }, transcript: [] }) });
  await enable(stuck.runtime);
  await stuck.emit();
  await flush(500);
  assert.match(stuck.sent.at(-1)[1], /还在执行/);
});

test("saving a new config replaces the connection and stale events are ignored", async () => {
  const { runtime, sent, emit } = setup();
  await enable(runtime);
  await runtime.saveConfig({ enabled: false, fields: { botId: "b" } });
  assert.equal((await runtime.status()).state, "disabled");
  assert.deepEqual((await runtime.getConfig()).secrets, ["secret"]);
  emit();
  await flush();
  assert.equal(sent.length, 0);
});

test("describeInput answers confirmations and single-choice forms, and sends the rest to the browser", () => {
  assert.deepEqual(describeInput({ kind: "confirmation" }).answer("拒绝"), { action: "reject" });
  const form = describeInput({ kind: "form", form: { fields: [{ id: "c", type: "single_choice", options: [{ value: "r", label: "红" }, { value: "b", label: "蓝" }] }] } });
  assert.deepEqual(form.answer("2"), { action: "submit", answers: { c: "b" } });
  assert.equal(form.answer("紫"), null);
  const multi = describeInput({ kind: "form", form: { fields: [
    { id: "ch", type: "single_choice", options: [{ value: "m", label: "Mweb" }, { value: "g", label: "General" }] },
    { id: "tags", type: "multi_choice", required: false, options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    { id: "note", required: false }] } });
  assert.match(multi.text, /\(1\/3\)/);
  assert.equal(multi.answer("紫"), null);
  assert.match(multi.answer("1").next, /\(2\/3\)/);
  assert.match(multi.answer("1，2").next, /\(3\/3\)/);
  assert.deepEqual(multi.answer("跳过"), { action: "submit", answers: { ch: "m", tags: ["a", "b"], note: "" } });
  assert.equal(describeInput({ kind: "location_consent", instructions: "读披露" }).answer, null);
});

class FakeSocket {
  static last;
  static OPEN = 1;
  static respondError = 0;
  readyState = 1;
  sent = [];
  constructor() { FakeSocket.last = this; queueMicrotask(() => this.onopen()); }
  send(data) { const frame = JSON.parse(data); this.sent.push(frame); queueMicrotask(() => this.onmessage({ data: JSON.stringify({ headers: frame.headers, errcode: frame.cmd === "aibot_respond_msg" ? FakeSocket.respondError : 0, errmsg: "ok", body: { upload_id: "up1", media_id: "mid1" } }) })); }
  close() { this.readyState = 3; }
}

test("wecom socket subscribes, maps messages, sends markdown and stops on replacement", async () => {
  const got = [], states = [];
  const socket = createWecomSocket({ botId: "b", secret: "s", WebSocketImpl: FakeSocket, onMessage: item => got.push(item), onState: state => states.push(state) });
  await socket.start();
  const ws = FakeSocket.last;
  assert.deepEqual(ws.sent[0].body, { bot_id: "b", secret: "s" });
  const callback = body => ws.onmessage({ data: JSON.stringify({ cmd: "aibot_msg_callback", headers: { req_id: "r" }, body }) });
  callback({ msgid: "1", chattype: "group", chatid: "g", from: { userid: "u" }, msgtype: "text", text: { content: "@bot 打开网页" } });
  callback({ msgid: "2", chattype: "single", from: { userid: "u" }, msgtype: "file" });
  callback({ msgid: "3", chattype: "single", from: { userid: "u" }, msgtype: "mixed", quote: { text: { content: "旧消息" } }, mixed: { msg_item: [{ msgtype: "text", text: { content: "看图" } }, { msgtype: "image", image: { url: "http://x/i", aeskey: "k" } }] } });
  assert.deepEqual(got.map(item => [item.conversationId, item.text, item.direct, item.supported]), [["group:g", "打开网页", false, true], ["single:u", "", true, false], ["single:u", "> 旧消息\n\n看图", true, true]]);
  assert.deepEqual(got[2].images, [{ url: "http://x/i", aeskey: "k" }]);
  await socket.send("group:g", "ok");
  assert.deepEqual(ws.sent.at(-1).body, { chatid: "g", chat_type: 2, msgtype: "markdown", markdown: { content: "ok" } });
  ws.onmessage({ data: JSON.stringify({ cmd: "aibot_event_callback", body: { event: { eventtype: "disconnected_event" } } }) });
  assert.deepEqual(states, ["connected", "replaced"]);
  assert.equal(chunks("a".repeat(5001)).length, 2);
  socket.stop();
});

// A socket that never answers the frames named in `mute`.
const silent = (...mute) => class extends FakeSocket {
  static all = [];
  constructor() { super(); silent.sockets.push(this); }
  send(data) { if (!mute.includes(JSON.parse(data).cmd)) super.send(data); else this.sent.push(JSON.parse(data)); }
};
silent.sockets = [];

const settle = () => new Promise(resolve => setImmediate(resolve));

test("a rejected or unanswered subscribe closes the socket and reconnects with backoff", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  silent.sockets.length = 0;
  const states = [];
  const socket = createWecomSocket({ botId: "b", secret: "s", WebSocketImpl: silent("aibot_subscribe"), onMessage() {}, onState: (state, error) => states.push([state, error]) });
  const started = socket.start().catch(error => error);
  await settle(); // the subscribe frame is out and its ack timer is running
  t.mock.timers.tick(10_000);
  assert.match((await started).message, /timed out/);
  assert.equal(silent.sockets[0].readyState, 3);
  assert.deepEqual(states.at(-1), ["disconnected", "connection closed"]);
  t.mock.timers.tick(1000);
  assert.equal(silent.sockets.length, 2, "a new connection is attempted after the backoff");
  socket.stop();
});

test("two unanswered pings drop a half-open connection and reconnect", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  silent.sockets.length = 0;
  const states = [];
  const socket = createWecomSocket({ botId: "b", secret: "s", WebSocketImpl: silent("ping"), onMessage() {}, onState: state => states.push(state) });
  const started = socket.start();
  await settle();
  await started;
  for (let i = 0; i < 2; i++) { t.mock.timers.tick(25_000); t.mock.timers.tick(10_000); await settle(); }
  assert.deepEqual(states, ["connected", "disconnected"]);
  t.mock.timers.tick(1000);
  assert.equal(silent.sockets.length, 2);
  socket.stop();
});

test("wecom socket queues sends past 24 per minute, lets control messages through,", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const socket = createWecomSocket({ botId: "b", secret: "s", WebSocketImpl: FakeSocket, onMessage() {}, onState() {} });
  const started = socket.start();
  t.mock.timers.tick(0);
  await started;
  const ws = FakeSocket.last;
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const sends = () => ws.sent.filter(frame => frame.cmd === "aibot_send_msg").length;
  const all = Array.from({ length: 25 }, (_, i) => socket.send("single:u", `m${i}`));
  await flush();
  assert.equal(sends(), 24);
  const control = socket.send("single:u", "approve?", { control: true });
  await flush();
  assert.equal(sends(), 24, "control waits behind the queued message but is not capped at 24");
  t.mock.timers.tick(60_000);
  await flush();
  await Promise.all([...all, control]);
  assert.equal(sends(), 26);
  socket.stop();
});

test("a reply that hits a dropped connection is sent again after the reconnect", async () => {
  const sent = [];
  let handlers, fail = true;
  const store = createChannelStore(memory());
  const runtime = createChannelRuntime({ ...WECOM, burstMs: 0,
    store, pollMs: 5, waitTimeoutMs: 400,
    createSocket: options => {
      handlers = options;
      return { start: async () => options.onState("connected"), stop() {}, send: async (to, text) => {
        if (fail) { options.onState("disconnected", "connection closed"); throw new Error("WeCom connection is closed"); }
        sent.push([to, text]);
      } };
    },
    dispatch: async ({ method, params }) => {
      if (method === "create_session") return { session: { id: "s1" } };
      if (method === "send_message") return { accepted: true };
      if (method === "get_session_snapshot") return { status: "completed", runtime: {}, transcript: [{ type: "user", clientMessageId: "m1" }, { type: "assistant", content: [{ type: "text", text: "完成" }] }] };
      return {};
    },
  });
  await enable(runtime);
  handlers.onMessage(message());
  await flush(60);
  assert.equal(sent.length, 0);
  fail = false;
  handlers.onState("connected");
  await flush(60);
  assert.deepEqual(sent, [["single:u1", "完成"]]);
});

test("when another client replaces the bot, running tasks stop polling", async () => {
  const { runtime, calls, emit, state } = setup({ snapshots: () => ({ status: "running", runtime: { running: true }, transcript: [] }) });
  await enable(runtime);
  const polls = () => calls.filter(call => call[0] === "get_session_snapshot").length;
  await emit();
  await flush(40);
  assert.ok(polls() > 0);
  state("replaced");
  await flush(20);
  const after = polls();
  await flush(40);
  assert.equal(polls(), after);
});

test("a group answer still matches when the bot name has a space", async () => {
  const { runtime, sent, emit, calls } = setup({ snapshots: () => ({ status: "waiting_user", runtime: {}, transcript: [] }),
    dispatch: async method => method === "get_user_input" ? { waiting: true, waitId: "w1", kind: "confirmation", title: "确认" } : method === "respond_to_user_input" ? { accepted: true } : undefined });
  await enable(runtime);
  await emit({ conversationId: "group:g", direct: false, text: "关闭" });
  await flush(40);
  await emit({ messageId: "m2", conversationId: "group:g", direct: false, text: "Lite 同意" });
  await flush(20);
  assert.equal(calls.findLast(call => call[0] === "respond_to_user_input")[1].action, "approve");
});

test("an unknown group member is listed for approval without a reply in the group", async () => {
  const { runtime, sent, emit } = setup();
  await enable(runtime, ["owner"]);
  await emit({ conversationId: "group:g", direct: false });
  await flush();
  assert.equal(sent.length, 0);
  assert.deepEqual((await runtime.status()).pending.map(item => item.senderId), ["u1"]);
});

test("loadWecomImage decrypts a WeCom image (32-byte PKCS#7) and the runtime forwards it", async () => {
  const { createCipheriv, randomBytes } = await import("node:crypto");
  const key = randomBytes(32), png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const pad = 32 - png.length % 32;
  const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16)).setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([png, Buffer.alloc(pad, pad)])), cipher.final()]);
  const aeskey = key.toString("base64").replace(/=+$/, "");
  const image = await loadWecomImage({ url: "http://x/i", aeskey }, async () => new Response(encrypted));
  assert.equal(image.dataUrl, `data:image/png;base64,${png.toString("base64")}`);
  const { runtime, calls, emit } = setup();
  await enable(runtime);
  await emit({ text: "", images: [{ url: "u", aeskey }] });
  await flush(60);
  assert.equal(calls.find(call => call[0] === "send_message")[1].images.length, 1);
});

test("finished assistant texts are forwarded as progress, once each, and the run still ends with the last one", async () => {
  const text = value => ({ type: "assistant", content: [{ type: "text", text: value }] });
  let polls = 0;
  const { runtime, sent, emit } = setup({
    snapshots: id => {
      polls++;
      const transcript = [{ type: "user", clientMessageId: id }, text("先看一下页面")];
      if (polls > 3) transcript.push({ type: "tool" }, text("全部完成"));
      return { status: polls > 6 ? "completed" : "running", runtime: { running: polls <= 6 }, transcript };
    },
  });
  await enable(runtime);
  await runtime.saveConfig({ enabled: true, progress: true, fields: { botId: "b" } });
  await emit();
  await flush(150);
  assert.deepEqual(sent.map(item => item[1]), ["先看一下页面", "全部完成"]);
});

test("a message already handled before a restart is not run again", async () => {
  const first = setup();
  await enable(first.runtime);
  await first.emit();
  await flush(60);
  const again = setup();
  await again.store.update(record => { record.seen.push("wecom:m1"); });
  await enable(again.runtime);
  await again.emit();
  await flush(60);
  assert.equal(again.calls.filter(call => call[0] === "send_message").length, 0);
  assert.equal(first.calls.filter(call => call[0] === "send_message").length, 1);
});

test("a streamed reply grows in one bubble on the message's req_id and finishes with everything", async () => {
  const socket = createWecomSocket({ botId: "b", secret: "s", WebSocketImpl: FakeSocket, onMessage() {}, onState() {} });
  await socket.start();
  const stream = socket.stream("req-1", "> 问\n\n");
  stream.add("第一段");
  await flush();
  stream.add("第二段");
  await flush();
  assert.deepEqual(await stream.end(), []);
  const frames = FakeSocket.last.sent.filter(frame => frame.cmd === "aibot_respond_msg");
  assert.ok(frames.every(frame => frame.headers.req_id === "req-1" && frame.body.stream.id === frames[0].body.stream.id));
  assert.deepEqual(frames.map(frame => frame.body.stream.finish), [false, false, true]);
  assert.equal(frames.at(-1).body.stream.content, "> 问\n\n第一段\n\n第二段");
  socket.stop();
});

test("when the stream window has expired the texts come back to be sent as plain messages", async () => {
  FakeSocket.respondError = 846608;
  try {
    const socket = createWecomSocket({ botId: "b", secret: "s", WebSocketImpl: FakeSocket, onMessage() {}, onState() {} });
    await socket.start();
    const stream = socket.stream("req-1");
    stream.add("甲");
    await flush();
    stream.add("乙");
    assert.deepEqual(await stream.end(), ["甲", "乙"]);
    socket.stop();
  } finally { FakeSocket.respondError = 0; }
});

test("the runtime streams on the message's req_id and sends what the stream could not show", async () => {
  const added = [], sent = [];
  const runtime = createChannelRuntime({ ...WECOM, burstMs: 0,
    store: createChannelStore(memory()), pollMs: 5, waitTimeoutMs: 400,
    createSocket: options => { handlers = options; return { start: async () => options.onState("connected"), send: async (to, text) => { sent.push(text); }, stop() {},
      stream: (reqId, prefix) => ({ add: text => added.push([reqId, prefix, text]), end: async () => ["没显示的"] }) }; },
    dispatch: async ({ method, params }) => method === "create_session" ? { session: { id: "s1" } }
      : method === "get_session_snapshot" ? { status: "completed", runtime: {}, transcript: [{ type: "user", clientMessageId: "m1" }, { type: "assistant", content: [{ type: "text", text: "完成" }] }] } : { accepted: true },
  });
  let handlers;
  await enable(runtime);
  await handlers.onMessage(message({ reqId: "r1" }));
  await flush(60);
  assert.deepEqual(added, [["r1", "", "完成"]]);
  assert.deepEqual(sent, ["没显示的"]);
});

test("a group message drops the configured bot name even when it has spaces", async () => {
  const got = [];
  const socket = createWecomSocket({ botId: "b", secret: "s", botName: "Bot Lite", WebSocketImpl: FakeSocket, onMessage: item => got.push(item), onState() {} });
  await socket.start();
  const callback = body => FakeSocket.last.onmessage({ data: JSON.stringify({ cmd: "aibot_msg_callback", headers: { req_id: "r" }, body }) });
  callback({ msgid: "1", chattype: "group", chatid: "g", from: { userid: "u" }, msgtype: "text", text: { content: "@Bot Lite 3 打开网页" } });
  callback({ msgid: "2", chattype: "group", chatid: "g", from: { userid: "u" }, msgtype: "text", text: { content: "@other 你好" } });
  assert.deepEqual(got.map(item => item.text), ["3 打开网页", "你好"]);
  socket.stop();
});

test("with progress off only the closing text is sent", async () => {
  const text = value => ({ type: "assistant", content: [{ type: "text", text: value }] });
  let polls = 0;
  const { runtime, sent, emit } = setup({
    snapshots: id => {
      polls++;
      const transcript = [{ type: "user", clientMessageId: id }, text("先看一下页面")];
      if (polls > 3) transcript.push({ type: "tool" }, text("全部完成"));
      return { status: polls > 6 ? "completed" : "running", runtime: { running: polls <= 6 }, transcript };
    },
  });
  await runtime.saveConfig({ enabled: true, progress: false, fields: { botId: "b", secret: "s" } });
  await runtime.approve("u1");
  await emit();
  await flush(150);
  assert.deepEqual(sent.map(item => item[1]), ["全部完成"]);
});

test("messages sent in quick succession run as one task, and the status counts them", async () => {
  const { runtime, calls, emit } = setup({ burstMs: 30 });
  await enable(runtime);
  await emit({ messageId: "a", text: "第一句" });
  await emit({ messageId: "b", text: "第二句", images: [{ url: "u", aeskey: "k" }] });
  await flush(150);
  const sends = calls.filter(call => call[0] === "send_message");
  assert.equal(sends.length, 1);
  assert.equal(sends[0][1].text, "第一句\n第二句");
  assert.equal(sends[0][1].clientMessageId, "a");
  assert.equal(sends[0][1].images.length, 1);
  const { stats } = await runtime.status();
  assert.deepEqual([stats.received, stats.completed, stats.failed], [2, 1, 0]);
});

test("a stream whose subscription was lost (846609) hands its texts back", async () => {
  FakeSocket.respondError = 846609;
  try {
    const socket = createWecomSocket({ botId: "b", secret: "s", WebSocketImpl: FakeSocket, onMessage() {}, onState() {} });
    await socket.start();
    const stream = socket.stream("r");
    stream.add("一");
    await flush();
    assert.deepEqual(await stream.end(), ["一"]);
    socket.stop();
  } finally { FakeSocket.respondError = 0; }
});

test("md5 matches the platform implementation across padding boundaries", () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 1000, 70000]) {
    const data = Uint8Array.from({ length: size }, (_, i) => (i * 7 + 3) & 255);
    assert.equal(md5(data), createHash("md5").update(data).digest("hex"), `size ${size}`);
  }
});

test("media is uploaded in chunks and then sent as an image or file message", async () => {
  const socket = createWecomSocket({ botId: "b", secret: "s", WebSocketImpl: FakeSocket, onMessage() {}, onState() {} });
  await socket.start();
  const data = Uint8Array.from({ length: 600 * 1024 }, (_, i) => i & 255);
  await socket.sendMedia("group:g", { type: "file", filename: "a.pdf", data });
  const frames = FakeSocket.last.sent.slice(1).filter(frame => frame.cmd !== "ping");
  assert.deepEqual(frames.map(frame => frame.cmd), ["aibot_upload_media_init", "aibot_upload_media_chunk", "aibot_upload_media_chunk", "aibot_upload_media_finish", "aibot_send_msg"]);
  assert.deepEqual(frames[0].body, { type: "file", filename: "a.pdf", total_size: data.length, total_chunks: 2, md5: createHash("md5").update(data).digest("hex") });
  assert.deepEqual(frames.slice(1, 3).map(frame => frame.body.chunk_index), [0, 1]);
  assert.deepEqual(frames[4].body, { chatid: "g", chat_type: 2, msgtype: "file", file: { media_id: "mid1" } });
  await assert.rejects(socket.sendMedia("single:u", { type: "file", filename: "e", data: new Uint8Array(0) }), /empty or too large/);
  socket.stop();
});

test("an inbound file is mapped, downloaded and decrypted like an image", async () => {
  const got = [];
  const socket = createWecomSocket({ botId: "b", secret: "s", WebSocketImpl: FakeSocket, onMessage: item => got.push(item), onState() {} });
  await socket.start();
  const callback = body => FakeSocket.last.onmessage({ data: JSON.stringify({ cmd: "aibot_msg_callback", headers: { req_id: "r" }, body }) });
  callback({ msgid: "1", chattype: "single", from: { userid: "u" }, msgtype: "file", file: { url: "http://x/f", aeskey: "", filename: "报告.pdf" } });
  assert.deepEqual([got[0].supported, got[0].files], [true, [{ url: "http://x/f", aeskey: "", name: "报告.pdf" }]]);
  const file = await loadWecomFile(got[0].files[0], async () => new Response(new Uint8Array([1, 2, 3])));
  assert.deepEqual([file.name, file.size, file.base64], ["报告.pdf", 3, "AQID"]);
  socket.stop();
});

test("fetchWecomMedia sends pictures as images and everything else as files", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const image = await fetchWecomMedia("https://x/a/pic.png", "", async () => new Response(png, { headers: { "content-type": "image/png" } }));
  assert.deepEqual([image.type, image.filename], ["image", "pic.png"]);
  const file = await fetchWecomMedia("https://x/r", "报表.xlsx", async () => new Response(new Uint8Array([0x50, 0x4b, 3, 4]), { headers: { "content-type": "application/octet-stream" } }));
  assert.deepEqual([file.type, file.filename], ["file", "报表.xlsx"]);
  const labelled = await fetchWecomMedia("https://x/p.jpg", "", async () => new Response(png, { headers: { "content-type": "application/octet-stream" } }));
  assert.equal(labelled.type, "image");
  await assert.rejects(fetchWecomMedia("https://x/r", "", async () => new Response("", { status: 404 })), /404/);
});

test("the runtime stages an inbound file as a document and sends it with the task", async () => {
  const staged = [];
  const { runtime, calls, emit } = setup({
    dispatch: async (method, params) => {
      if (method === "runtime_message") { staged.push(params.message); return { response: { type: "chat_document_staged", document: { attachmentId: params.message.attachmentId, filename: params.message.filename } } }; }
    },
  });
  await enable(runtime);
  await emit({ text: "", files: [{ url: "u", aeskey: "k", name: "a.pdf" }] });
  await flush(60);
  assert.equal(staged[0].sessionId, "s1");
  assert.equal(staged[0].messageId, "m1");
  const [, send] = calls.find(call => call[0] === "send_message");
  assert.equal(send.documents.length, 1);
  assert.equal(send.clientMessageId, "m1");
});

test("pictures in the reply and files the task produced are sent back after the text", async () => {
  const sent = [], media = [];
  let phase = 0, handlers, asked;
  const old = { id: "old", filename: "old.txt", url: "https://x/o" };
  const runtime = createChannelRuntime({ ...WECOM,
    burstMs: 0, store: createChannelStore(memory()), pollMs: 5, waitTimeoutMs: 400,
    fetchMedia: async (url, name) => ({ type: name ? "file" : "image", filename: name || "a.png", data: new Uint8Array([url.length]) }),
    createSocket: options => { handlers = options; return { start: async () => options.onState("connected"), send: async (to, text) => { sent.push(text); }, sendMedia: async (to, item) => { media.push(item.filename); }, stop() {} }; },
    dispatch: async ({ method, params }) => {
      if (method === "create_session") return { session: { id: "s1" } };
      if (method === "send_message") { phase = 1; asked = params.text; return { accepted: true }; }
      if (method === "get_session_snapshot") {
        if (params.includeArtifacts) return { artifacts: { files: phase ? [old, { id: "n", filename: "r.csv", url: "https://x/r.csv" }, { id: "dl", filename: "d", url: "chrome://x" }] : [old] } };
        return { status: "completed", runtime: {}, transcript: [{ type: "user", clientMessageId: "m1" }, { type: "assistant", content: [{ type: "text", text: "看这个 ![图](https://x/a.png) 和 https://x/b.jpeg?w=8 以及[原图](https://x/c.webp) 完成 [页面](https://x/p)" }] }] };
      }
      return {};
    },
  });
  await runtime.saveConfig({ enabled: true, fields: { botId: "b", secret: "s" } });
  await runtime.approve("u1");
  handlers.onMessage(message());
  await flush(80);
  assert.deepEqual(sent, ["看这个  和  以及 完成 [页面](https://x/p)"]);
  assert.deepEqual(media, ["a.png", "a.png", "a.png", "r.csv"]);
  assert.match(asked, /^你好[\s\S]*直链 URL/);
});

test("ensure reconnects a runtime that is not running, leaves a running one alone, and asks for wake-ups only while enabled", async () => {
  const wanted = [];
  let created = 0;
  const store = createChannelStore(memory());
  const runtime = createChannelRuntime({ ...WECOM,
    burstMs: 0, store, keepAlive: value => wanted.push(value),
    createSocket: options => { created++; return { start: async () => options.onState("connected"), send: async () => {}, stop() {} }; },
    dispatch: async () => ({}),
  });
  await store.update(record => { record.config = { ...record.config, enabled: true, fields: { botId: "b", secret: "s" } }; });
  await Promise.all([runtime.ensure(), runtime.ensure()]);
  await runtime.ensure();
  assert.equal(created, 1);
  await runtime.saveConfig({ enabled: false, fields: { botId: "b" } });
  assert.deepEqual(wanted, [true, false]);
  await runtime.ensure();
  assert.equal(created, 1);
});

test("a Chrome permission request says what to do in the browser and continues on 已授权", () => {
  const shown = describeInput({ kind: "browser_permission", title: "需要浏览器权限", message: "读取书签" });
  assert.match(shown.text, /允许并继续/);
  assert.deepEqual(shown.answer("已授权"), { action: "approve" });
  assert.equal(shown.answer("随便"), null);
});

test("a picture that cannot be downloaded is shown from its URL; a file that fails is reported", async () => {
  const sent = [], cards = [];
  let handlers;
  const runtime = createChannelRuntime({ ...WECOM,
    burstMs: 0, store: createChannelStore(memory()), pollMs: 5, waitTimeoutMs: 400,
    fetchMedia: async () => { throw new Error("download failed (403)"); },
    createSocket: options => { handlers = options; return { start: async () => options.onState("connected"), send: async (to, text) => { sent.push(text); }, sendMedia: async () => {}, sendImageLink: async (to, url) => { cards.push(url); }, stop() {} }; },
    dispatch: async ({ method, params }) => {
      if (method === "create_session") return { session: { id: "s1" } };
      if (method === "send_message") return { accepted: true };
      if (method === "get_session_snapshot") return { status: "completed", runtime: {}, transcript: [{ type: "user", clientMessageId: "m1" }, { type: "assistant", content: [{ type: "text", text: "![](https://x/img?id=1) 好了" }] }] };
      return {};
    },
  });
  await runtime.saveConfig({ enabled: true, fields: { botId: "b", secret: "s" } });
  await runtime.approve("u1");
  handlers.onMessage(message());
  await flush(80);
  assert.deepEqual(cards, ["https://x/img?id=1"]);
  assert.deepEqual(sent, ["好了"]);
});

test("a saved copy of a picture the reply already links is not sent again", async () => {
  const media = [];
  let handlers, phase = 0;
  const runtime = createChannelRuntime({ ...WECOM,
    burstMs: 0, store: createChannelStore(memory()), pollMs: 5, waitTimeoutMs: 400,
    fetchMedia: async (url, name) => ({ type: "image", filename: name || url, data: new Uint8Array(1) }),
    createSocket: options => { handlers = options; return { start: async () => options.onState("connected"), send: async () => {}, sendMedia: async (to, item) => { media.push(item.filename); }, stop() {} }; },
    dispatch: async ({ method, params }) => {
      if (method === "create_session") return { session: { id: "s1" } };
      if (method === "send_message") { phase = 1; return { accepted: true }; }
      if (params.includeArtifacts) return { artifacts: { files: phase ? [{ id: "a", filename: "File:Liu_Portrait1.jpg", url: "https://x/a" }, { id: "b", filename: "r.csv", url: "https://x/r.csv" }] : [] } };
      if (method === "get_session_snapshot") return { status: "completed", runtime: {}, transcript: [{ type: "user", clientMessageId: "m1" }, { type: "assistant", content: [{ type: "text", text: "![](https://upload.x/Liu_Portrait1.jpg) 好了" }] }] };
      return {};
    },
  });
  await runtime.saveConfig({ enabled: true, fields: { botId: "b", secret: "s" } });
  await runtime.approve("u1");
  handlers.onMessage(message());
  await flush(80);
  assert.deepEqual(media, ["https://upload.x/Liu_Portrait1.jpg", "r.csv"]);
});

test("a file downloaded into a session that already had one is sent even though snapshot files carry no id", async () => {
  const media = [];
  let handlers, phase = 0;
  const old = { filename: "old.jpg", downloadId: 1, url: "https://x/old.jpg" };
  const runtime = createChannelRuntime({ ...WECOM,
    burstMs: 0, store: createChannelStore(memory()), pollMs: 5, waitTimeoutMs: 400,
    fetchMedia: async (url, name) => ({ type: "image", filename: name || url, data: new Uint8Array(1) }),
    createSocket: options => { handlers = options; return { start: async () => options.onState("connected"), send: async () => {}, sendMedia: async (to, item) => { media.push(item.filename); }, stop() {} }; },
    dispatch: async ({ method, params }) => {
      if (method === "create_session") return { session: { id: "s1" } };
      if (method === "send_message") { phase = 1; return { accepted: true }; }
      if (params.includeArtifacts) return { artifacts: { files: phase ? [old, { filename: "new.jpg", downloadId: 2, url: "https://x/new.jpg" }] : [old] } };
      if (method === "get_session_snapshot") return { status: "completed", runtime: {}, transcript: [{ type: "user", clientMessageId: "m1" }, { type: "assistant", content: [{ type: "text", text: "好了" }] }] };
      return {};
    },
  });
  await runtime.saveConfig({ enabled: true, fields: { botId: "b", secret: "s" } });
  await runtime.approve("u1");
  handlers.onMessage(message());
  await flush(80);
  assert.deepEqual(media, ["new.jpg"]);
});

const until = async check => { for (let i = 0; i < 200 && !check(); i++) await new Promise(resolve => setTimeout(resolve, 5)); };

test("follow-up suggestions are offered only when the setting is on, and a number asks that question", async () => {
  const seen = [];
  const { runtime, sent, calls, emit } = setup({ suggest: async conversation => { seen.push(conversation); return ["问题一", "问题二"]; } });
  await runtime.start();
  await enable(runtime);
  await emit({ messageId: "m1", text: "你好" });
  await flush(100);
  assert.equal(seen.length, 0);
  await runtime.saveConfig({ enabled: true, suggest: true, fields: { botId: "b" } });
  await emit({ messageId: "m2", text: "再问" });
  await until(() => sent.some(([, text]) => text.startsWith("可以接着问")));
  assert.deepEqual(seen, [{ user: "再问", assistant: "完成" }]);
  assert.match(sent.at(-1)[1], /1\. 问题一\n2\. 问题二/);
  await emit({ messageId: "m3", text: "2" });
  await until(() => calls.filter(call => call[0] === "send_message").length === 3);
  assert.equal(calls.findLast(call => call[0] === "send_message")[1].text, "问题二");
});

test("a conversation quiet for longer than the idle time starts a new task, and /new starts one on request", async () => {
  const { runtime, store, calls, sent, emit } = setup({ idleMs: 60_000, graceMs: 0 });
  await runtime.start();
  await enable(runtime);
  const creates = () => calls.filter(call => call[0] === "create_session").length;
  await emit({ messageId: "m1" });
  await until(() => sent.length === 1);
  await emit({ messageId: "m2" });
  await until(() => sent.length === 2);
  assert.equal(creates(), 1, "a recent conversation keeps its task");
  await store.update(record => { for (const entry of Object.values(record.conversations)) entry.updatedAt = Date.now() - 61_000; });
  await emit({ messageId: "m3" });
  await until(() => sent.length === 4);
  assert.match(sent[2][1], /已超过/);
  assert.equal(creates(), 2, "an idle conversation gets a new task");
  await emit({ messageId: "m4", text: "/new" });
  await until(() => sent.length === 5);
  assert.match(sent.at(-1)[1], /新任务/);
  assert.equal(calls.filter(call => call[0] === "send_message").length, 3, "/new is a command, not a task");
  await emit({ messageId: "m5" });
  await until(() => sent.length === 6);
  assert.equal(creates(), 3);
});

test("a quiet conversation is reminded once, keeps its task when answered in time, and is cleared when not", async () => {
  const { runtime, store, calls, sent, emit } = setup({ idleMs: 60_000, graceMs: 900_000 });
  await runtime.start();
  await enable(runtime);
  const creates = () => calls.filter(call => call[0] === "create_session").length;
  const age = ms => store.update(record => { for (const entry of Object.values(record.conversations)) entry.updatedAt = Date.now() - ms; });
  await emit({ messageId: "m1" });
  await until(() => sent.length === 1);
  await runtime.ensure();
  assert.equal(sent.length, 1, "nothing is said while the conversation is recent");
  await age(61_000);
  await runtime.ensure(); await runtime.ensure();
  assert.equal(sent.length, 2, "one reminder");
  assert.match(sent[1][1], /15 分钟内回复/);
  await emit({ messageId: "m2" });
  await until(() => sent.length === 3);
  assert.equal(creates(), 1, "an answer in time keeps the task");
  await age(61_000);
  await runtime.ensure();
  await until(() => sent.length === 4);
  await age(61_000 + 900_000);
  await runtime.ensure();
  assert.deepEqual(Object.keys((await store.read()).conversations), [], "no answer clears the task");
  await emit({ messageId: "m3" });
  await until(() => sent.length === 5);
  assert.equal(creates(), 2);
  assert.doesNotMatch(sent[4][1], /已超过/, "the reminder already said it");
});

test("/new stops that conversation's running task, and task titles and errors read well in a chat", async () => {
  const { runtime, calls, sent, emit } = setup({
    snapshots: id => ({ status: "running", runtime: { running: true }, transcript: [{ type: "user", clientMessageId: id }] }),
    dispatch: async method => method === "stop_session" ? { stopped: true } : undefined,
  });
  await runtime.start();
  await enable(runtime);
  await emit({ messageId: "m1", text: "查一下" });
  await until(() => calls.some(call => call[0] === "get_session_snapshot"));
  assert.equal(calls.find(call => call[0] === "create_session")[1].title, "[企业微信] 查一下");
  await emit({ messageId: "m2", text: "/new" });
  await until(() => sent.length === 1);
  assert.deepEqual(calls.find(call => call[0] === "stop_session")[1], { sessionId: "s1" });
  const polls = calls.filter(call => call[0] === "get_session_snapshot").length;
  await flush(60);
  assert.ok(calls.filter(call => call[0] === "get_session_snapshot").length <= polls + 1, "the old task is no longer followed");
  assert.deepEqual(sent.map(item => item[1]), ["已开始新任务，下一条消息会从头开始。"]);
  const failing = setup({ dispatch: async method => { if (method === "send_message") throw new Error("ECONNRESET internal detail"); } });
  await failing.runtime.start();
  await enable(failing.runtime);
  await failing.emit({ messageId: "e1" });
  await until(() => failing.sent.length === 1);
  assert.equal(failing.sent[0][1], "出错了，请稍后再试。");
});

test("/stop and 停 end the running task but keep the conversation, and say so when nothing runs", async () => {
  const { runtime, calls, sent, emit } = setup({
    snapshots: id => ({ status: "running", runtime: { running: true }, transcript: [{ type: "user", clientMessageId: id }] }),
    dispatch: async method => method === "stop_session" ? { stopped: true } : undefined,
  });
  await runtime.start();
  await enable(runtime);
  await emit({ messageId: "m1", text: "查一下" });
  await until(() => calls.some(call => call[0] === "get_session_snapshot"));
  await emit({ messageId: "m2", text: "停" });
  await until(() => sent.length === 1);
  assert.deepEqual(calls.find(call => call[0] === "stop_session")[1], { sessionId: "s1" });
  assert.equal(sent[0][1], "已停止当前任务，上下文保留，可以继续发消息。");
  await emit({ messageId: "m3", text: "/stop" });
  await until(() => sent.length === 2);
  assert.equal(sent[1][1], "当前没有在执行的任务。");
  await emit({ messageId: "m4", text: "继续" });
  await until(() => calls.filter(call => call[0] === "send_message").length === 2);
  assert.equal(calls.filter(call => call[0] === "create_session").length, 1, "the conversation keeps its task");
});

test("wecom: a quote with no words of its own is the message, and a quoted picture is read", async () => {
  const got = [];
  const socket = createWecomSocket({ botId: "b", secret: "s", WebSocketImpl: FakeSocket, onMessage: item => got.push(item), onState() {} });
  await socket.start();
  const callback = body => FakeSocket.last.onmessage({ data: JSON.stringify({ cmd: "aibot_msg_callback", headers: { req_id: "r" }, body }) });
  callback({ msgid: "1", chattype: "single", from: { userid: "u" }, msgtype: "text", text: { content: "" }, quote: { msgtype: "text", text: { content: "帮我总结" } } });
  callback({ msgid: "2", chattype: "single", from: { userid: "u" }, msgtype: "text", text: { content: "这是什么" }, quote: { msgtype: "image", image: { url: "http://x/q", aeskey: "k" } } });
  assert.deepEqual(got.map(item => [item.text, item.supported]), [["帮我总结", true], ["这是什么", true]]);
  assert.deepEqual(got[1].images, [{ url: "http://x/q", aeskey: "k" }]);
  socket.stop();
});
