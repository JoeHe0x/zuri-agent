import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { test } from "node:test";
import { aesEcbDecrypt, aesEcbEncrypt, createWeixinLogin, createWeixinSocket, loadWeixinFile, loadWeixinImage, toWeixinText } from "../../src/background/channels/weixin-socket.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
const settle = async (t, ms = 0) => { for (let i = 0; i < 6; i++) { await flush(); if (ms) t.mock.timers.tick(ms); } };
const hang = signal => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true }));

/** `handlers` maps an endpoint's last path segment to its reply (or a function of the body and the call number); "hang" waits for the abort. */
function fakeApi(handlers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const name = new URL(url).pathname.split("/").pop();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    const count = calls.filter(call => call.name === name).length + 1;
    calls.push({ name, url: String(url), body, headers: init.headers });
    let reply = handlers[name];
    if (typeof reply === "function") reply = reply(body, count);
    if (reply === "hang") return hang(init.signal);
    if (reply instanceof Response) return reply;
    return new Response(JSON.stringify(reply ?? { ret: 0 }), { headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, calls };
}
const memoryState = (initial = {}) => { const data = { ...initial }; return { data, read: async () => ({ ...data }), write: async patch => { Object.assign(data, patch); } }; };
const user = (over = {}) => ({ message_id: 1, from_user_id: "u1@im.wechat", to_user_id: "bot1@im.bot", message_type: 1, context_token: "ct1", item_list: [{ type: 1, text_item: { text: "你好" } }], ...over });

async function connect(handlers, { state = memoryState() } = {}) {
  const got = [], states = [];
  const api = fakeApi({ getupdates: (body, n) => n === 1 ? { ret: 0, msgs: [], get_updates_buf: "c0" } : "hang", ...handlers });
  const socket = createWeixinSocket({ fields: { token: "tok", accountId: "bot1@im.bot" }, state, onMessage: item => got.push(item), onState: (value, error) => states.push([value, error]), fetchImpl: api.fetchImpl });
  await socket.start();
  return { socket, got, states, state, ...api };
}

test("aes-128-ecb decrypt matches node's cipher for both key encodings", async () => {
  const key = randomBytes(16);
  for (const length of [0, 1, 15, 16, 17, 100]) {
    const plain = randomBytes(length);
    const cipher = createCipheriv("aes-128-ecb", key, null);
    const encrypted = new Uint8Array(Buffer.concat([cipher.update(plain), cipher.final()]));
    assert.deepEqual(Buffer.from(await aesEcbDecrypt(encrypted, new Uint8Array(key))), plain, `length ${length}`);
  }
  const plain = Buffer.from("picture bytes ".repeat(10));
  const cipher = createCipheriv("aes-128-ecb", key, null);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const seen = [];
  const fetchImpl = async url => { seen.push(String(url)); return new Response(encrypted); };
  for (const aes of [key.toString("base64"), Buffer.from(key.toString("hex")).toString("base64")]) {
    const file = await loadWeixinFile({ param: "a b", key: aes, url: "", name: "r.pdf" }, fetchImpl);
    assert.deepEqual([Buffer.from(file.base64, "base64").toString(), file.name], [plain.toString(), "r.pdf"]);
  }
  assert.equal(seen[0], "https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=a%20b");
  await assert.rejects(loadWeixinImage({ param: "", key: "", url: "https://evil.test/x", name: "" }, fetchImpl), /no downloadable address/);
  await assert.rejects(loadWeixinImage({ param: "p", key: Buffer.from("short").toString("base64"), url: "", name: "" }, fetchImpl), /invalid attachment/);
});

test("weixin socket polls with the cursor, maps direct messages, and keeps the cursor and reply tokens", async () => {
  const state = memoryState({ cursor: "saved" });
  const { socket, got, states, calls, state: kept } = await connect({
    getupdates: (body, n) => n === 1 ? { ret: 0, get_updates_buf: "c1", msgs: [
      user(),
      user({ message_id: 2, item_list: [{ type: 1, text_item: { text: "回复" }, ref_msg: { title: "旧消息" } }, { type: 2, image_item: { media: { encrypt_query_param: "p1", aes_key: "k1" } } }, { type: 4, file_item: { file_name: "a.pdf", media: { encrypt_query_param: "p2", aes_key: "k2" } } }] }),
      user({ message_id: 3, item_list: [{ type: 3, voice_item: { text: "语音转文字" } }] }),
      user({ message_id: 4, from_user_id: "bot1@im.bot" }), user({ message_id: 5, message_type: 2 }), user({ message_id: 6, room_id: "r1" }),
    ] } : "hang" }, { state });
  await flush(); await flush();
  assert.deepEqual(calls[0].body.get_updates_buf, "saved");
  assert.equal(calls[0].headers.Authorization, "Bearer tok");
  assert.equal(calls[0].headers.AuthorizationType, "ilink_bot_token");
  assert.deepEqual(states, [["connected", undefined]]);
  assert.deepEqual(got.map(item => [item.messageId, item.conversationId, item.senderId, item.text, item.direct, item.supported]), [
    ["1", "u1@im.wechat", "u1@im.wechat", "你好", true, true],
    ["2", "u1@im.wechat", "u1@im.wechat", "> 旧消息\n\n回复", true, true],
    ["3", "u1@im.wechat", "u1@im.wechat", "语音转文字", true, true],
    ["6", "group:r1", "u1@im.wechat", "你好", false, true],
  ]);
  assert.deepEqual(got[1].images, [{ param: "p1", url: "", key: "k1", name: "" }]);
  assert.deepEqual(got[1].files, [{ param: "p2", url: "", key: "k2", name: "a.pdf" }]);
  assert.equal(kept.data.cursor, "c1");
  assert.deepEqual(JSON.parse(kept.data.tokens), { "u1@im.wechat": "ct1", r1: "ct1" });
  assert.equal(calls[1].body.get_updates_buf, "c1", "the next poll continues from the new cursor");
  socket.stop();
});

test("weixin replies echo the context token, drop Markdown, retry a stale token once without it, and split long text", async t => {
  const { socket, got, calls } = await connect({
    getupdates: (body, n) => n === 1 ? { ret: 0, get_updates_buf: "c1", msgs: [user()] } : "hang",
    sendmessage: (body, n) => n === 1 ? { ret: -14 } : { ret: 0 },
  });
  await flush();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sent = socket.send("u1@im.wechat", "## 标题\n**粗体** [链接](https://a.test)");
  await settle(t, 0);
  await sent;
  const posts = calls.filter(call => call.name === "sendmessage");
  assert.equal(posts[0].body.msg.context_token, "ct1");
  assert.equal(posts[0].body.msg.item_list[0].text_item.text, "标题\n粗体 链接 (https://a.test)");
  assert.equal(posts[1].body.msg.context_token, undefined, "the stale token is dropped for the retry");
  assert.equal(posts[1].body.msg.to_user_id, "u1@im.wechat");
  const long = socket.send("u1@im.wechat", "字".repeat(4500));
  await settle(t, 1500);
  await long;
  assert.deepEqual(calls.filter(call => call.name === "sendmessage").slice(2).map(call => call.body.msg.item_list[0].text_item.text.length), [2000, 2000, 500]);
  assert.equal(got.length, 1);
  socket.stop();
});

test("a group message is answered in the room with the room's token", async t => {
  const { socket, got, calls } = await connect({ getupdates: (body, n) => n === 1 ? { ret: 0, get_updates_buf: "c1", msgs: [user({ room_id: "r9", context_token: "grp-token" })] } : "hang" });
  await flush();
  assert.deepEqual([got[0].conversationId, got[0].direct, got[0].senderId], ["group:r9", false, "u1@im.wechat"]);
  await socket.send("group:r9", "收到");
  const post = calls.find(call => call.name === "sendmessage").body.msg;
  assert.deepEqual([post.to_user_id, post.context_token], ["r9", "grp-token"]);
  socket.stop();
});

test("a rate limit backs off and tries again; a real error is reported", async t => {
  const { socket, calls } = await connect({ sendmessage: (body, n) => n === 1 ? { ret: -2, errmsg: "frequency limit" } : n === 3 ? { ret: 1, errmsg: "boom" } : { ret: 0 } });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const first = socket.send("u2", "hi");
  await settle(t, 3000);
  await first;
  assert.equal(calls.filter(call => call.name === "sendmessage").length, 2);
  const second = socket.send("u2", "again").catch(error => error);
  await settle(t, 1500);
  assert.match((await second).message, /boom/);
  socket.stop();
});

test("a failed first poll rejects start and the loop retries; an expired login stops for good", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const states = [];
  const api = fakeApi({ getupdates: (body, n) => n === 1 ? new Response("down", { status: 502 }) : n === 2 ? { ret: 0, msgs: [], get_updates_buf: "c1" } : "hang" });
  const socket = createWeixinSocket({ fields: { token: "t", accountId: "a" }, state: memoryState(), onMessage() {}, onState: (value, error) => states.push([value, error]), fetchImpl: api.fetchImpl });
  const started = socket.start().catch(error => error);
  await settle(t);
  assert.match((await started).message, /HTTP 502/);
  assert.deepEqual(states.map(item => item[0]), ["disconnected"]);
  await settle(t, 2000);
  assert.deepEqual(states.map(item => item[0]), ["disconnected", "connected"]);
  socket.stop();

  const gone = fakeApi({ getupdates: { ret: 0, errcode: -14, errmsg: "session expired" } });
  const quiet = [];
  const dead = createWeixinSocket({ fields: { token: "t", accountId: "a" }, state: memoryState(), onMessage() {}, onState: (value, error) => quiet.push([value, error]), fetchImpl: gone.fetchImpl });
  await assert.rejects(dead.start(), /expired/);
  await settle(t, 60_000);
  assert.equal(gone.calls.length, 1, "no retry after the login expired");
  assert.match(quiet[0][1], /scan the QR code again/);
});

test("QR login follows the ticket through scan, redirect, confirmation and expiry", async () => {
  const replies = [{ status: "wait" }, { status: "scaned" }, { status: "scaned_but_redirect", redirect_host: "h2.weixin.qq.com" },
    { status: "confirmed", bot_token: "tok", ilink_bot_id: "bot1@im.bot", baseurl: "https://h2.weixin.qq.com", ilink_user_id: "me@im.wechat" }, { status: "expired" }];
  const urls = [];
  const fetchImpl = async url => {
    urls.push(String(url));
    if (String(url).includes("get_bot_qrcode")) return new Response(JSON.stringify({ qrcode: "abc123", qrcode_img_content: "https://liteapp.weixin.qq.com/q/abc" }));
    return new Response(JSON.stringify(replies.shift()));
  };
  const login = createWeixinLogin(fetchImpl);
  const { ticket, qr } = await login.start();
  assert.equal(qr, "https://liteapp.weixin.qq.com/q/abc");
  assert.equal(urls[0], "https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3");
  assert.deepEqual(await login.poll(ticket), { status: "wait" });
  assert.deepEqual(await login.poll(ticket), { status: "scanned" });
  const moved = await login.poll(ticket);
  assert.equal(moved.status, "scanned");
  assert.equal(urls.at(-1), "https://ilinkai.weixin.qq.com/ilink/bot/get_qrcode_status?qrcode=abc123");
  const done = await login.poll(moved.ticket);
  assert.equal(urls.at(-1), "https://h2.weixin.qq.com/ilink/bot/get_qrcode_status?qrcode=abc123", "polling continues on the redirect host");
  assert.deepEqual(done, { status: "done", fields: { token: "tok", accountId: "bot1@im.bot", baseUrl: "https://h2.weixin.qq.com" }, owner: "me@im.wechat" });
  assert.equal((await login.poll(ticket)).status, "expired");
  await assert.rejects(createWeixinLogin(async () => new Response(JSON.stringify({ status: "confirmed" }))).poll(ticket), /without credentials/);
  const timedOut = createWeixinLogin(async () => { throw new DOMException("timed out", "TimeoutError"); });
  assert.deepEqual(await timedOut.poll(ticket), { status: "wait" });
});

test("Markdown is reduced to plain text outside code fences", () => {
  assert.equal(toWeixinText("# 标题\n**a** __b__ ~~c~~ ![](https://i.test/x.png)\n```\n**keep** # this\n```"), "标题\na b c https://i.test/x.png\n```\n**keep** # this\n```");
});

test("a quote without words of its own is the message, and a quoted picture or file is read", async () => {
  const quote = (type, extra, typed) => user({ message_id: typed + type, item_list: [{ type: 1, text_item: { text: typed }, ref_msg: { title: "引用标题", message_item: { type, ...extra } } }] });
  const media = { media: { encrypt_query_param: "p", aes_key: "k" } };
  const { socket, got } = await connect({ getupdates: (body, n) => n === 1 ? { ret: 0, get_updates_buf: "c1", msgs: [
    quote(1, { text_item: { text: "旧文字" } }, ""), quote(2, { image_item: media }, "这是什么"), quote(4, { file_item: { ...media, file_name: "a.pdf" } }, "")] } : "hang" });
  await flush();
  assert.deepEqual(got.map(item => [item.text, item.supported]), [["引用标题", true], ["> 引用标题\n\n这是什么", true], ["", true]]);
  assert.equal(got[1].images.length, 1);
  assert.equal(got[2].files.length, 1);
  socket.stop();
});

test("aesEcbEncrypt round-trips through aesEcbDecrypt, including empty and block-aligned data", async () => {
  const key = Uint8Array.from({ length: 16 }, (_, index) => index);
  for (const size of [0, 5, 16, 1000]) {
    const data = Uint8Array.from({ length: size }, (_, index) => index % 251);
    const encrypted = await aesEcbEncrypt(data, key);
    assert.equal(encrypted.length, size + 16 - size % 16);
    assert.deepEqual(await aesEcbDecrypt(encrypted, key), data);
  }
});
