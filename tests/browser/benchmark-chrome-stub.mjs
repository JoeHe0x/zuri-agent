export function installBenchmarkChromeStub(options = {}) {
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  // addInitScript serializes this function; mirror the two generated Chrome message shapes here.
  const nativeText = value => {
    if (typeof value?.message !== "string") return "";
    if (value.message !== "$ZURI_LITERAL$") return value.placeholders === undefined ? value.message : "";
    const content = value.placeholders?.zuri_literal?.content;
    return typeof content === "string" ? content.replace(/\${2,}/g, dollars => dollars.slice(1)) : "";
  };
  // Ordinary workspace fixtures represent a user who has completed first-use consent.
  const storage = clone({ zuri_data_consent: { version: 1, acceptedAt: 1 }, ...options.localStorage });
  if (options.dataConsent === false) storage.zuri_data_consent = JSON.parse(localStorage.getItem("__zuri_test_consent") || "null");
  const storageListeners = new Set();
  let consentSaveFailures = Number(options.consentSaveFailures || 0);
  const sessionStoragePrefix = "__zuri_test_chrome_session__:";
  const localGetDelayMs = Math.max(0, Number(options.localGetDelayMs) || 0);
  const sessionGetDelayMs = Math.max(0, Number(options.sessionGetDelayMs) || 0);
  const stateResponseDelayMs = Math.max(0, Number(options.stateResponseDelayMs) || 0);
  let sessionSetFailuresRemaining = Math.max(0, Number(options.sessionSetFailures) || 0);
  const portMessageListeners = new Set();
  const portDisconnectListeners = new Set();
  const sidePanelOpenedListeners = new Set();
  const submittedFollowUpsBySession = new Map();
  window.__zuriPostedMessages = [];
  window.__zuriCreatedTabs = [];
  window.__zuriCommands = clone(options.commands || [
    { name: "_execute_action", shortcut: "Ctrl+Shift+K" },
    { name: "open-model-preset-switcher", shortcut: "Ctrl+Shift+M" },
  ]);
  window.__zuriCommandsGetAllCount = 0;
  window.__zuriSessionSetAttempts = 0;
  window.__zuriEmitPortMessage = message => {
    for (const listener of portMessageListeners) listener(clone(message));
  };
  window.__zuriEmitSidePanelOpened = info => {
    for (const listener of sidePanelOpenedListeners) listener(clone(info));
  };
  window.__ZURI_CONVERSATION_BENCHMARK__ = options.benchmark !== false;
  for (const [key, value] of Object.entries(options.sessionStorage || {})) {
    const storageKey = `${sessionStoragePrefix}${key}`;
    if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(value));
  }
  window.chrome = {
    i18n: {
      getUILanguage: () => options.uiLanguage || navigator.language,
      getMessage: key => nativeText(options.localeMessages?.[key]),
    },
    runtime: {
      async sendMessage(message) {
        if (message.type !== "accept_data_consent") throw new Error("Unexpected runtime message");
        if (consentSaveFailures-- > 0) return { ok: false };
        const value = { version: message.version, acceptedAt: Date.now() };
        storage.zuri_data_consent = value;
        localStorage.setItem("__zuri_test_consent", JSON.stringify(value));
        for (const listener of storageListeners) listener({ zuri_data_consent: { newValue: value } }, "local");
        return { ok: true, accepted: true };
      },
      connect() {
        return {
          postMessage(message) {
            window.__zuriPostedMessages.push(clone(message));
            if (message?.type === "sidepanel_attach" && message.requestId) {
              queueMicrotask(() => {
                for (const event of options.attachMessages || []) window.__zuriEmitPortMessage(event);
                window.__zuriEmitPortMessage({
                  type: "sidepanel_attached",
                  requestId: message.requestId,
                  windowId: message.windowId,
                });
              });
            }
            if (message?.type === "get_skill_workspace" && message.requestId) {
              queueMicrotask(() => window.__zuriEmitPortMessage({
                type: "skill_workspace", requestId: message.requestId,
                skills: Object.values(storage._skills || {}), installStates: {},
              }));
            }
            if (message?.type === "get_config") {
              queueMicrotask(() => window.__zuriEmitPortMessage({
                type: "config",
                ...(message.requestId ? { requestId: message.requestId } : {}),
                config: {
                  provider: "custom",
                  model: "test-model",
                  debugMode: false,
                  providers: window.__zuriProviderMenus?.[document.documentElement.lang] || window.__zuriProviderMenus?.en,
                  ...(options.config || {}),
                },
              }));
            }
            if (message?.type === "match_model_capabilities" && message.requestId) {
              queueMicrotask(() => window.__zuriEmitPortMessage({
                type: "model_capabilities", requestId: message.requestId,
                match: options.modelCapabilityMatch || { matched: false },
              }));
            }
            if (message?.type === "list_models" && message.requestId && options.listModelsError) {
              queueMicrotask(() => window.__zuriEmitPortMessage({
                type: "error",
                requestId: message.requestId,
                code: "MODEL_LIST_UNAVAILABLE",
                message: String(options.listModelsError),
              }));
            }
            if (message?.type === "list_sessions" && message.requestId) {
              queueMicrotask(() => window.__zuriEmitPortMessage({
                type: "list_sessions_result",
                requestId: message.requestId,
                sessions: [],
              }));
            }
            if (message?.type === "get_state" && (message.requestId || options.respondToStateWithoutRequestId)) {
              const respond = () => window.__zuriEmitPortMessage({
                type: "state",
                ...(message.requestId ? { requestId: message.requestId } : {}),
                sessionId: message.sessionId,
                status: "idle",
                runtime: { sessionId: message.sessionId, status: "idle", running: false },
                ...clone(options.stateResponse || {}),
              });
              if (stateResponseDelayMs) setTimeout(respond, stateResponseDelayMs);
              else queueMicrotask(respond);
            }
            if (message?.type === "get_composer_draft" && message.requestId) {
              queueMicrotask(() => window.__zuriEmitPortMessage({
                type: "get_composer_draft_result",
                requestId: message.requestId,
                sessionId: message.sessionId,
                draft: null,
              }));
            }
            if (message?.type === "prompt" && message.requestId) {
              const acceptance = window.__zuriPromptAcceptance && typeof window.__zuriPromptAcceptance === "object"
                ? clone(window.__zuriPromptAcceptance)
                : {};
              if (acceptance.disposition === "queued") {
                const pendingFollowUps = submittedFollowUpsBySession.get(message.sessionId) || [];
                if (!pendingFollowUps.some(item => item.clientMessageId === message.clientMessageId)) {
                  pendingFollowUps.push({
                    clientMessageId: message.clientMessageId,
                    text: message.text || "",
                    imageCount: Array.isArray(message.images) ? message.images.length : 0,
                    attachmentCount: Array.isArray(message.documents) ? message.documents.length : 0,
                    index: pendingFollowUps.length,
                  });
                }
                submittedFollowUpsBySession.set(message.sessionId, pendingFollowUps);
                queueMicrotask(() => window.__zuriEmitPortMessage({
                  type: "queue_update",
                  sessionId: message.sessionId,
                  pendingSteerings: [],
                  pendingFollowUps: clone(pendingFollowUps),
                }));
              }
              queueMicrotask(() => window.__zuriEmitPortMessage({
                type: "prompt_accepted",
                requestId: message.requestId,
                accepted: true,
                sessionId: message.sessionId,
                clientMessageId: message.clientMessageId,
                ...acceptance,
              }));
            }
            if (message?.type === "list_plugin_contributions" && message.requestId) {
              queueMicrotask(() => window.__zuriEmitPortMessage({
                type: "plugin_contributions",
                requestId: message.requestId,
                contributions: {},
              }));
            }
            if (message?.type === "steer_follow_up" && message.requestId) {
              queueMicrotask(() => window.__zuriEmitPortMessage({
                type: "follow_up_steered",
                requestId: message.requestId,
                sessionId: message.sessionId,
                moved: true,
              }));
            }
            if (message?.type === "rename_session" && message.requestId) {
              if (window.__zuriRenameSessionFailure === true) {
                queueMicrotask(() => window.__zuriEmitPortMessage({
                  type: "error",
                  requestId: message.requestId,
                  code: "RENAME_FAILED",
                  message: "模拟保存失败",
                }));
                return;
              }
              const sessionId = String(message.sessionId || "").trim();
              const sessions = storage._sessions || {};
              const session = {
                ...(sessions[sessionId] || {}),
                id: sessionId,
                title: String(message.title || "").trim(),
                titleSource: "manual",
              };
              storage._sessions = { ...sessions, [sessionId]: session };
              queueMicrotask(() => {
                window.__zuriEmitPortMessage({
                  type: "rename_session_result",
                  requestId: message.requestId,
                  renamed: true,
                  sessionId,
                  session,
                });
                window.__zuriEmitPortMessage({
                  type: "sessions_changed",
                  action: "title",
                  sessionId,
                  session,
                });
              });
            }
            if (message?.type === "compact_context" && message.requestId) {
              if (window.__zuriCompactFailure && typeof window.__zuriCompactFailure === "object") {
                const failure = window.__zuriCompactFailure;
                queueMicrotask(() => window.__zuriEmitPortMessage({
                  type: "error",
                  requestId: message.requestId,
                  code: String(failure.code || "CONTEXT_COMPACTION_FAILED"),
                  message: String(failure.message || "模拟压缩失败"),
                }));
                return;
              }
              const lifecycle = window.__zuriCompactLifecycle;
              if (lifecycle && typeof lifecycle === "object") {
                const compactId = String(lifecycle.compactId || "compact-manual");
                queueMicrotask(() => window.__zuriEmitPortMessage({
                  type: "context_compaction_start",
                  sessionId: message.sessionId,
                  compactId,
                  eventSeq: Number(lifecycle.startEventSeq || 1),
                  inputTokensBefore: 4200,
                  contextWindow: 1_000_000,
                  sourceMessageCount: 6,
                  retainedMessageCount: 2,
                  trigger: "slash_command",
                }));
                setTimeout(() => {
                  window.__zuriEmitPortMessage({
                    type: "context_compaction_end",
                    sessionId: message.sessionId,
                    compactId,
                    eventSeq: Number(lifecycle.endEventSeq || 2),
                    status: "done",
                    summary: String(lifecycle.summary || "手动压缩已经完成。"),
                    inputTokensBefore: 4200,
                    inputTokensAfter: 1200,
                    contextWindow: 1_000_000,
                    sourceMessageCount: 6,
                    retainedMessageCount: 2,
                    trigger: "slash_command",
                  });
                  window.__zuriEmitPortMessage({
                    type: "state",
                    sessionId: message.sessionId,
                    status: "completed",
                    isStreaming: false,
                    runtime: {
                      sessionId: message.sessionId,
                      status: "completed",
                      running: false,
                      pendingStart: false,
                      runId: null,
                    },
                  });
                  window.__zuriEmitPortMessage({
                    type: "compact_context_result",
                    requestId: message.requestId,
                    sessionId: message.sessionId,
                    compacted: true,
                    instructionApplied: Boolean(message.instruction),
                    inputTokensBefore: 4200,
                    inputTokensAfter: 1200,
                  });
                }, Math.max(0, Number(lifecycle.delayMs) || 0));
              } else {
                const result = window.__zuriCompactResult && typeof window.__zuriCompactResult === "object"
                  ? window.__zuriCompactResult
                  : {};
                queueMicrotask(() => window.__zuriEmitPortMessage({
                  type: "compact_context_result",
                  requestId: message.requestId,
                  sessionId: message.sessionId,
                  compacted: true,
                  instructionApplied: Boolean(message.instruction),
                  inputTokensBefore: 4200,
                  inputTokensAfter: 1200,
                  ...result,
                }));
              }
            }
          },
          disconnect() {
            for (const listener of portDisconnectListeners) listener();
          },
          onDisconnect: {
            addListener(listener) { portDisconnectListeners.add(listener); },
            removeListener(listener) { portDisconnectListeners.delete(listener); },
          },
          onMessage: {
            addListener(listener) { portMessageListeners.add(listener); },
            removeListener(listener) { portMessageListeners.delete(listener); },
          },
        };
      },
    },
    storage: {
      local: {
        async get(keys) {
          if (localGetDelayMs) await new Promise(resolve => setTimeout(resolve, localGetDelayMs));
          if (keys == null) return clone(storage);
          if (typeof keys === "string") return { [keys]: clone(storage[keys]) };
          if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, clone(storage[key])]));
          return Object.fromEntries(Object.entries(keys || {}).map(([key, fallback]) => [
            key,
            storage[key] === undefined ? clone(fallback) : clone(storage[key]),
          ]));
        },
        async set(values = {}) { Object.assign(storage, clone(values)); },
        async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key]; },
        async clear() { for (const key of Object.keys(storage)) delete storage[key]; },
      },
      session: {
        async get(keys) {
          if (sessionGetDelayMs) await new Promise(resolve => setTimeout(resolve, sessionGetDelayMs));
          const read = key => {
            const value = localStorage.getItem(`${sessionStoragePrefix}${key}`);
            return value === null ? undefined : JSON.parse(value);
          };
          if (keys == null) {
            const result = {};
            for (let index = 0; index < localStorage.length; index += 1) {
              const key = localStorage.key(index);
              if (!key?.startsWith(sessionStoragePrefix)) continue;
              result[key.slice(sessionStoragePrefix.length)] = JSON.parse(localStorage.getItem(key));
            }
            return result;
          }
          if (typeof keys === "string") return { [keys]: read(keys) };
          if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, read(key)]));
          return Object.fromEntries(Object.entries(keys || {}).map(([key, fallback]) => [
            key,
            read(key) === undefined ? clone(fallback) : read(key),
          ]));
        },
        async set(values = {}) {
          window.__zuriSessionSetAttempts += 1;
          if (sessionSetFailuresRemaining > 0) {
            sessionSetFailuresRemaining -= 1;
            throw new Error("forced session storage write failure");
          }
          for (const [key, value] of Object.entries(values)) {
            localStorage.setItem(`${sessionStoragePrefix}${key}`, JSON.stringify(clone(value)));
          }
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            localStorage.removeItem(`${sessionStoragePrefix}${key}`);
          }
        },
      },
      onChanged: {
        addListener(listener) { storageListeners.add(listener); },
        removeListener(listener) { storageListeners.delete(listener); },
      },
    },
    commands: {
      async getAll() {
        window.__zuriCommandsGetAllCount += 1;
        return clone(window.__zuriCommands);
      },
    },
    downloads: { async download() { return 1; }, async search() { return []; }, open() {}, show() {} },
    tabs: {
      async create(input = {}) {
        window.__zuriCreatedTabs.push(clone(input));
        return { id: 1, ...clone(input) };
      },
      async query() { return []; },
    },
    windows: { async getCurrent() { return { id: Number(options.windowId) || 1 }; } },
    sidePanel: {
      onOpened: {
        addListener(listener) { sidePanelOpenedListeners.add(listener); },
        removeListener(listener) { sidePanelOpenedListeners.delete(listener); },
      },
    },
    desktopCapture: { chooseDesktopMedia() { return null; } },
  };
}
