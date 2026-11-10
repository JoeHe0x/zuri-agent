import type { ChannelAdapter, ChannelMedia, ChannelMessage, ChannelSocket, ChannelSocketState, ChannelStream, LoadedFile, LoadedImage } from "./channel-adapter.js";
import { base64, fetchChannelMedia, FILE_MAX_BYTES, IMAGE_MAX_BYTES, imageType, splitText } from "./channel-media.js";
import { md5 } from "./md5.js";

const DEFAULT_URL = "wss://openws.work.weixin.qq.com";
const PING_MS = 25_000; // Under the 30 s idle limit, so the socket keeps the MV3 worker awake.
const ACK_MS = 10_000, PING_MISSES = 2;
// The markdown limit is 20480 bytes; 5000 characters stay under it even for Chinese text.
const CHUNK_CHARS = 5000;
// WeCom allows 30 messages per minute per chat (errcode 846607); control messages may use the last 6.
const RATE_WINDOW_MS = 60_000, RATE_NORMAL = 24, RATE_MAX = 30;
const RATE_LIMITED = 846607;
// A reply stream lives about 6 minutes; resending the text as an unfinished frame refreshes it.
const STREAM_KEEPALIVE_MS = 120_000, STREAM_BYTES = 20480, STREAM_FRAMES = 85;
// 846609: the subscription behind this req_id is gone, so the reply flow is dead like an expired window.
const STREAM_EXPIRED = [846608, 846604, 846609], STREAM_CONFLICT = 6000;
// Media upload: 512 KB chunks, at most 100 of them; images up to 10 MB, anything else is sent as a file up to 20 MB.
const UPLOAD_CHUNK = 512 * 1024, UPLOAD_CHUNKS = 100;
const utf8Length = (text: string) => new TextEncoder().encode(text).length;

export interface WecomMessage extends ChannelMessage {
  /** `single:<userid>` or `group:<chatid>`. */
  conversationId: string;
  /** Encrypted image references; `loadImage` fetches and decrypts them. */
  images?: WecomImageRef[];
  /** Encrypted file references (PDF, Word, Excel...); `loadFile` fetches and decrypts them. */
  files?: WecomFileRef[];
}
export interface WecomImageRef { url: string; aeskey: string }
export interface WecomFileRef extends WecomImageRef { name: string }
export type { LoadedFile, LoadedImage };
export type WecomMedia = ChannelMedia;
export type WecomStream = ChannelStream;
export type WecomSocketState = ChannelSocketState;
export type WecomSocket = ChannelSocket;
export interface WecomSocketOptions {
  botId: string;
  secret: string;
  onMessage(message: WecomMessage): void;
  onState(state: WecomSocketState, error?: string): void;
  /** The bot's display name; a group message's leading `@name` is removed (names may contain spaces). */
  botName?: string;
  WebSocketImpl?: typeof WebSocket;
  url?: string;
}
type Frame = { cmd?: string; headers?: { req_id?: string }; body?: any; errcode?: number; errmsg?: string };


/** Download a WeCom attachment and decrypt it: AES-256-CBC, IV = key[0..16], PKCS#7 padded to 32 bytes. */
async function loadWecomBytes({ url, aeskey }: WecomImageRef, limit: number, fetchImpl: typeof fetch): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`download failed (${response.status})`);
  let data = new Uint8Array(await response.arrayBuffer());
  if (data.length > limit * 2) throw new Error("the attachment is too large");
  if (aeskey) {
    const raw = decodeURIComponent(aeskey);
    const key = Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), c => c.charCodeAt(0));
    if (key.length !== 32 || data.length % 16) throw new Error("invalid attachment key");
    const aes = (name: "AES-CBC") => crypto.subtle.importKey("raw", key, name, false, ["encrypt", "decrypt"]);
    const cbc = await aes("AES-CBC");
    // WebCrypto only accepts 16-byte padding: append one block that decrypts to valid padding, then strip WeCom's own.
    const tail = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: data.subarray(-16) }, cbc, new Uint8Array(0))).subarray(0, 16);
    const joined = new Uint8Array(data.length + 16);
    joined.set(data); joined.set(tail, data.length);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: key.subarray(0, 16) }, cbc, joined));
    const pad = plain[plain.length - 1];
    if (pad < 1 || pad > 32 || pad > plain.length) throw new Error("invalid attachment padding");
    data = plain.subarray(0, plain.length - pad);
  }
  if (data.length > limit) throw new Error("the attachment is too large");
  return data;
}

export async function loadWecomImage(ref: WecomImageRef, fetchImpl: typeof fetch = fetch): Promise<LoadedImage> {
  const data = await loadWecomBytes(ref, IMAGE_MAX_BYTES, fetchImpl);
  const type = imageType(data);
  return { dataUrl: `data:${type};base64,${base64(data)}`, type, name: `wecom.${type.slice(6)}` };
}

export async function loadWecomFile(ref: WecomFileRef, fetchImpl: typeof fetch = fetch): Promise<LoadedFile> {
  const data = await loadWecomBytes(ref, FILE_MAX_BYTES, fetchImpl);
  const name = ref.name || "wecom-file";
  return { base64: base64(data), name, mimeType: "application/octet-stream", size: data.length };
}

export const fetchWecomMedia = fetchChannelMedia;

export const chunks = (text: string, size = CHUNK_CHARS) => splitText(text, size);

/** WeCom intelligent bot, long-connection API mode. Replies use aibot_send_msg, which has no req_id window. */
export function createWecomSocket({ botId, secret, onMessage, onState, botName = "", WebSocketImpl = WebSocket, url = DEFAULT_URL }: WecomSocketOptions): WecomSocket {
  const pending = new Map<string, { resolve(frame: Frame): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  let ws: WebSocket | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let retry = 0;
  const sentAt = new Map<string, number[]>();
  const queues = new Map<string, Promise<unknown>>();
  const wake = new Set<() => void>();

  const sleep = (ms: number) => new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); wake.delete(done); resolve(); };
    const timer = setTimeout(done, ms);
    wake.add(done);
  });
  /** Wait until the chat has a free slot in its sliding window, then claim it. */
  async function take(id: string, control: boolean) {
    for (;;) {
      if (stopped) throw new Error("WeCom connection is closed");
      const now = Date.now();
      const log = (sentAt.get(id) || []).filter(at => now - at < RATE_WINDOW_MS);
      sentAt.set(id, log);
      if (log.length < (control ? RATE_MAX : RATE_NORMAL)) return void log.push(now);
      await sleep(log[0] + RATE_WINDOW_MS - now);
    }
  }

  const request = (cmd: string, body?: unknown, reqId: string = crypto.randomUUID()) => new Promise<Frame>((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocketImpl.OPEN) return reject(new Error("WeCom connection is closed"));
    const timer = setTimeout(() => { pending.delete(reqId); reject(new Error(`${cmd} timed out`)); }, ACK_MS);
    pending.set(reqId, { resolve, reject, timer });
    ws.send(JSON.stringify({ cmd, headers: { req_id: reqId }, body }));
  });
  const settle = (reqId: string | undefined, frame: Frame) => {
    const entry = reqId ? pending.get(reqId) : undefined;
    if (!entry || !reqId) return;
    pending.delete(reqId);
    clearTimeout(entry.timer);
    frame.errcode ? entry.reject(new Error(`WeCom error ${frame.errcode}: ${frame.errmsg}`)) : entry.resolve(frame);
  };

  function toMessage(body: any, reqId?: string): WecomMessage {
    const group = body.chattype === "group";
    const items: any[] = body.msgtype === "mixed" && Array.isArray(body.mixed?.msg_item) ? body.mixed.msg_item : [body];
    const parts = items.map(item => item.msgtype === "text" ? item.text?.content : item.msgtype === "voice" ? item.voice?.content : item.msgtype === "appmsg" ? item.appmsg?.title : "");
    const text = parts.filter(Boolean).map(String).join("\n");
    const quoted = String(body.quote?.text?.content ?? body.quote?.voice?.content ?? "").trim();
    const mention = botName && text.trimStart().startsWith(`@${botName}`) ? `@${botName}` : "";
    const full = (group ? (mention ? text.trimStart().slice(mention.length) : text.replace(/^\s*@\S+\s*/, "")) : text).trim();
    // A quoted picture or file is read like one sent with the message.
    const quote = body.quote && typeof body.quote === "object" ? body.quote : {};
    const withQuote = quote.msgtype === "image" || quote.msgtype === "file" ? [...items, quote] : items;
    const images = withQuote.filter(item => item.msgtype === "image" && item.image?.url).map(item => ({ url: String(item.image.url), aeskey: String(item.image.aeskey || "") }));
    const files = withQuote.flatMap(item => item.msgtype === "file" ? [item.file] : item.msgtype === "appmsg" ? [item.appmsg?.file] : [])
      .filter(file => file?.url).map(file => ({ url: String(file.url), aeskey: String(file.aeskey || ""), name: String(file.filename || file.name || "") }));
    // Quoting a message without adding words: the quote is the message.
    const combined = full ? (quoted ? `> ${quoted.replace(/\s+/g, " ")}\n\n${full}` : full) : quoted;
    if (!combined && !images.length && !files.length) console.info("[channels:wecom] unsupported_message", JSON.stringify({ msgtype: body.msgtype, quote: quote.msgtype }));
    return {
      messageId: String(body.msgid || ""), reqId, senderId: String(body.from?.userid || ""), direct: !group,
      conversationId: group ? `group:${body.chatid}` : `single:${body.from?.userid}`,
      text: combined, images, files, supported: Boolean(combined || images.length || files.length),
    };
  }

  function onFrame(frame: Frame) {
    if (frame.cmd === "aibot_msg_callback") {
      if (!frame.body?.compat_info) onMessage(toMessage(frame.body, frame.headers?.req_id));
    } else if (frame.cmd === "aibot_event_callback") {
      if (frame.body?.event?.eventtype === "disconnected_event") {
        stopped = true; // A newer connection took over; reconnecting would kick it out again.
        onState("replaced");
      }
    } else if (!frame.cmd) settle(frame.headers?.req_id, frame);
  }

  function connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = ws = new WebSocketImpl(url);
      /** Idempotent: a dead connection is dropped here without waiting for the browser's close event. */
      const closed = () => {
        if (ws !== socket) return;
        ws = undefined;
        clearInterval(pingTimer);
        for (const id of [...pending.keys()]) settle(id, { errcode: -1, errmsg: "connection closed" });
        reject(new Error("connection closed"));
        if (stopped) return;
        onState("disconnected", "connection closed");
        retryTimer = setTimeout(() => { connect().catch(() => {}); }, Math.min(30_000, 1000 * 2 ** retry++));
      };
      socket.onopen = () => {
        request("aibot_subscribe", { bot_id: botId, secret }).then(() => {
          retry = 0;
          let misses = 0;
          pingTimer = setInterval(() => {
            request("ping").then(() => { misses = 0; }, () => {
              // Two unanswered pings: the link is dead (network switch, sleep) even though no close event came.
              if (++misses >= PING_MISSES) { socket.close(); closed(); }
            });
          }, PING_MS);
          onState("connected");
          resolve();
        }, failure => { reject(failure); socket.close(); closed(); }); // A rejected or timed-out subscribe also reconnects with backoff.
      };
      socket.onmessage = event => { try { onFrame(JSON.parse(String(event.data))); } catch { /* Ignore malformed frames. */ } };
      socket.onclose = closed;
    });
  }

  const target = (conversationId: string) => {
    const separator = conversationId.indexOf(":");
    return { kind: conversationId.slice(0, separator), id: conversationId.slice(separator + 1) };
  };
  /** Sends to one chat run one after another. */
  function enqueue(conversationId: string, run: () => Promise<void>) {
    const next = (queues.get(conversationId) || Promise.resolve()).catch(() => {}).then(run);
    queues.set(conversationId, next);
    const clear = () => { if (queues.get(conversationId) === next) queues.delete(conversationId); };
    next.then(clear, clear);
    return next;
  }

  const streams = new Set<() => void>();
  function openStream(reqId: string, prefix = ""): WecomStream {
    const id = `stream_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const texts: string[] = [];
    let shown = 0, frames = 0, dead = false, busy: Promise<void> | undefined;
    const content = (count: number) => prefix + texts.slice(0, count).join("\n\n");
    const failed = (failure: unknown, code: number) => String((failure as Error).message).includes(`error ${code}:`);
    /** True when WeCom took the frame. Expired windows mark the stream dead; other failures may succeed on a later frame. */
    const frame = (count: number, finish: boolean) => request("aibot_respond_msg", { msgtype: "stream", stream: { id, finish, content: content(count) } }, reqId)
      .then(() => true, failure => {
        if (STREAM_EXPIRED.some(code => failed(failure, code))) dead = true;
        return finish && failed(failure, STREAM_CONFLICT); // The bubble was already replaced by a newer frame.
      });
    const exclusive = (task: () => Promise<void>) => { busy ||= task().finally(() => { busy = undefined; }); };
    const advance = () => exclusive(async () => {
      while (!dead && shown < texts.length && frames < STREAM_FRAMES && utf8Length(content(texts.length)) <= STREAM_BYTES) {
        const count = texts.length;
        if (!await frame(count, false)) return;
        shown = count; frames++;
      }
    });
    const keepalive = setInterval(() => {
      if (shown && !dead && frames < STREAM_FRAMES) exclusive(async () => { if (await frame(shown, false)) frames++; });
    }, STREAM_KEEPALIVE_MS);
    const close = () => { clearInterval(keepalive); streams.delete(close); };
    streams.add(close);
    return {
      add(text) { texts.push(text); advance(); },
      async end() {
        close();
        await busy;
        if (dead || !texts.length) return texts.slice(shown);
        // Past the byte limit only the part already on screen can be finished; the rest goes out as plain messages.
        const count = utf8Length(content(texts.length)) <= STREAM_BYTES ? texts.length : shown;
        if (count && await frame(count, true)) shown = count;
        return texts.slice(shown);
      },
    };
  }

  return {
    start: connect,
    stream: openStream,
    send(conversationId, text, { control = false } = {}) {
      const { kind, id } = target(conversationId);
      const post = async (content: string) => {
        const body = { chatid: id, chat_type: kind === "group" ? 2 : 1, msgtype: "markdown", markdown: { content } };
        await take(conversationId, control);
        try { await request("aibot_send_msg", body); } catch (failure) {
          if (!String((failure as Error).message).includes(String(RATE_LIMITED))) throw failure;
          sentAt.set(conversationId, Array(RATE_MAX).fill(Date.now())); // Our count was low (e.g. after a restart): wait out the window once.
          await take(conversationId, control);
          await request("aibot_send_msg", body);
        }
      };
      return enqueue(conversationId, async () => { for (const content of chunks(text)) await post(content); });
    },
    sendMedia(conversationId, { type, filename, data }) {
      const { kind, id } = target(conversationId);
      return enqueue(conversationId, async () => {
        const chunkCount = Math.ceil(data.length / UPLOAD_CHUNK);
        if (!chunkCount || chunkCount > UPLOAD_CHUNKS) throw new Error("the file is empty or too large to upload");
        const init = await request("aibot_upload_media_init", { type, filename, total_size: data.length, total_chunks: chunkCount, md5: md5(data) });
        const uploadId = String(init.body?.upload_id || "");
        if (!uploadId) throw new Error("media upload init returned no upload_id");
        for (let index = 0; index < chunkCount; index++) {
          await request("aibot_upload_media_chunk", { upload_id: uploadId, chunk_index: index, base64_data: base64(data.subarray(index * UPLOAD_CHUNK, (index + 1) * UPLOAD_CHUNK)) });
        }
        const finished = await request("aibot_upload_media_finish", { upload_id: uploadId });
        const mediaId = String(finished.body?.media_id || "");
        if (!mediaId) throw new Error("media upload finish returned no media_id");
        await take(conversationId, false);
        await request("aibot_send_msg", { chatid: id, chat_type: kind === "group" ? 2 : 1, msgtype: type, [type]: { media_id: mediaId } });
      });
    },
    sendImageLink(conversationId, url) {
      const { kind, id } = target(conversationId);
      return enqueue(conversationId, async () => {
        await take(conversationId, false);
        await request("aibot_send_msg", { chatid: id, chat_type: kind === "group" ? 2 : 1, msgtype: "template_card", template_card: {
          card_type: "news_notice", main_title: { title: "图片" }, card_image: { url, aspect_ratio: 1.3 }, card_action: { type: 1, url } } });
      });
    },
    stop() {
      stopped = true;
      for (const close of [...streams]) close();
      clearInterval(pingTimer);
      clearTimeout(retryTimer);
      for (const done of [...wake]) done();
      ws?.close();
    },
  };
}

export const wecomAdapter: ChannelAdapter = {
  id: "wecom",
  label: "企业微信",
  fields: [{ key: "botId" }, { key: "secret", secret: true }, { key: "botName", optional: true }],
  createSocket: ({ fields, onMessage, onState }) => createWecomSocket({ botId: fields.botId, secret: fields.secret, botName: fields.botName, onMessage, onState }),
  loadImage: image => loadWecomImage(image),
  loadFile: file => loadWecomFile(file),
  fetchMedia: (url, name) => fetchWecomMedia(url, name),
};
