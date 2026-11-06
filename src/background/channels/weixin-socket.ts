import type { ChannelAdapter, ChannelLogin, ChannelMessage, ChannelSocket, ChannelSocketOptions, LoadedFile, LoadedImage } from "./channel-adapter.js";
import { base64, FILE_MAX_BYTES, IMAGE_MAX_BYTES, fetchChannelMedia, imageType, splitText } from "./channel-media.js";
import { md5 } from "./md5.js";

// Personal WeChat through Tencent's iLink Bot API (the one behind WeChat's ClawBot): the account signs in by scanning a QR code,
// messages arrive by long polling `getupdates`, and every reply echoes the peer's latest `context_token`.
const BASE_URL = "https://ilinkai.weixin.qq.com";
const CDN_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const CDN_HOSTS = new Set(["novac2c.cdn.weixin.qq.com", "ilinkai.weixin.qq.com", "wx.qlogo.cn", "thirdwx.qlogo.cn", "res.wx.qq.com", "mmbiz.qpic.cn", "mmbiz.qlogo.cn"]);
const APP_VERSION = String((2 << 16) | (2 << 8) | 0);
const CHANNEL_VERSION = "2.2.0";
// The Background worker sleeps after 30 s without activity, so a poll is cut at 25 s; the cursor makes an empty poll harmless.
const POLL_MS = 25_000, API_MS = 15_000, LOGIN_POLL_MS = 30_000;
const RETRY_MS = 2000, BACKOFF_MS = 30_000, FAILURES_BEFORE_BACKOFF = 3;
// A text message is at most 2000 characters; chunks go out 1.5 s apart.
const CHUNK_CHARS = 2000, SEND_GAP_MS = 1500, SEND_ATTEMPTS = 4;
const SESSION_EXPIRED = -14, RATE_LIMITED = -2;
const TOKENS_KEPT = 100;
const ITEM_TEXT = 1, ITEM_IMAGE = 2, ITEM_VOICE = 3, ITEM_FILE = 4, MESSAGE_BOT = 2, STATE_FINISH = 2;

export interface WeixinMediaRef { param: string; key: string; url: string; name: string }
export interface WeixinSocketOptions extends ChannelSocketOptions { fetchImpl?: typeof fetch }

const headers = (token?: string) => ({
  "Content-Type": "application/json", AuthorizationType: "ilink_bot_token", "iLink-App-Id": "bot", "iLink-App-ClientVersion": APP_VERSION,
  "X-WECHAT-UIN": btoa(String(crypto.getRandomValues(new Uint32Array(1))[0])),
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
const errorCodes = (reply: any) => [reply?.ret, reply?.errcode].filter(code => typeof code === "number" && code !== 0) as number[];
// -2 with these messages means the login behind the token is stale, not that the account is sending too fast.
const stale = (reply: any) => errorCodes(reply).includes(RATE_LIMITED) && ["unknown error", "prepare failed"].includes(String(reply?.errmsg || reply?.msg || "").toLowerCase());
const expired = (reply: any) => errorCodes(reply).includes(SESSION_EXPIRED) || stale(reply);
const describe = (reply: any) => `ret=${reply?.ret} errcode=${reply?.errcode} ${reply?.errmsg || reply?.msg || ""}`.trim();

/** WeChat shows plain text: Markdown markers are dropped and links keep their address. */
export const toWeixinText = (text: string) => text.split(/(```[\s\S]*?```)/).map((part, index) => index % 2 ? part : part
  .replace(/!\[[^\]]*\]\(([^)\s]+)\)/g, "$1").replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
  .replace(/^#{1,6}\s+/gm, "").replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/__([^_\n]+)__/g, "$1").replace(/~~([^~\n]+)~~/g, "$1")
  .replace(/\n{3,}/g, "\n\n")).join("").trim();

/**
 * AES-128-ECB with PKCS#7. WebCrypto has no ECB, so it is derived from CBC: decrypting with a zero IV yields D(Cᵢ) ⊕ Cᵢ₋₁,
 * and XOR with the previous ciphertext block gives D(Cᵢ). A final block is appended that CBC accepts as padding, since
 * WebCrypto insists on stripping padding of its own.
 */
export async function aesEcbDecrypt(data: Uint8Array<ArrayBuffer>, rawKey: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (!data.length || data.length % 16 || rawKey.length !== 16) throw new Error("invalid attachment");
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-CBC", false, ["encrypt", "decrypt"]);
  const tail = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: data.subarray(-16) }, key, new Uint8Array(0))).subarray(0, 16);
  const joined = new Uint8Array(data.length + 16);
  joined.set(data); joined.set(tail, data.length);
  const out = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: new Uint8Array(16) }, key, joined));
  for (let i = 16; i < out.length; i++) out[i] ^= data[i - 16];
  const pad = out[out.length - 1];
  // Lenient like the platform's own clients: bytes without well-formed padding are returned whole.
  return pad >= 1 && pad <= 16 && out.subarray(out.length - pad).every(byte => byte === pad) ? out.subarray(0, out.length - pad) : out;
}

/** AES-128-ECB with PKCS#7. WebCrypto has no ECB, so each block is a one-block CBC encryption under a zero IV (its extra padding block is dropped). */
export async function aesEcbEncrypt(data: Uint8Array, rawKey: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-CBC", false, ["encrypt"]);
  const pad = 16 - data.length % 16;
  const plain = new Uint8Array(data.length + pad);
  plain.set(data); plain.fill(pad, data.length);
  const out = new Uint8Array(plain.length), iv = new Uint8Array(16), batch = 256 * 16;
  for (let start = 0; start < plain.length; start += batch) {
    const offsets = Array.from({ length: Math.ceil(Math.min(batch, plain.length - start) / 16) }, (_, index) => start + index * 16);
    await Promise.all(offsets.map(async offset => out.set(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, plain.subarray(offset, offset + 16))).subarray(0, 16), offset)));
  }
  return out;
}

/** The key is base64 of 16 raw bytes, or base64 of 32 hex characters. */
function parseKey(encoded: string): Uint8Array<ArrayBuffer> {
  const raw = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  if (raw.length === 16) return raw;
  const text = String.fromCharCode(...raw);
  if (raw.length === 32 && /^[0-9a-f]+$/i.test(text)) return Uint8Array.from(text.match(/../g)!, pair => parseInt(pair, 16));
  throw new Error("invalid attachment key");
}

async function download(ref: WeixinMediaRef, limit: number, fetchImpl: typeof fetch) {
  let url: string;
  if (ref.param) url = `${CDN_URL}/download?encrypted_query_param=${encodeURIComponent(ref.param)}`;
  else if (ref.url && CDN_HOSTS.has(new URL(ref.url).hostname) && new URL(ref.url).protocol === "https:") url = ref.url;
  else throw new Error("the attachment has no downloadable address");
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`download failed (${response.status})`);
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.length > limit * 2) throw new Error("the attachment is too large");
  const data = ref.key ? await aesEcbDecrypt(raw, parseKey(ref.key)) : raw;
  if (data.length > limit) throw new Error("the attachment is too large");
  return data;
}
export async function loadWeixinImage(ref: WeixinMediaRef, fetchImpl: typeof fetch = fetch): Promise<LoadedImage> {
  const data = await download(ref, IMAGE_MAX_BYTES, fetchImpl);
  const type = imageType(data);
  return { dataUrl: `data:${type};base64,${base64(data)}`, type, name: `weixin.${type.slice(6)}` };
}
export async function loadWeixinFile(ref: WeixinMediaRef, fetchImpl: typeof fetch = fetch): Promise<LoadedFile> {
  const data = await download(ref, FILE_MAX_BYTES, fetchImpl);
  return { base64: base64(data), name: ref.name || "weixin-file", mimeType: "application/octet-stream", size: data.length };
}

const timeout = (ms: number, signal?: AbortSignal) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
const aborted = (failure: unknown) => failure instanceof DOMException && (failure.name === "TimeoutError" || failure.name === "AbortError");

async function get(url: string, fetchImpl: typeof fetch, ms: number) {
  const response = await fetchImpl(url, { headers: { "iLink-App-Id": "bot", "iLink-App-ClientVersion": APP_VERSION }, signal: timeout(ms) });
  if (!response.ok) throw new Error(`iLink HTTP ${response.status}`);
  return response.json();
}

/** Sign in by scanning a QR code in WeChat. WeChat must scan `qrcode_img_content` (a mini-program link), not the bare token. */
export function createWeixinLogin(fetchImpl: typeof fetch = fetch): ChannelLogin {
  return {
    async start() {
      const reply = await get(`${BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`, fetchImpl, API_MS);
      const qrcode = String(reply.qrcode || "");
      if (!qrcode) throw new Error("iLink returned no QR code");
      return { ticket: JSON.stringify({ qrcode, base: BASE_URL }), qr: String(reply.qrcode_img_content || qrcode) };
    },
    async poll(ticket) {
      const { qrcode, base } = JSON.parse(ticket) as { qrcode: string; base: string };
      let reply: any;
      try { reply = await get(`${base}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, fetchImpl, LOGIN_POLL_MS); } catch (failure) {
        if (aborted(failure)) return { status: "wait" }; // The server holds the request open; no news is not an error.
        throw failure;
      }
      switch (String(reply.status || "wait")) {
        case "scaned": return { status: "scanned" };
        case "expired": return { status: "expired" };
        // The account lives on another host; keep asking there.
        case "scaned_but_redirect": return reply.redirect_host ? { status: "scanned", ticket: JSON.stringify({ qrcode, base: `https://${reply.redirect_host}` }) } : { status: "scanned" };
        case "confirmed": {
          const token = String(reply.bot_token || ""), accountId = String(reply.ilink_bot_id || "");
          if (!token || !accountId) throw new Error("iLink confirmed the login without credentials");
          return { status: "done", fields: { token, accountId, baseUrl: String(reply.baseurl || BASE_URL) }, owner: String(reply.ilink_user_id || "") };
        }
        default: return { status: "wait" };
      }
    },
  };
}

export function createWeixinSocket({ fields, state, onMessage, onState, fetchImpl = fetch }: WeixinSocketOptions): ChannelSocket {
  const { token, accountId } = fields;
  const base = fields.baseUrl || BASE_URL;
  const stop = new AbortController();
  let stopped = false, connected = false, cursor = "";
  let ready: { resolve(): void; reject(error: Error): void } | undefined;
  // Replies must carry the latest context_token of the person they answer; kept across restarts.
  let tokens: Record<string, string> = {};
  const queues = new Map<string, Promise<unknown>>();

  async function api(endpoint: string, payload: Record<string, unknown>, ms = API_MS, signal?: AbortSignal) {
    const body = JSON.stringify({ ...payload, base_info: { channel_version: CHANNEL_VERSION } });
    const response = await fetchImpl(`${base.replace(/\/$/, "")}/${endpoint}`, { method: "POST", headers: headers(token), body, signal: timeout(ms, signal) });
    if (!response.ok) throw new Error(`iLink HTTP ${response.status}`);
    return response.json();
  }
  const pause = (ms: number) => new Promise<void>(resolve => {
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); stop.signal.removeEventListener("abort", done); resolve(); }
    stop.signal.addEventListener("abort", done, { once: true });
  });

  function toMessage(message: any): ChannelMessage | undefined {
    const sender = String(message.from_user_id || "");
    if (!sender || sender === accountId || message.message_type === MESSAGE_BOT) return;
    // A room id marks a group message. iLink may not deliver group events to a bot account at all, so this is best effort;
    // replies go to the room, and the log line (ids only) shows whether any ever arrive.
    const room = String(message.room_id || message.chat_room_id || "");
    if (room) console.info("[channels:weixin] group_message", JSON.stringify({ room }));
    const items: any[] = Array.isArray(message.item_list) ? message.item_list : [];
    const ref = (item: any, key: string): WeixinMediaRef => ({ param: String(item[key]?.media?.encrypt_query_param || ""), url: String(item[key]?.media?.full_url || ""),
      // An image may carry a raw hex key beside its media block.
      key: key === "image_item" && item[key]?.aeskey ? btoa(String(item[key].aeskey)) : String(item[key]?.media?.aes_key || ""), name: String(item[key]?.file_name || "") });
    const textItem = items.find(item => item.type === ITEM_TEXT);
    const quotedItem = textItem?.ref_msg?.message_item;
    const quotedMedia = quotedItem?.type === ITEM_IMAGE || quotedItem?.type === ITEM_FILE;
    // A quoted picture or file is read like one sent with the message; its title (the file name) stands in for text.
    const quoted = String(textItem?.ref_msg?.title || quotedItem?.text_item?.text || "").trim();
    const typed = String(textItem?.text_item?.text || "").trim();
    // Voice arrives with WeChat's own transcript, which is all there is to read.
    const spoken = typed ? "" : String(items.find(item => item.type === ITEM_VOICE)?.voice_item?.text || "").trim();
    // Quoting a message without adding words: the quote is the message.
    const text = quoted && typed ? `> ${quoted.replace(/\s+/g, " ")}\n\n${typed}` : typed || spoken || (quotedMedia ? "" : quoted);
    const withQuote = quotedItem ? [...items, quotedItem] : items;
    const images = withQuote.filter(item => item.type === ITEM_IMAGE).map(item => ref(item, "image_item"));
    const files = withQuote.filter(item => item.type === ITEM_FILE).map(item => ref(item, "file_item"));
    if (!text && !images.length && !files.length) console.info("[channels:weixin] unsupported_message", JSON.stringify({ items: items.map(item => item.type), quoted: quotedItem?.type }));
    if (message.context_token) tokens[room || sender] = String(message.context_token);
    return { messageId: String(message.message_id || `${sender}:${message.create_time_ms || message.create_time || Date.now()}`), senderId: sender, conversationId: room ? `group:${room}` : sender, direct: !room,
      text, images, files, supported: Boolean(text || images.length || files.length) };
  }

  const remember = () => {
    const users = Object.keys(tokens);
    if (users.length > TOKENS_KEPT) for (const user of users.slice(0, users.length - TOKENS_KEPT)) delete tokens[user];
    return state.write({ cursor, tokens: JSON.stringify(tokens) }).catch(() => {});
  };

  async function loop() {
    const saved = await state.read().catch(() => ({} as Record<string, string>));
    cursor = saved.cursor || "";
    try { tokens = JSON.parse(saved.tokens || "{}"); } catch { tokens = {}; }
    let failures = 0;
    while (!stopped) {
      try {
        const reply = await api("ilink/bot/getupdates", { get_updates_buf: cursor }, POLL_MS, stop.signal).catch(failure => {
          if (aborted(failure) && !stopped) return { ret: 0, msgs: [] }; // A cut poll is an empty one.
          throw failure;
        });
        if (errorCodes(reply).length) {
          if (expired(reply)) {
            // Only a new QR sign-in repairs this, so stop instead of retrying.
            stopped = true; connected = false;
            const error = new Error("The WeChat login has expired; scan the QR code again");
            ready?.reject(error); ready = undefined;
            onState("disconnected", error.message);
            return;
          }
          throw new Error(`iLink getupdates: ${describe(reply)}`);
        }
        failures = 0;
        if (!connected) { connected = true; onState("connected"); }
        ready?.resolve(); ready = undefined;
        // Deliver before saving the cursor, so a crash in between repeats a message (which is dropped) rather than losing one.
        for (const message of Array.isArray(reply.msgs) ? reply.msgs : []) { const mapped = toMessage(message); if (mapped) onMessage(mapped); }
        const next = String(reply.get_updates_buf || "");
        if (next && next !== cursor) { cursor = next; await remember(); } else if (Array.isArray(reply.msgs) && reply.msgs.length) await remember();
      } catch (failure) {
        if (stopped) return;
        const error = failure instanceof Error ? failure : new Error(String(failure));
        ready?.reject(error); ready = undefined;
        if (connected || failures === 0) { connected = false; onState("disconnected", error.message); }
        failures++;
        await pause(failures >= FAILURES_BEFORE_BACKOFF ? BACKOFF_MS : RETRY_MS);
        if (failures >= FAILURES_BEFORE_BACKOFF) failures = 0;
      }
    }
  }

  function enqueue(conversationId: string, run: () => Promise<void>) {
    const next = (queues.get(conversationId) || Promise.resolve()).catch(() => {}).then(run);
    queues.set(conversationId, next);
    const clear = () => { if (queues.get(conversationId) === next) queues.delete(conversationId); };
    next.then(clear, clear);
    return next;
  }
  async function post(conversationId: string, text: string) { return postItems(conversationId, [{ type: ITEM_TEXT, text_item: { text } }]); }
  async function postItems(conversationId: string, items: Record<string, unknown>[]) {
    const to = conversationId.startsWith("group:") ? conversationId.slice(6) : conversationId;
    let context = tokens[to];
    let retriedBare = false;
    for (let attempt = 1; ; attempt++) {
      if (stopped) throw new Error("WeChat connection is closed");
      const reply = await api("ilink/bot/sendmessage", { msg: { from_user_id: "", to_user_id: to, client_id: `zuri-${crypto.randomUUID()}`, message_type: MESSAGE_BOT, message_state: STATE_FINISH,
        item_list: items, ...(context ? { context_token: context } : {}) } });
      if (!errorCodes(reply).length) return;
      // A stale token is retried once without it: iLink accepts a tokenless send, which also lets a push reach someone who has not written lately.
      if (expired(reply) && context && !retriedBare) { retriedBare = true; context = ""; delete tokens[to]; continue; }
      if (errorCodes(reply).includes(RATE_LIMITED) && !stale(reply) && attempt < SEND_ATTEMPTS) { await pause(3000 * attempt); continue; }
      throw new Error(`iLink sendmessage: ${describe(reply)}`);
    }
  }

  return {
    start: () => new Promise<void>((resolve, reject) => { ready = { resolve, reject }; void loop(); }),
    send: (conversationId, text) => enqueue(conversationId, async () => {
      // shortcut: plain character chunks, so a code fence can split across two messages; split on blank lines if that shows up.
      const parts = splitText(toWeixinText(text), CHUNK_CHARS).filter(part => part.trim());
      for (const [index, part] of parts.entries()) { if (index) await pause(SEND_GAP_MS); await post(conversationId, part); }
    }),
    // iLink cannot show an image by URL, so the link itself is sent for the person to open.
    sendImageLink: (conversationId, url) => enqueue(conversationId, () => post(conversationId, url)),
    // Upload protocol as in WeChat's ClawBot plugin: encrypt, get an upload slot, PUT the ciphertext to the CDN, then send a message that carries the returned parameter and the key.
    sendMedia: (conversationId, { type, filename, data }) => enqueue(conversationId, async () => {
      const to = conversationId.startsWith("group:") ? conversationId.slice(6) : conversationId;
      const hex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
      const aesHex = hex(crypto.getRandomValues(new Uint8Array(16))), filekey = hex(crypto.getRandomValues(new Uint8Array(16)));
      const encrypted = await aesEcbEncrypt(data, Uint8Array.from(aesHex.match(/../g)!, pair => parseInt(pair, 16)));
      const slot = await api("ilink/bot/getuploadurl", { filekey, media_type: type === "image" ? 1 : 3, to_user_id: to, rawsize: data.length, rawfilemd5: md5(data), filesize: encrypted.length, no_need_thumb: true, aeskey: aesHex });
      const url = String(slot.upload_full_url || (slot.upload_param ? `${CDN_URL}/upload?encrypted_query_param=${encodeURIComponent(slot.upload_param)}&filekey=${filekey}` : ""));
      if (errorCodes(slot).length || !url) throw new Error(`iLink getuploadurl: ${describe(slot)}`);
      const target = new URL(url);
      if (target.protocol !== "https:" || !CDN_HOSTS.has(target.hostname)) throw new Error("the upload address is not a WeChat CDN");
      const uploaded = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: encrypted, signal: timeout(60_000, stop.signal) });
      const param = uploaded.headers.get("x-encrypted-param");
      if (!uploaded.ok || !param) throw new Error(`CDN upload failed (${uploaded.status})`);
      const media = { encrypt_query_param: param, aes_key: btoa(aesHex), encrypt_type: 1 };
      await postItems(conversationId, [type === "image" ? { type: ITEM_IMAGE, image_item: { media, mid_size: encrypted.length } }
        : { type: ITEM_FILE, file_item: { media, file_name: filename, len: String(data.length) } }]);
    }),
    stop() { stopped = true; stop.abort(); ready?.reject(new Error("WeChat connection is closed")); ready = undefined; },
  };
}

export const weixinAdapter: ChannelAdapter = {
  id: "weixin",
  label: "微信",
  // Filled in by the QR login.
  fields: [{ key: "token", secret: true, managed: true }, { key: "accountId", managed: true }, { key: "baseUrl", optional: true, managed: true }],
  login: createWeixinLogin(),
  createSocket: options => createWeixinSocket(options),
  loadImage: image => loadWeixinImage(image),
  loadFile: file => loadWeixinFile(file),
  fetchMedia: (url, name) => fetchChannelMedia(url, name),
};
