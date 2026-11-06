const SEEN_LIMIT = 2000;

const assistantText = content => typeof content === "string" ? content
  : Array.isArray(content) ? content.filter(part => part?.type === "text").map(part => String(part.text ?? "")).join("\n") : "";

/** Final assistant text of the run that answered `messageId`. */
export function replyText(snapshot, messageId) {
  const transcript = Array.isArray(snapshot?.transcript) ? snapshot.transcript : [];
  const start = transcript.findIndex(entry => entry?.type === "user" && entry.clientMessageId === messageId);
  const texts = transcript.slice(start + 1).filter(entry => entry?.type === "assistant")
    .map(entry => assistantText(entry.content).trim()).filter(Boolean);
  return texts.at(-1) || "任务已结束，没有文本回复。";
}

const YES = /^(同意|允许|批准|确认|是|好|好的|y|yes|ok)$/i;
const NO = /^(拒绝|取消|否|不|不同意|n|no)$/i;

// Each person has their own task, so one stuck task never blocks someone else in the group.
const keyOf = message => `${message.channel}:${message.conversationId}${message.direct ? "" : `:${message.senderId}`}`;

/** How a pending request is shown and answered in chat; null means it needs the browser. */
function describeInput(input) {
  const head = [input.title, input.message].filter(Boolean).join("\n") || "任务需要你确认";
  if (input.kind === "confirmation") return { text: `${head}\n\n回复“同意”或“拒绝”。`, answer: text => YES.test(text) ? { action: "approve" } : NO.test(text) ? { action: "reject" } : null };
  const fields = Array.isArray(input.form?.fields) ? input.form.fields : [];
  const [field] = fields;
  if (input.kind === "form" && fields.length === 1 && [undefined, "text", "single_choice"].includes(field.type)) {
    const options = Array.isArray(field.options) ? field.options : [];
    const list = options.map((option, index) => `${index + 1}. ${option.label ?? option.value}`).join("\n");
    return { text: `${head}\n${field.label || ""}${list ? `\n${list}\n\n回复序号或选项文字。` : "\n\n直接回复答案。"}`,
      answer: text => {
        if (!options.length) return { action: "submit", answers: { [field.id]: text } };
        const pick = options[Number(text) - 1] || options.find(option => option.label === text || option.value === text);
        return pick ? { action: "submit", answers: { [field.id]: pick.value } } : null;
      } };
  }
  return { text: `${head}\n\n${input.instructions || ""}\n这一步需要在浏览器里处理。`, answer: null };
}

export function createGateway({ adapters, bridge, store, config, log = () => {}, pollMs = 4000 }) {
  const seen = new Set();
  const chains = new Map();
  const waiting = new Map();
  const wait = config.waitTimeoutSeconds;

  /** Announce each pending request once. Observation keeps running while the task waits for input. */
  function watchInput(key, sessionId, say) {
    let announced = "", busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const input = await bridge.pendingInput(sessionId);
        if (!input?.waiting) return void waiting.delete(key);
        if (input.waitId === announced) return;
        announced = input.waitId;
        const shown = describeInput(input);
        if (shown.answer) waiting.set(key, { sessionId, input, shown });
        await say(shown.text);
      } catch (error) { log("poll_error", { code: error.code }); } finally { busy = false; }
    }, pollMs);
    return () => { clearInterval(timer); waiting.delete(key); };
  }

  async function answer(adapter, message, key, pending) {
    const say = text => adapter.send(message, text);
    const reply = pending.shown.answer(message.text.trim());
    if (!reply) return say("没看懂，请按上一条消息的提示回复。");
    try {
      const result = await bridge.respond(pending.sessionId, pending.input.waitId, reply.action, reply.answers);
      if (result?.accepted || result?.stale) waiting.delete(key);
      await say(result?.accepted ? "已处理，任务继续执行。" : result?.stale ? "这个请求已经失效。" : `没有成功：${result?.message || result?.code || "请重试"}`);
    } catch (error) {
      log("error", { channel: message.channel, sender: message.senderId, code: error.code });
      await say(`出错了：${error.message}`);
    }
  }

  async function ask(key, message, say) {
    let entry = store.get(key);
    if (!entry?.sessionId) {
      const { sessionId } = await bridge.createSession(message.text.slice(0, 40));
      store.set(key, sessionId);
      entry = { sessionId };
    }
    const stop = watchInput(key, entry.sessionId, say);
    try { return await bridge.sendMessage(entry.sessionId, message.text, message.messageId, wait); } finally { stop(); }
  }

  async function run(adapter, message) {
    const key = keyOf(message);
    // In a group, quote the question so readers can tell whose answer this is.
    const quote = message.direct ? "" : `> ${message.text.replace(/\s+/g, " ").slice(0, 20)}${message.text.length > 20 ? "…" : ""}\n\n`;
    const say = text => adapter.send(message, quote + text);
    log("run", { channel: message.channel, sender: message.senderId });
    try {
      let result;
      try { result = await ask(key, message, say); } catch (error) {
        if (!["task_deleted", "task_not_found"].includes(error.code)) throw error;
        store.delete(key);
        result = await ask(key, message, say);
      }
      await say(replyText(result.snapshot, message.messageId));
      log("replied", { channel: message.channel, sessionId: store.get(key).sessionId, status: result.snapshot?.status });
    } catch (error) {
      if (error.code !== "timeout") {
        log("error", { channel: message.channel, sender: message.senderId, code: error.code });
        return say(`出错了：${error.message}`);
      }
      await say("任务还在执行，完成后发下一条消息可继续这个任务。");
    }
  }

  return {
    handle(message) {
      const adapter = adapters[message.channel];
      const access = config.channels[message.channel];
      const id = `${message.channel}:${message.messageId}`;
      if (seen.has(id)) return;
      seen.add(id);
      if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value);
      if (!access?.allowFrom?.includes(message.senderId)) return log("drop", { channel: message.channel, sender: message.senderId, conversation: message.conversationId });
      if (!message.direct && access.requireMention !== false && !message.mentioned) return;
      const key = keyOf(message);
      // An answer to a pending request must not queue behind the task that is waiting for it.
      if (waiting.has(key)) return answer(adapter, message, key, waiting.get(key));
      const next = (chains.get(key) || Promise.resolve()).then(() => run(adapter, message))
        .catch(error => log("error", { channel: message.channel, code: error.code }))
        .finally(() => { if (chains.get(key) === next) chains.delete(key); });
      chains.set(key, next);
      return next;
    },
  };
}
