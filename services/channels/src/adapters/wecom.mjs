import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const URL_DEFAULT = "wss://openws.work.weixin.qq.com";
const PING_MS = 30_000;
const ACK_MS = 10_000;
// The markdown limit is 20480 bytes; 5000 characters stay under it even for Chinese text.
const CHUNK_CHARS = 5000;

export const chunks = (text, size = CHUNK_CHARS) =>
  Array.from({ length: Math.max(1, Math.ceil(text.length / size)) }, (_, i) => text.slice(i * size, (i + 1) * size));

/** WeCom intelligent bot, long-connection API mode. Replies use aibot_send_msg, which needs no req_id window. */
export default function createAdapter(config, env, { log = () => {}, WebSocketImpl = WebSocket, url = URL_DEFAULT } = {}) {
  const botId = env.WECOM_BOT_ID, secret = env.WECOM_BOT_SECRET;
  if (!botId || !secret) throw new Error("Set WECOM_BOT_ID and WECOM_BOT_SECRET in .env.local.");
  const pending = new Map();
  let ws, onMessage, pingTimer, stopped = false, retry = 0;

  const request = (cmd, body) => new Promise((resolve, reject) => {
    const reqId = randomUUID();
    const timer = setTimeout(() => { pending.delete(reqId); reject(new Error(`${cmd} timed out`)); }, ACK_MS);
    pending.set(reqId, { resolve, reject, timer });
    ws.send(JSON.stringify({ cmd, headers: { req_id: reqId }, body }));
  });
  const settle = (reqId, frame) => {
    const entry = pending.get(reqId);
    if (!entry) return;
    pending.delete(reqId);
    clearTimeout(entry.timer);
    frame.errcode ? entry.reject(new Error(`WeCom error ${frame.errcode}: ${frame.errmsg}`)) : entry.resolve(frame);
  };

  function toMessage(body) {
    const group = body.chattype === "group";
    const text = body.text?.content ?? "";
    return { channel: "wecom", messageId: body.msgid, senderId: body.from?.userid, direct: !group,
      // WeCom pushes group messages only when the bot is mentioned.
      mentioned: group, conversationId: group ? `group:${body.chatid}` : `single:${body.from?.userid}`,
      text: (group ? text.replace(/^\s*@\S+\s*/, "") : text).trim() };
  }

  function onFrame(frame) {
    const reqId = frame.headers?.req_id;
    if (frame.cmd === "aibot_msg_callback") {
      const body = frame.body;
      log("recv", { channel: "wecom", chattype: body.chattype, msgtype: body.msgtype, compat: body.compat_info?.source });
      if (body.compat_info) return;
      if (body.msgtype !== "text") {
        return void send({ conversationId: toMessage(body).conversationId }, "目前只支持文字消息。").catch(() => {});
      }
      return onMessage(toMessage(body));
    }
    if (frame.cmd === "aibot_event_callback" && frame.body?.event?.eventtype === "disconnected_event") {
      stopped = true; // A newer connection took over; reconnecting would kick it out again.
      return log("disconnected", { channel: "wecom" });
    }
    if (!frame.cmd) settle(reqId, frame);
  }

  function connect() {
    return new Promise((resolve, reject) => {
      ws = new WebSocketImpl(url);
      ws.onopen = () => request("aibot_subscribe", { bot_id: botId, secret }).then(() => {
        retry = 0;
        pingTimer = setInterval(() => request("ping").catch(error => log("ping_failed", { message: error.message })), PING_MS);
        resolve();
      }, reject);
      ws.onmessage = event => { try { onFrame(JSON.parse(event.data)); } catch (error) { log("bad_frame", { message: error.message }); } };
      // Node's built-in WebSocket fails WeCom's handshake; the ws package works.
      ws.onerror = event => log("socket_error", { message: event.message });
      ws.onclose = () => {
        clearInterval(pingTimer);
        for (const [id] of pending) settle(id, { errcode: -1, errmsg: "connection closed" });
        reject(new Error("connection closed"));
        if (!stopped) setTimeout(() => connect().catch(() => {}), Math.min(30_000, 1000 * 2 ** retry++));
      };
    });
  }

  async function send(conversation, text) {
    const [kind, id] = conversation.conversationId.split(/:(.*)/s);
    for (const content of chunks(text)) {
      await request("aibot_send_msg", { chatid: id, chat_type: kind === "group" ? 2 : 1, msgtype: "markdown", markdown: { content } });
    }
  }

  return {
    id: "wecom",
    start: async handler => { onMessage = handler; await connect(); },
    send,
    stop: async () => { stopped = true; clearInterval(pingTimer); ws?.close(); },
  };
}
