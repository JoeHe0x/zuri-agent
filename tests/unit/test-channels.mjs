import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import createWecom, { chunks } from "../../services/channels/src/adapters/wecom.mjs";
import { createGateway, replyText } from "../../services/channels/src/gateway.mjs";
import { openStore } from "../../services/channels/src/store.mjs";

const msg = (over = {}) => ({ channel: "x", conversationId: "c1", messageId: "m1", senderId: "u1", text: "hi", direct: true, mentioned: false, ...over });
const snapshot = id => ({ transcript: [{ type: "assistant", content: "old" }, { type: "user", clientMessageId: id },
  { type: "assistant", content: [{ type: "text", text: "first" }] }, { type: "assistant", content: "final" }] });

function setup(over = {}) {
  const sent = [], calls = [];
  const bridge = {
    createSession: async title => (calls.push(["create", title]), { sessionId: "s1" }),
    sendMessage: async (sessionId, text, id) => (calls.push(["send", sessionId, text, id]), { snapshot: snapshot(id) }),
    pendingInput: async () => ({ waiting: false }),
    ...over.bridge,
  };
  const adapters = { x: { send: async (to, text) => sent.push([to.conversationId, text]) } };
  const store = openStore(join(mkdtempSync(join(tmpdir(), "ch-")), "c.json"));
  const config = { waitTimeoutSeconds: 5, channels: { x: { allowFrom: ["u1"], requireMention: true } } };
  return { gateway: createGateway({ adapters, bridge, store, config, pollMs: 5 }), sent, calls, store };
}

test("gateway creates a task, then continues it; repeats send once", async () => {
  const { gateway, sent, calls } = setup();
  await gateway.handle(msg());
  await gateway.handle(msg());
  await gateway.handle(msg({ messageId: "m2", text: "again" }));
  assert.deepEqual(calls.map(call => call[0]), ["create", "send", "send"]);
  assert.deepEqual(sent, [["c1", "final"], ["c1", "final"]]);
});

test("gateway drops disallowed senders and unmentioned group messages", async () => {
  const { gateway, calls } = setup();
  await gateway.handle(msg({ senderId: "evil" }));
  await gateway.handle(msg({ messageId: "m3", direct: false }));
  assert.equal(calls.length, 0);
});

test("gateway sends a wait note on timeout and recreates a deleted task", async () => {
  const timeout = Object.assign(new Error("t"), { code: "timeout" });
  const slow = setup({ bridge: { sendMessage: async () => { throw timeout; } } });
  await slow.gateway.handle(msg());
  assert.match(slow.sent[0][1], /还在执行/);

  let first = true;
  const gone = setup({ bridge: { sendMessage: async (s, t, id) => {
    if (first) { first = false; throw Object.assign(new Error("gone"), { code: "task_deleted" }); }
    return { snapshot: snapshot(id) };
  } } });
  await gone.gateway.handle(msg());
  assert.equal(gone.calls.filter(call => call[0] === "create").length, 2);
  assert.equal(gone.sent[0][1], "final");
});

test("replyText picks the last assistant text after the submitted message", () => {
  assert.equal(replyText(snapshot("m"), "m"), "final");
  assert.match(replyText({ transcript: [] }, "m"), /没有文本回复/);
});

test("store survives a corrupt file and writes atomically", () => {
  const path = join(mkdtempSync(join(tmpdir(), "ch-")), "c.json");
  writeFileSync(path, "{nope");
  const store = openStore(path);
  assert.equal(store.get("a"), undefined);
  store.set("a", "s");
  assert.equal(openStore(path).get("a").sessionId, "s");
});

class FakeSocket {
  static last;
  sent = [];
  constructor() { FakeSocket.last = this; queueMicrotask(() => this.onopen()); }
  send(data) {
    const frame = JSON.parse(data);
    this.sent.push(frame);
    queueMicrotask(() => this.onmessage({ data: JSON.stringify({ headers: frame.headers, errcode: 0, errmsg: "ok" }) }));
  }
  close() {}
}

test("wecom adapter subscribes, maps messages and sends markdown", async () => {
  const adapter = createWecom({}, { WECOM_BOT_ID: "b", WECOM_BOT_SECRET: "s" }, { WebSocketImpl: FakeSocket });
  const got = [];
  await adapter.start(message => got.push(message));
  const ws = FakeSocket.last;
  assert.deepEqual(ws.sent[0].body, { bot_id: "b", secret: "s" });
  const callback = body => ws.onmessage({ data: JSON.stringify({ cmd: "aibot_msg_callback", headers: { req_id: "r" }, body }) });
  callback({ msgid: "1", chattype: "group", chatid: "g", from: { userid: "u" }, msgtype: "text", text: { content: "@bot 打开网页" } });
  callback({ msgid: "2", chattype: "single", from: { userid: "u" }, msgtype: "text", text: { content: "hi" } });
  assert.deepEqual(got.map(m => [m.conversationId, m.text, m.direct, m.mentioned]),
    [["group:g", "打开网页", false, true], ["single:u", "hi", true, false]]);
  await adapter.send({ conversationId: "group:g" }, "ok");
  assert.deepEqual(ws.sent.at(-1).body, { chatid: "g", chat_type: 2, msgtype: "markdown", markdown: { content: "ok" } });
  assert.equal(chunks("a".repeat(5001)).length, 2);
  await adapter.stop();
});

test("group members get separate tasks and quoted replies", async () => {
  const { gateway, sent, calls, store } = setup();
  const group = over => msg({ conversationId: "group:g", direct: false, mentioned: true, ...over });
  await gateway.handle(group({ text: "打开 example.com 并告诉我页面标题是什么，谢谢" }));
  assert.equal(calls.filter(call => call[0] === "create").length, 1);
  assert.ok(store.get("x:group:g:u1"));
  assert.equal(sent[0][1], "> 打开 example.com 并告诉我页…\n\nfinal");
});

test("a pending confirmation is relayed to the chat and answered without queueing", async () => {
  let release;
  const responded = [];
  let pending = { waiting: true, kind: "confirmation", waitId: "w1", title: "允许登录？", message: "要打开后台" };
  const { gateway, sent } = setup({ bridge: {
    pendingInput: async () => pending,
    sendMessage: (sessionId, text, id) => new Promise(resolve => { release = () => resolve({ snapshot: snapshot(id) }); }),
    respond: async (sessionId, waitId, action) => { responded.push([sessionId, waitId, action]); pending = { waiting: false }; release(); return { accepted: true }; },
  } });
  const task = gateway.handle(msg());
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.match(sent[0][1], /允许登录[\s\S]*回复“同意”或“拒绝”/);
  await gateway.handle(msg({ messageId: "m2", text: "不知道" }));
  assert.match(sent[1][1], /没看懂/);
  await gateway.handle(msg({ messageId: "m3", text: "同意" }));
  await task;
  assert.deepEqual(responded, [["s1", "w1", "approve"]]);
  assert.equal(sent.at(-1)[1], "final");
});

test("a single-choice form maps the reply to an option value; browser-only requests are not answerable", async () => {
  let release, calls = 0;
  const responded = [];
  let pending = { waiting: true, kind: "form", waitId: "w2", message: "选一个", form: { fields: [{ id: "color", label: "颜色", type: "single_choice", options: [{ value: "r", label: "红" }, { value: "b", label: "蓝" }] }] } };
  const { gateway, sent } = setup({ bridge: {
    pendingInput: async () => pending,
    sendMessage: (sessionId, text, id) => ++calls === 1 ? new Promise(resolve => { release = () => resolve({ snapshot: snapshot(id) }); }) : { snapshot: snapshot(id) },
    respond: async (sessionId, waitId, action, answers) => { responded.push([action, answers]); pending = { waiting: true, kind: "browser_permission", waitId: "w3", instructions: "点 Allow" }; return { accepted: true }; },
  } });
  const task = gateway.handle(msg());
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.match(sent[0][1], /1\. 红[\s\S]*2\. 蓝/);
  await gateway.handle(msg({ messageId: "m2", text: "2" }));
  assert.deepEqual(responded, [["submit", { color: "b" }]]);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.match(sent.at(-1)[1], /需要在浏览器里处理/);
  const queued = gateway.handle(msg({ messageId: "m3", text: "同意" })); // queued behind the task, never sent to respond
  assert.equal(responded.length, 1);
  release();
  await Promise.all([task, queued]);
});
