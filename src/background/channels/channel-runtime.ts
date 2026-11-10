import { isConfigured, type ChannelAdapter, type ChannelMedia, type ChannelMessage, type ChannelSocket, type ChannelSocketState, type ChannelStream, type LoadedFile, type LoadedImage } from "./channel-adapter.js";
import type { ChannelStore, ChannelRecord, PendingSender } from "./channel-store.js";

type Fields = Record<string, any>;
export type ChannelState = "disabled" | "connecting" | "connected" | "disconnected" | "replaced";
export interface ChannelStats { received: number; completed: number; failed: number; reconnects: number; lastMessageAt?: number }
export interface ChannelStatus { id: string; state: ChannelState; error?: string; allowed: string[]; pending: PendingSender[]; stats: ChannelStats }
export interface ChannelRuntimeOptions extends ChannelAdapter {
  /** The shared command surface (the same one the CLI uses): create_session, send_message, get_session_snapshot, ... */
  dispatch(request: { method: string; params?: Fields; signal?: AbortSignal }): Promise<unknown>;
  /** Follow-up questions for a finished exchange; used when the channel's "suggest" setting is on. */
  suggest?(conversation: { user: string; assistant: string }): Promise<string[]>;
  store: ChannelStore;
  onStatus?(status: ChannelStatus): void;
  /** Called with whether a connection is wanted, so the host can schedule wake-ups that restart a recycled worker. */
  keepAlive?(wanted: boolean): void;
  waitTimeoutMs?: number;
  pollMs?: number;
  /** Messages from one conversation arriving within this many ms run as one task; 0 disables merging. */
  burstMs?: number;
  /** A conversation quiet for this many ms starts a new task. */
  idleMs?: number;
  /** How long after the idle reminder the task is kept for an answer. */
  graceMs?: number;
}

const FAILED = new Set(["error", "failed", "aborted", "cancelled", "canceled", "interrupted"]);
const ACTIVE = new Set(["pending", "running", "waiting_user", "waitinguser", "paused"]);
const INPUT = new Set(["waiting_user", "waitinguser", "paused"]);
const YES = /^(同意|允许|批准|确认|是|好|好的|y|yes|ok)$/i;
const NO = /^(拒绝|取消|否|不|不同意|n|no)$/i;
const SEEN_LIMIT = 2000;
const MEDIA_LIMIT = 6;
// Polling the task is the runtime's main recurring cost; a slow one is logged so it can be measured on real tasks.
const SLOW_POLL_MS = 200;
// A conversation quiet for this long starts a new task: an old, compacted history makes the agent lose track of what is being asked.
const STEP_NOTE_MS = 20_000;
const IDLE_MS = 2 * 60 * 60_000;
// After the idle reminder the person has this long to answer before the task is cleared.
const GRACE_MS = 15 * 60_000;
// Internal error text means nothing in a chat; only what the person can act on is explained.
const explain = (failure: unknown) => (failure as { code?: string })?.code === "NO_NORMAL_BROWSER_WINDOW"
  ? "出错了：浏览器里没有打开的窗口，请先打开一个 Chrome 窗口再试。" : "出错了，请稍后再试。";
const span = (ms: number) => ms >= 3_600_000 ? `${Math.round(ms / 3_600_000)} 小时` : `${Math.round(ms / 60_000)} 分钟`;
// Pictures in the agent's reply (markdown images, links to image files, bare image URLs) are sent as images instead of text.
const IMAGE_LINK = /(?:!?\[[^\]]*\])\((https?:\/\/[^\s)]+|data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+)\)|(https?:\/\/[^\s)<>"'，。]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s)<>"'，。]*)?)/gi;
const IMAGE_FILE = /^data:|\.(png|jpe?g|gif|webp)(\?|$)/i;
const mediaHint = (label: string) => `\n\n（这条消息来自${label}。要给我发图片，请在回复里直接写出图片的直链 URL 或 ![](URL)，系统会把它作为图片发出去；采集到图集里的图片也会自动发给我，不需要我去数据表里查看；只描述图片我收不到。）`;
interface MediaRef { url: string; name?: string }
const RESEND_ATTEMPTS = 3, RECONNECT_WAIT_MS = 60_000;

const assistantText = (content: unknown): string => typeof content === "string" ? content
  : Array.isArray(content) ? content.filter(part => part?.type === "text").map(part => String(part.text ?? "")).join("\n") : "";

/** How a pending request is shown and answered in chat; `answer: null` means it needs the browser. */
export function describeInput(input: Fields) {
  const head = [input.title, input.message].filter(Boolean).join("\n") || "任务需要你确认";
  if (input.kind === "confirmation") {
    return { text: `${head}\n\n回复“同意”或“拒绝”。`,
      answer: (text: string) => YES.test(text) ? { action: "approve" } : NO.test(text) ? { action: "reject" } : null };
  }
  if (input.kind === "browser_permission") {
    return { text: `${head}\n\n这是 Chrome 的权限弹窗，聊天里点不了：在浏览器侧边栏打开这个任务，点“允许并继续”，再在 Chrome 弹窗里确认。授权只需一次，之后同类任务不会再问。\n\n完成后回复“已授权”，任务继续。`,
      answer: (text: string) => /^(已授权|已允许|好了|done)$/i.test(text) ? { action: "approve" } : NO.test(text) ? { action: "reject" } : null };
  }
  const fields: Fields[] = Array.isArray(input.form?.fields) ? input.form.fields : [];
  if (input.kind === "form" && fields.length && fields.every(field => [undefined, "text", "single_choice", "multi_choice"].includes(field.type))) {
    const optionsOf = (field: Fields): Fields[] => Array.isArray(field.options) ? field.options : [];
    const pick = (field: Fields, token: string) => (optionsOf(field)[Number(token) - 1] || optionsOf(field).find(option => option.label === token || option.value === token))?.value;
    // One question per message: the form's fields are asked in order and submitted together.
    const step = (index: number) => {
      const field = fields[index], options = optionsOf(field), multi = field.type === "multi_choice";
      const list = options.map((option, i) => `${i + 1}. ${option.label ?? option.value}`).join("\n");
      const tips = [field.required === false && "回复“跳过”可略过", typeof field.defaultValue === "string" && field.defaultValue && `回复“默认”使用 ${field.defaultValue}`].filter(Boolean).join("，");
      return `${fields.length > 1 ? `(${index + 1}/${fields.length}) ` : ""}${field.label || ""}${list ? `\n${list}\n\n${multi ? "回复序号，多个用逗号分隔。" : "回复序号或选项文字。"}` : "\n\n直接回复答案。"}${tips ? `\n${tips}` : ""}`;
    };
    const parse = (field: Fields, text: string) => {
      const multi = field.type === "multi_choice";
      if (field.required === false && /^(跳过|skip)$/i.test(text)) return multi ? [] : "";
      if (typeof field.defaultValue === "string" && field.defaultValue && /^(默认|default)$/i.test(text)) return multi ? [field.defaultValue] : field.defaultValue;
      if (!optionsOf(field).length) return text;
      if (!multi) return pick(field, text);
      const values = text.split(/[,，、\s]+/).filter(Boolean).map(token => pick(field, token));
      return values.length && values.every(value => value !== undefined) ? [...new Set(values)] : undefined;
    };
    const collected: Fields = {};
    let index = 0;
    return {
      text: `${head}\n${step(0)}`,
      answer: (text: string) => {
        if (index >= fields.length) return null;
        const value = parse(fields[index], text);
        if (value === undefined) return null;
        collected[fields[index].id] = value;
        return ++index < fields.length ? { next: step(index) } : { action: "submit", answers: { ...collected } };
      },
    };
  }
  return { text: `${head}\n\n${input.instructions || ""}\n这一步需要在浏览器里处理。`, answer: null };
}

export function createChannelRuntime({ id: channelId, label, fields: fieldList, login, dispatch, suggest, store, createSocket, loadImage, loadFile, fetchMedia, onStatus, keepAlive, waitTimeoutMs = 600_000, pollMs = 1500, burstMs = 1200, idleMs = IDLE_MS, graceMs = GRACE_MS }: ChannelRuntimeOptions) {
  const keyOf = (message: ChannelMessage) => `${channelId}:${message.conversationId}${message.direct ? "" : `:${message.senderId}`}`;
  const seen = new Set<string>();
  const bursts = new Map<string, { message: ChannelMessage; timer: ReturnType<typeof setTimeout> }>();
  const stats: ChannelStats = { received: 0, completed: 0, failed: 0, reconnects: 0 };
  /** Ids and counts only: message text and credentials never reach the log. */
  const log = (event: string, fields: Fields = {}) => console.info(`[channels:${channelId}] ${event}`, JSON.stringify(fields));
  const chains = new Map<string, Promise<unknown>>();
  // Offered follow-ups by conversation: replying with their number asks that question.
  const suggestions = new Map<string, string[]>();
  // One abort controller per conversation, so /new can stop that conversation's running task without touching the others.
  const controllers = new Map<string, AbortController>();
  const waiting = new Map<string, { sessionId: string; waitId: string; answer: (text: string) => Fields | null }>();
  let socket: ChannelSocket | undefined;
  let starting: Promise<void> | undefined;
  let generation = 0;
  let state: ChannelState = "disabled";
  let error: string | undefined;
  let epoch = new AbortController();

  const call = (method: string, params: Fields, signal?: AbortSignal) => dispatch({ method, params, signal }) as Promise<Fields>;
  const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });

  async function publish() {
    onStatus?.(await status());
  }
  async function status(): Promise<ChannelStatus> {
    const record = await store.read();
    return { id: channelId, state, ...(error ? { error } : {}), allowed: record.allowed, pending: record.pending, stats: { ...stats } };
  }
  const online = new Set<() => void>();
  const setState = (next: ChannelState, message?: string) => {
    if (next !== state) log("state", { from: state, to: next, ...(message ? { error: message } : {}) });
    if (next === "disconnected" && state === "connected") stats.reconnects++;
    state = next; error = message; void publish();
    if (next === "connected") for (const resolve of [...online]) resolve();
    // Another client owns the bot now, so replies can no longer be delivered; stop the runs that would send them.
    if (next === "replaced") { epoch.abort(); waiting.clear(); }
  };

  /** Send, and when the connection drops mid-reply, wait for the reconnect and send again. */
  async function deliver(conversationId: string, text: string, control: boolean) {
    for (let attempt = 0; ; attempt++) {
      const current = socket;
      if (!current) return;
      try { return await current.send(conversationId, text, { control }); } catch (failure) {
        const signal = epoch.signal;
        if (attempt >= RESEND_ATTEMPTS || signal.aborted || !/connection (is )?closed/.test(String((failure as Error).message))) throw failure;
        // Closed while the state still says connected: give the close event a moment instead of spinning.
        await new Promise<void>(resolve => {
          const timer = setTimeout(done, state === "connected" ? 1000 : RECONNECT_WAIT_MS);
          function done() { clearTimeout(timer); online.delete(done); signal.removeEventListener("abort", done); resolve(); }
          if (state !== "connected") online.add(done);
          signal.addEventListener("abort", done, { once: true });
        });
        if (signal.aborted) throw failure;
      }
    }
  }

  /** Follow the run: forwards each finished assistant text as progress, then completes; reports input requests while it waits. */
  async function waitForReply(sessionId: string, messageId: string, key: string, say: (text: string, control?: boolean) => Promise<void>, signal: AbortSignal, progress: boolean, outbox: MediaRef[], open?: () => ChannelStream | undefined) {
    let stream: ChannelStream | undefined, streamClosed = false;
    let deadline = Date.now() + waitTimeoutMs;
    let announced = "", active = false, forwarded = 0, counted = 0;
    // A long tool step with no text in between gets a one-line note, so the person away from the computer sees the task is moving.
    let lastOutput = Date.now(), lastStep = -1;
    try {
      while (!signal.aborted) {
        if (Date.now() >= deadline) return say("任务还在执行，但已经很久没有新进展，我先不再跟进。完成后发下一条消息可继续这个任务。");
        const polledAt = Date.now();
        const snapshot = await call("get_session_snapshot", { sessionId, compact: false, tail: false, includeArtifacts: false }, signal);
        if (Date.now() - polledAt > SLOW_POLL_MS) log("slow_poll", { ms: Date.now() - polledAt, entries: Array.isArray(snapshot.transcript) ? snapshot.transcript.length : 0 });
        const runtime: Fields = snapshot.runtime || {};
        const status = String(snapshot.status || runtime.status || snapshot.state?.status || "").toLowerCase();
        const transcript: Fields[] = Array.isArray(snapshot.transcript) ? snapshot.transcript : [];
        const submitted = transcript.findIndex(entry => entry?.type === "user" && entry.clientMessageId === messageId);
        if (ACTIVE.has(status)) active = true;
        if (INPUT.has(status)) {
          const input = await call("get_user_input", { sessionId }, signal);
          if (input.waiting && input.waitId !== announced) {
            announced = String(input.waitId);
            const shown = describeInput(input);
            if (shown.answer) waiting.set(key, { sessionId, waitId: announced, answer: shown.answer });
            // A streamed bubble is updated in place, so it would stay above this question while the answer keeps filling it. Close it here; later text goes out as new messages.
            if (stream) { const rest = await stream.end(); stream = undefined; for (const text of rest) await say(text); }
            streamClosed = true;
            await say(shown.text, true);
          }
        } else waiting.delete(key);
        if (FAILED.has(status)) return say(`任务没有完成（${status}）。`);
        const busy = runtime.running === true || runtime.pendingStart === true
          || ["pendingFollowUps", "pendingFollowUpMessages", "pendingSteerings", "pendingSteeringMessages"].some(field => Array.isArray(runtime[field]) && runtime[field].length);
        if (submitted >= 0) {
          const after = transcript.slice(submitted + 1);
          const done = !busy && (status === "completed" || (status === "idle" && active));
          // An entry is final once something follows it; the last one is final when the run ends.
          const texts = after.slice(0, done ? undefined : -1).filter(entry => entry?.type === "assistant")
            .map(entry => assistantText(entry.content).trim()).filter(Boolean);
          if (texts.length > counted) { counted = texts.length; deadline = Date.now() + waitTimeoutMs; }
          // With progress off only the closing text goes out.
          const fresh = progress ? texts.slice(forwarded) : done && !forwarded ? texts.slice(-1) : [];
          for (const original of fresh) {
            const text = fetchMedia ? original.replace(IMAGE_LINK, (match, linked, bare) => {
              if (linked && !match.startsWith("!") && !IMAGE_FILE.test(linked)) return match;
              outbox.push({ url: bare || linked }); return "";
            }).trim() : original;
            if (!text) continue;
            if (!streamClosed) stream ??= open?.();
            if (stream) stream.add(text); else await say(text);
          }
          if (fresh.length) { forwarded = texts.length; lastOutput = Date.now(); }
          const step = progress && !done ? after.map(entry => entry?.type === "tool" && entry.isRunning === true).lastIndexOf(true) : -1;
          if (step >= 0 && step !== lastStep && Date.now() - lastOutput > STEP_NOTE_MS) {
            lastStep = step; lastOutput = Date.now();
            await say(`正在执行：${String(after[step].name || "工具")}`);
          }
          if (done) { if (!forwarded) await say("任务已结束，没有文本回复。"); return texts.at(-1); }
        }
        await sleep(pollMs, signal);
      }
    } finally {
      waiting.delete(key);
      // Whatever the stream could not show goes out as ordinary messages.
      try { for (const text of await stream?.end() ?? []) await say(text); } catch { /* The connection is gone; nothing more can be delivered. */ }
    }
  }

  /** The conversation's task, unless it has been quiet past the idle time and the reminder's grace period. */
  const live = async (key: string) => {
    const entry = (await store.read()).conversations[key];
    return entry && Date.now() - entry.updatedAt < idleMs + graceMs ? entry : undefined;
  };
  const touch = (key: string, to?: string) => store.update(record => {
    const entry = record.conversations[key];
    if (entry) { entry.updatedAt = Date.now(); delete entry.notifiedAt; if (to) entry.to = to; }
  });

  /** Reminds a quiet conversation that its task is about to end, and clears it once nobody answered. Runs on the keep-alive alarm. */
  async function sweep() {
    if (state !== "connected" || !socket) return;
    const now = Date.now();
    for (const [key, entry] of Object.entries((await store.read()).conversations)) {
      const quiet = now - entry.updatedAt;
      if (quiet < idleMs || chains.has(key)) continue;
      if (entry.notifiedAt) {
        if (quiet >= idleMs + graceMs) await store.update(record => { if (record.conversations[key]?.notifiedAt === entry.notifiedAt) delete record.conversations[key]; });
      } else if (entry.to && quiet < idleMs + graceMs) {
        await store.update(record => { if (record.conversations[key]) record.conversations[key].notifiedAt = now; });
        await socket?.send(entry.to, `这个对话已经 ${span(idleMs)} 没有新消息。${span(graceMs)}内回复任意内容可以继续当前任务，否则会清除上下文，之后的消息作为新任务开始。`).catch(() => {});
      }
    }
  }

  async function sessionFor(key: string, title: string, signal: AbortSignal) {
    const entry = await live(key);
    if (entry) return entry.sessionId;
    const created = await call("create_session", { title, source: `channel:${channelId}` }, signal);
    const sessionId = String(created.session?.id || created.sessionId || "");
    if (!sessionId) throw new Error("The task was created without an ID.");
    await store.update(record => { record.conversations[key] = { sessionId, updatedAt: Date.now() }; });
    return sessionId;
  }

  /** Files a task has produced so far, as `id -> {url, name}`; undefined when they cannot be read. */
  async function artifactFiles(sessionId: string, signal: AbortSignal) {
    try {
      const snapshot = await call("get_session_snapshot", { sessionId, compact: true, tail: true, num: 1, includeArtifacts: true }, signal);
      const files: Fields[] = Array.isArray(snapshot.artifacts?.files) ? snapshot.artifacts.files : [];
      const galleries: Fields[] = Array.isArray(snapshot.artifacts?.imageCollections) ? snapshot.artifacts.imageCollections : [];
      // A gallery counts as new again when it gains images; its pictures are read from the asset store, not a URL.
      return new Map<string, MediaRef>([
        // The snapshot carries no `id` for files, so a download, an artifact or a saved file is told apart by its own identifiers.
        ...files.map((file): [string, MediaRef] => [String(file.id || file.downloadId || file.artifactId || file.fileId || `${file.filename}|${file.url}`), { url: String(file.url || ""), name: String(file.filename || "") }]),
        ...galleries.map((gallery): [string, MediaRef] => [`gallery:${gallery.table}:${gallery.totalRows}`, { url: `gallery:${gallery.table}`, name: String(gallery.table) }]),
      ]);
    } catch { return undefined; }
  }

  /** A saved copy of a picture the reply already links (artifact "File_x.jpg" for ".../x.jpg") is not sent twice. */
  function shown(file: MediaRef, outbox: MediaRef[]) {
    const name = (file.name ?? "").replace(/[:/\\]/g, "_");
    return outbox.some(({ url }) => { try { const base = decodeURIComponent(new URL(url).pathname.split("/").pop() || "").replace(/[:/\\]/g, "_"); return !!base && name.endsWith(base); } catch { return false; } });
  }

  /** Send the pictures from the reply and the files the task produced; one that fails is reported, the others still go out. */
  async function deliverMedia(conversationId: string, sessionId: string, known: Map<string, MediaRef> | undefined, outbox: MediaRef[],
    say: (text: string) => Promise<void>, signal: AbortSignal) {
    const upload = socket?.sendMedia?.bind(socket);
    if (!fetchMedia || !upload || signal.aborted) return;
    const galleries: string[] = [];
    if (known) for (const [id, file] of await artifactFiles(sessionId, signal) ?? []) {
      if (known.has(id)) continue;
      if (file.url.startsWith("gallery:")) galleries.push(file.url.slice(8));
      else if (/^(https?|data):/.test(file.url) && !shown(file, outbox)) outbox.push(file);
    }
    for (const collection of galleries) {
      try {
        const { images = [] } = await call("read_image_collection", { collection, limit: MEDIA_LIMIT }, signal) as { images?: { filename: string; base64: string }[] };
        for (const image of images) await upload(conversationId, { type: "image", filename: image.filename, data: Uint8Array.from(atob(image.base64), char => char.charCodeAt(0)) });
      } catch (failure) {
        if (signal.aborted) return;
        await say(`图集 ${collection} 没能发送：${failure instanceof Error ? failure.message : String(failure)}`).catch(() => {});
      }
    }
    for (const media of outbox.slice(0, MEDIA_LIMIT)) {
      try { await upload(conversationId, await fetchMedia(media.url, media.name)); } catch (failure) {
        if (signal.aborted) return;
        // A picture that cannot be fetched (hotlink protection, a login wall) is still shown from its URL.
        if (/^https?:/.test(media.url) && (!media.name || IMAGE_FILE.test(media.name))) {
          try { await socket?.sendImageLink?.(conversationId, media.url); continue; } catch { /* Report the original failure. */ }
        }
        await say(`${media.name || media.url.slice(0, 80)} 没能发送：${failure instanceof Error ? failure.message : String(failure)}`).catch(() => {});
      }
    }
    if (outbox.length > MEDIA_LIMIT) await say(`还有 ${outbox.length - MEDIA_LIMIT} 个文件没有发送。`).catch(() => {});
  }

  async function run(message: ChannelMessage, signal: AbortSignal) {
    const key = keyOf(message);
    // In a group, quote the question so readers can tell whose answer this is.
    const quote = message.direct ? "" : `> ${message.text.replace(/\s+/g, " ").slice(0, 20)}${message.text.length > 20 ? "…" : ""}\n\n`;
    const say = (text: string, control = false) => deliver(message.conversationId, quote + text, control);
    try {
      // A new task is told once how to send pictures back.
      let fresh = !(await live(key));
      // Say so when the earlier conversation was dropped for being idle, so a follow-up that relied on it is not a mystery.
      if (fresh && (await store.read()).conversations[key]) await say(`距离上次对话已超过 ${span(idleMs)}，这条消息会作为新任务开始，不再带之前的上下文。需要接着聊之前的内容，请重新说明。`, true).catch(() => {});
      let sessionId = await sessionFor(key, `[${label}] ${message.text.slice(0, 40)}`, signal);
      await touch(key, message.conversationId);
      const images: LoadedImage[] = [];
      for (const image of loadImage ? message.images || [] : []) {
        try { images.push(await loadImage!(image)); } catch (failure) {
          if (signal.aborted) return;
          await say(`有一张图片没有读到：${failure instanceof Error ? failure.message : String(failure)}`).catch(() => {});
        }
      }
      const files: LoadedFile[] = [];
      for (const file of loadFile ? message.files || [] : []) {
        try { files.push(await loadFile!(file)); } catch (failure) {
          if (signal.aborted) return;
          await say(`有一个文件没有读到：${failure instanceof Error ? failure.message : String(failure)}`).catch(() => {});
        }
      }
      if (!message.text && !images.length && !files.length) return;
      // Documents belong to one session, so they are staged again if the task has to be recreated.
      const stage = async () => {
        const documents: Fields[] = [];
        for (const file of files) {
          const owner = sessionId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12) || "session";
          const id = (prefix: string) => `${prefix}_${owner}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
          const { response } = await call("runtime_message", { message: { type: "stage_chat_document", sessionId, messageId: message.messageId, attachmentId: id("att"),
            fileId: id("file"), docModelId: id("model"), filename: file.name, mimeType: file.mimeType, size: file.size, base64: file.base64 }, expectedType: "chat_document_staged" }, signal) as { response?: Fields };
          if (response?.document) documents.push(response.document as Fields);
          else await say(`文件“${file.name}”没有读懂：${response?.error || "格式不支持"}`).catch(() => {});
        }
        return documents;
      };
      const send = async () => {
        const documents = await stage();
        if (!message.text && !images.length && !documents.length) return false;
        await call("send_message", { sessionId, text: fresh && fetchMedia ? message.text + mediaHint(label) : message.text, images, documents, clientMessageId: message.messageId }, signal);
        return true;
      };
      let sent: boolean;
      // Files the task already has are not sent again with its next reply.
      const knownFiles = fetchMedia && socket?.sendMedia ? await artifactFiles(sessionId, signal) : undefined;
      try { sent = await send(); } catch (failure) {
        if (!["task_deleted", "task_not_found", "SESSION_NOT_FOUND"].includes((failure as { code?: string }).code || "")) throw failure;
        await store.update(record => { delete record.conversations[key]; });
        sessionId = await sessionFor(key, `[${label}] ${message.text.slice(0, 40)}`, signal);
        fresh = true;
        sent = await send();
      }
      if (!sent) return;
      const outbox: MediaRef[] = [];
      const config = (await store.read()).config;
      const last = await waitForReply(sessionId, message.messageId, key, say, signal, config.progress, outbox, () => message.reqId ? socket?.stream?.(message.reqId, quote) : undefined);
      await deliverMedia(message.conversationId, sessionId, knownFiles, outbox, say, signal);
      await touch(key);
      if (config.suggest && suggest && last && !signal.aborted) {
        // Best effort: a failed suggestion never fails the task.
        const ideas = await suggest({ user: message.text, assistant: last }).catch(() => []);
        if (ideas.length && !signal.aborted) {
          suggestions.set(key, ideas);
          await say(`可以接着问（回复序号）：\n${ideas.map((idea, index) => `${index + 1}. ${idea}`).join("\n")}`, true).catch(() => {});
        }
      }
      stats.completed++;
    } catch (failure) {
      if (signal.aborted) return;
      stats.failed++;
      log("run_failed", { conversation: key, error: failure instanceof Error ? failure.message : String(failure) });
      await say(explain(failure)).catch(() => {});
    }
  }

  async function answer(message: ChannelMessage, key: string) {
    const pending = waiting.get(key);
    const send = (text: string) => socket?.send(message.conversationId, text).catch(() => {});
    // A group text keeps the part of a spaced bot name ("@Bot Lite 3" -> "Lite 3"), so also try the text without its first words.
    const words = message.text.trim().split(/\s+/);
    let reply: Fields | null | undefined;
    for (let skip = 0; !reply && skip < (message.direct ? 1 : Math.min(words.length, 3)); skip++) reply = pending?.answer(words.slice(skip).join(" "));
    if (!pending || !reply) return send("没看懂，请按上一条消息的提示回复。");
    if (typeof reply.next === "string") return send(reply.next);
    try {
      const result = await call("respond_to_user_input", { sessionId: pending.sessionId, waitId: pending.waitId, ...reply }, epoch.signal);
      if (result.accepted || result.stale) waiting.delete(key);
      await send(result.accepted ? "已处理，任务继续执行。" : result.stale ? "这个请求已经失效。" : `没有成功：${result.message || result.code || "请重试"}`);
    } catch (failure) { await send(explain(failure)); log("answer_failed", { error: failure instanceof Error ? failure.message : String(failure) }); }
  }

  async function onMessage(message: ChannelMessage) {
    const id = `${channelId}:${message.messageId}`;
    if (seen.has(id)) return;
    seen.add(id);
    stats.received++; stats.lastMessageAt = Date.now();
    if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);
    let repeated = false;
    let record = await store.update(next => { repeated = next.seen.includes(id); if (!repeated) next.seen.push(id); });
    if (repeated) return;
    // Only direct chats are let in automatically: the first one becomes the owner, and with autoAllowAll WeCom's "usable members" list is the only gate.
    // Group members always wait for approval.
    if (!record.allowed.includes(message.senderId) && message.senderId && message.direct && (record.config.autoAllowAll || !record.allowed.length)) {
      record = await store.update(next => { next.allowed.push(message.senderId); next.pending = next.pending.filter(item => item.senderId !== message.senderId); });
      void publish();
    }
    if (!record.allowed.includes(message.senderId)) {
      // Unknown sender: list them for the owner to approve. Only a first-time direct sender is answered; a group stays quiet.
      let known = false;
      await store.update(next => {
        known = next.pending.some(item => item.senderId === message.senderId);
        next.pending = next.pending.filter(item => item.senderId !== message.senderId);
        next.pending.push({ senderId: message.senderId, text: message.text.slice(0, 80), direct: message.direct, at: Date.now() });
      });
      void publish();
      log("sender_pending", { sender: message.senderId, direct: message.direct });
      if (message.direct && !known) await socket?.send(message.conversationId, "已通知机器人主人确认，确认后再发一次。").catch(() => {});
      return;
    }
    if (!message.supported) return void socket?.send(message.conversationId, "目前只支持文字、图片和文件消息。").catch(() => {});
    const key = keyOf(message);
    const command = message.text.trim();
    const isStop = /^\/stop$|^(停|停止|停下)$/i.test(command);
    if (isStop || /^\/new$/i.test(command)) {
      const running = chains.has(key) || bursts.has(key);
      const task = (await store.read()).conversations[key];
      controllers.get(key)?.abort(); controllers.delete(key);
      clearTimeout(bursts.get(key)?.timer); bursts.delete(key);
      // The old task must not keep running or answer into the new conversation.
      if (running && task) void call("stop_session", { sessionId: task.sessionId }).catch(() => {});
      suggestions.delete(key); waiting.delete(key);
      // /stop keeps the conversation, so the next message continues with the same context.
      if (isStop) return void socket?.send(message.conversationId, running ? "已停止当前任务，上下文保留，可以继续发消息。" : "当前没有在执行的任务。").catch(() => {});
      await store.update(next => { delete next.conversations[key]; });
      return void socket?.send(message.conversationId, "已开始新任务，下一条消息会从头开始。").catch(() => {});
    }
    // An answer to a pending request must not queue behind the task that is waiting for it.
    if (waiting.has(key)) return answer(message, key);
    const picked = suggestions.get(key)?.[Number(message.text.trim()) - 1];
    suggestions.delete(key);
    if (picked) message = { ...message, text: picked };
    const enqueue = (task: ChannelMessage) => {
      let controller = controllers.get(key);
      if (!controller || controller.signal.aborted) {
        const owner = controller = new AbortController();
        controllers.set(key, owner);
        epoch.signal.addEventListener("abort", () => owner.abort(), { once: true });
      }
      const signal = controller.signal;
      const next = (chains.get(key) || Promise.resolve()).then(() => run(task, signal))
        .finally(() => { if (chains.get(key) === next) { chains.delete(key); if (controllers.get(key)?.signal === signal) controllers.delete(key); } });
      chains.set(key, next);
      return next;
    };
    if (!burstMs) return enqueue(message);
    // Hold the message briefly: a quick follow-up (or an image sent after its caption) joins it as one task.
    const held = bursts.get(key);
    clearTimeout(held?.timer);
    const merged = held ? { ...message, messageId: held.message.messageId,
      text: [held.message.text, message.text].filter(Boolean).join("\n"), images: [...(held.message.images || []), ...(message.images || [])] } : message;
    bursts.set(key, { message: merged, timer: setTimeout(() => { bursts.delete(key); void enqueue(merged); }, burstMs) });
  }

  async function start() {
    await stop();
    const { config } = await store.read();
    const ready = config.enabled && isConfigured(fieldList, config.fields);
    keepAlive?.(ready);
    if (!ready) return setState("disabled");
    const mine = ++generation;
    epoch = new AbortController();
    setState("connecting");
    const current = createSocket({
      fields: config.fields,
      state: {
        read: async () => (await store.read()).state,
        // A connection from an earlier start must not write over the new one's state.
        write: async patch => { if (mine === generation) await store.update(record => { Object.assign(record.state, patch); }); },
      },
      onMessage: message => { if (mine === generation) void onMessage(message); },
      onState: (next: ChannelSocketState, message?: string) => { if (mine === generation) setState(next, message); },
    });
    socket = current;
    try { await current.start(); } catch (failure) {
      if (mine === generation) setState("disconnected", failure instanceof Error ? failure.message : String(failure));
    }
  }

  async function stop() {
    generation++;
    epoch.abort();
    socket?.stop();
    socket = undefined;
    waiting.clear();
    chains.clear();
    controllers.clear();
    for (const { timer } of bursts.values()) clearTimeout(timer);
    bursts.clear();
  }

  const update = async (change: (record: ChannelRecord) => void) => { const record = await store.update(change); void publish(); return record; };
  return {
    start, stop,
    /** Connect when nothing is running (a recycled worker, a failed first start); a replaced bot stays down until the user saves. */
    async ensure() {
      if (!socket) await (starting ??= start().finally(() => { starting = undefined; }));
      await sweep().catch(() => {});
    },
    status,
    /** The saved settings for the page: secrets are reported as set or not, never returned. */
    async getConfig() {
      const { config } = await store.read();
      const values: Record<string, string> = {}, secrets: string[] = [];
      for (const field of fieldList) { if (field.secret || field.managed) { if (config.fields[field.key]) secrets.push(field.key); } else values[field.key] = config.fields[field.key] ?? ""; }
      return { enabled: config.enabled, autoAllowAll: config.autoAllowAll, progress: config.progress, suggest: config.suggest, fields: values, secrets };
    },
    /** Saving restarts the connection. An empty secret keeps the stored one. */
    async saveConfig(input: { enabled: boolean; autoAllowAll?: boolean; progress?: boolean; suggest?: boolean; fields?: Record<string, string> }) {
      await update(record => {
        const fields: Record<string, string> = {};
        for (const field of fieldList) {
          const value = String(input.fields?.[field.key] ?? "").trim();
          fields[field.key] = value || (field.secret || field.managed ? record.config.fields[field.key] ?? "" : "");
        }
        record.config = { enabled: input.enabled, autoAllowAll: input.autoAllowAll === true, progress: input.progress === true, suggest: input.suggest === true, fields };
      });
      await start();
    },
    /** Starts a QR sign-in; the page draws `qr` and polls with the ticket. */
    async loginStart() { if (!login) throw new Error(`${label} has no QR sign-in`); return login.start(); },
    /** One step of the sign-in. On success the credentials are saved, the person who scanned is allowed, and the connection starts. */
    async loginPoll(ticket: string) {
      if (!login) throw new Error(`${label} has no QR sign-in`);
      const step = await login.poll(ticket);
      if (step.status !== "done" || !step.fields) return { status: step.status, ticket: step.ticket };
      await update(record => {
        record.config = { ...record.config, enabled: true, fields: { ...record.config.fields, ...step.fields } };
        record.state = {}; // A cursor from another account is meaningless.
        if (step.owner && !record.allowed.includes(step.owner)) record.allowed.push(step.owner);
      });
      await start();
      return { status: "done" as const };
    },
    approve: (senderId: string) => update(record => {
      if (!record.allowed.includes(senderId)) record.allowed.push(senderId);
      record.pending = record.pending.filter(item => item.senderId !== senderId);
    }).then(() => {}),
    deny: (senderId: string) => update(record => { record.pending = record.pending.filter(item => item.senderId !== senderId); }).then(() => {}),
    remove: (senderId: string) => update(record => { record.allowed = record.allowed.filter(id => id !== senderId); }).then(() => {}),
  };
}
export type ChannelRuntime = ReturnType<typeof createChannelRuntime>;
