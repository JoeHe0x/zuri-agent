import type { UiActivation, UiExtensionAPI } from "#sdk/sidepanel";
import { createSettingsForm } from "#sdk/sidepanel/settings-form";
import qrcode from "qrcode-generator";
import { hasMessage, t, type MessageKey } from "./i18n.js";

interface Draft { enabled: boolean; autoAllowAll: boolean; progress: boolean; suggest: boolean; fields: Record<string, string> }
interface Status { id?: string; state: string; error?: string; stats?: { received: number; failed: number; reconnects: number }; allowed: string[]; pending: { senderId: string; text: string; direct: boolean }[] }
interface Field { key: string; secret?: boolean; optional?: boolean; managed?: boolean }
interface ChannelInfo { id: string; label: string; fields: Field[]; login?: boolean }
const REFRESH_MS = 3000, LOGIN_ATTEMPTS = 3;
const SECTION_ID = "channels";

/**
 * One section for every channel: the Background says which channels exist and which fields each has, and the form is built
 * from that. A channel's own wording comes from messages.ts (`<id>Title`, `<id>Intro`, `<id>Field_<key>`, `<id>Hint_<key>`);
 * without it the page falls back to the adapter's label and the field keys, so a new channel works before it is polished.
 * The Background owns the connections and the credentials; this page edits them through Side Panel requests.
 */
export default function (zuri: UiExtensionAPI) {
  const view = zuri.mountTemplate("channels-template");
  const section = view.querySelector<HTMLElement>("[data-ref=section]")!;
  const $ = <T extends HTMLElement>(ref: string) => section.querySelector<T>(`[data-ref=${ref}]`)!;
  const select = $<HTMLSelectElement>("channel"), enabled = $<HTMLInputElement>("enabled"), autoAllow = $<HTMLInputElement>("auto-allow"), progress = $<HTMLInputElement>("progress"), suggest = $<HTMLInputElement>("suggest");
  const statusLine = $("status"), pendingBlock = $("pending-block"), pendingList = $("pending-list"), allowedList = $("allowed-list"), fieldBox = $("fields");
  const loginBlock = $("login-block"), loginButton = $<HTMLButtonElement>("login-button"), loginQr = $<HTMLImageElement>("login-qr"), loginStatus = $("login-status");
  select.id = "channels-channel";
  $<HTMLLabelElement>("channel-label").htmlFor = select.id;
  $("channel-label").textContent = t("channelLabel");
  $("auto-allow-label").textContent = t("autoAllowAll");
  $("auto-allow-hint").textContent = t("autoAllowAllHint");
  $("progress-label").textContent = t("progress");
  $("suggest-label").textContent = t("suggest");
  $("pending-title").textContent = t("pending");
  $("pending-hint").textContent = t("pendingHint");
  $("allowed-title").textContent = t("allowed");

  let channels: ChannelInfo[] = [];
  let current: ChannelInfo | undefined;
  let builtFor = "";
  let dirty = false;
  let activation: UiActivation | undefined;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let loginRun: AbortController | undefined;
  const inputs = new Map<string, HTMLInputElement>();
  const managed: Field[] = [];
  const states = new Map<string, string>();

  const copy = (info: ChannelInfo, name: string, fallback = "") => hasMessage(`${info.id}${name}`) ? t(`${info.id}${name}` as MessageKey) : fallback;
  const title = (info: ChannelInfo) => copy(info, "Title", info.label);
  const ask = async (type: string, payload: Record<string, unknown> = {}, timeout = 15000) => {
    const reply = await zuri.request(type, { channel: current?.id, ...payload }, timeout) as { result?: any; error?: unknown };
    if (reply.error) throw new Error(String(reply.error));
    return reply.result;
  };

  function renderOptions() {
    select.replaceChildren(...channels.map(info => {
      const option = zuri.root.createElement("option");
      option.value = info.id;
      option.textContent = states.get(info.id) === "connected" ? `${title(info)} · ${t("statusConnected")}` : title(info);
      option.selected = info.id === current?.id;
      return option;
    }));
  }

  /** The inputs and wording of one channel, built from what the Background says it needs. */
  function build(info: ChannelInfo) {
    if (builtFor === info.id) return;
    builtFor = info.id;
    fieldBox.replaceChildren();
    inputs.clear();
    managed.length = 0;
    $("intro").textContent = copy(info, "Intro");
    $("intro").classList.toggle("hidden", !$("intro").textContent);
    $("enable-label").textContent = t("enable", { name: title(info) });
    loginBlock.classList.toggle("hidden", !info.login);
    loginQr.classList.add("hidden");
    for (const field of info.fields) {
      if (field.managed) { managed.push(field); continue; }
      const id = `${SECTION_ID}-${info.id}-${field.key}`;
      const label = zuri.root.createElement("label");
      label.className = "zuri-field-label";
      label.htmlFor = id;
      label.textContent = copy(info, `Field_${field.key}`, field.key);
      const input = zuri.root.createElement("input");
      input.id = id;
      input.className = "zuri-field";
      input.type = field.secret ? "password" : "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.addEventListener("input", () => form.changed(), { signal: zuri.signal });
      fieldBox.append(label, input);
      const hint = copy(info, `Hint_${field.key}`);
      if (hint) {
        const note = zuri.root.createElement("p");
        note.className = "zuri:m-0 zuri:text-[12px] zuri:leading-[1.5] zuri:text-muted-foreground";
        note.textContent = hint;
        fieldBox.append(note);
      }
      inputs.set(field.key, input);
    }
  }

  function row(label: string, detail: string, actions: [string, () => void][]) {
    const item = zuri.root.createElement("li");
    item.className = "zuri:flex zuri:items-center zuri:justify-between zuri:gap-2 zuri:min-w-0";
    const text = zuri.root.createElement("span");
    text.className = "zuri:min-w-0 zuri:text-[12px] zuri:wrap-anywhere";
    text.textContent = detail ? `${label} · ${detail}` : label;
    item.append(text);
    for (const [name, run] of actions) {
      const button = zuri.root.createElement("button");
      button.type = "button";
      button.className = "zuri-btn zuri-btn--secondary zuri:shrink-0";
      button.textContent = name;
      button.addEventListener("click", run, { signal: zuri.signal });
      item.append(button);
    }
    return item;
  }

  function render(status: Status) {
    const names: Record<string, string> = {
      disabled: t("statusDisabled"), connecting: t("statusConnecting"), connected: t("statusConnected"),
      disconnected: t("statusDisconnected"), replaced: t("statusReplaced"),
    };
    const counts = status.stats ? ` · ${t("stats", { received: status.stats.received, failed: status.stats.failed, reconnects: status.stats.reconnects })}` : "";
    statusLine.textContent = (names[status.state] || t("statusUnavailable")) + (status.state === "disabled" ? "" : counts)
      + (status.state === "disconnected" && status.error ? ` (${status.error})` : "");
    statusLine.dataset.state = status.state;
    const act = (type: string, senderId: string) => async () => {
      try { await ask(type, { senderId }); await refresh(); } catch { zuri.showToast(t("actionFailed"), { tone: "error" }); }
    };
    pendingBlock.classList.toggle("hidden", status.pending.length === 0);
    pendingList.replaceChildren(...status.pending.map(item => row(item.senderId, `${item.direct ? t("direct") : t("group")}${item.text ? ` · ${item.text}` : ""}`,
      [[t("allow"), act("channels_approve", item.senderId)], [t("ignore"), act("channels_deny", item.senderId)]])));
    allowedList.replaceChildren(...(status.allowed.length
      ? status.allowed.map(id => row(id, "", [[t("remove"), act("channels_remove", id)]]))
      : [row(t("none"), "", [])]));
  }

  async function refresh() {
    if (zuri.signal.aborted || !channels.length) return;
    const shown = current;
    try {
      const all = await Promise.all(channels.map(async info => [info.id, await ask("channels_status", { channel: info.id }) as Status] as const));
      if (zuri.signal.aborted) return;
      for (const [id, status] of all) states.set(id, status.state);
      renderOptions();
      const status = all.find(([id]) => id === shown?.id)?.[1];
      if (status && shown === current) render(status);
    } catch { statusLine.textContent = t("statusUnavailable"); }
  }

  const stopLogin = () => { loginRun?.abort(); loginRun = undefined; loginQr.classList.add("hidden"); };
  /** Shows the QR code, then follows the sign-in until it ends. The credentials are saved by the Background. */
  async function login() {
    stopLogin();
    const run = loginRun = new AbortController();
    const signal = AbortSignal.any([zuri.signal, run.signal]);
    const channel = current!.id;
    loginButton.disabled = true;
    try {
      for (let attempt = 0; attempt < LOGIN_ATTEMPTS; attempt++) {
        let { ticket, qr } = await ask("channels_login_start", { channel }) as { ticket: string; qr: string };
        signal.throwIfAborted();
        const code = qrcode(0, "M");
        code.addData(qr);
        code.make();
        loginQr.src = code.createDataURL(6, 2);
        loginQr.classList.remove("hidden");
        loginStatus.textContent = t("loginWaiting");
        for (;;) {
          const step = await ask("channels_login_poll", { channel, ticket }, 45000) as { status: string; ticket?: string };
          signal.throwIfAborted();
          if (step.ticket) ticket = step.ticket;
          if (step.status === "done") {
            loginQr.classList.add("hidden");
            loginStatus.textContent = t("loginDone");
            zuri.showToast(t("loginDone"), { tone: "success" });
            await refresh();
            await reload(); // The saved settings are now the ones to show.
            return;
          }
          if (step.status === "expired") break; // A fresh QR code, up to LOGIN_ATTEMPTS times.
          loginStatus.textContent = step.status === "scanned" ? t("loginScanned") : t("loginWaiting");
        }
      }
      loginQr.classList.add("hidden");
      loginStatus.textContent = t("loginExpired");
    } catch {
      if (!signal.aborted) { loginQr.classList.add("hidden"); loginStatus.textContent = t("loginFailed"); }
    } finally {
      if (loginRun === run) loginRun = undefined;
      loginButton.disabled = false;
    }
  }
  loginButton.addEventListener("click", () => { void login(); }, { signal: zuri.signal });
  zuri.onDispose(stopLogin);

  // A form loads once per time the settings open, so showing another channel (or fresh settings) takes a new form.
  const makeForm = () => createSettingsForm<Draft>(zuri, {
    initialValue: { enabled: false, autoAllowAll: false, progress: false, suggest: false, fields: {} },
    equals: (a, b) => a.enabled === b.enabled && a.autoAllowAll === b.autoAllowAll && a.progress === b.progress && a.suggest === b.suggest && JSON.stringify(a.fields) === JSON.stringify(b.fields),
    getDraft: () => ({ enabled: enabled.checked, autoAllowAll: autoAllow.checked, progress: progress.checked, suggest: suggest.checked,
      fields: Object.fromEntries([...inputs].map(([key, input]) => [key, input.value.trim()])) }),
    setDraft: value => {
      enabled.checked = value.enabled; autoAllow.checked = value.autoAllowAll; progress.checked = value.progress; suggest.checked = value.suggest;
      for (const [key, input] of inputs) input.value = value.fields[key] ?? "";
    },
    load: async signal => {
      if (!channels.length) {
        channels = await ask("channels_list") as ChannelInfo[];
        current ??= channels[0];
        renderOptions();
      }
      const info = current;
      if (!info) throw new Error("no channels");
      build(info);
      const config = await ask("channels_config", { channel: info.id });
      signal.throwIfAborted();
      for (const [key, input] of inputs) input.placeholder = config.secrets?.includes(key) ? t("secretKept") : "";
      if (managed.length) {
        const linked = managed.every(field => field.optional || config.secrets?.includes(field.key));
        loginButton.textContent = linked ? t("loginAgain") : t("loginButton");
        if (!loginRun) loginStatus.textContent = linked ? t("loginLinked") : t("loginNotLinked");
      }
      return { enabled: config.enabled === true, autoAllowAll: config.autoAllowAll === true, progress: config.progress === true, suggest: config.suggest === true,
        fields: Object.fromEntries([...inputs.keys()].map(key => [key, String(config.fields?.[key] ?? "")])) };
    },
    save: async (value, signal) => {
      await ask("channels_save", { ...value }, 30000);
      signal.throwIfAborted();
      await refresh();
    },
    renderState({ phase, dirty: changed }) {
      dirty = changed;
      const loading = phase === "loading", saving = phase === "saving";
      const failed = phase === "load-error" || phase === "save-error";
      zuri.settings.setState(SECTION_ID, {
        text: loading ? t("loading") : saving ? t("saving") : phase === "load-error" ? t("loadFailed")
          : phase === "save-error" ? t("saveFailed") : changed ? t("unsavedChanges") : t("saved"),
        tone: failed ? "error" : loading || saving ? "muted" : changed ? "dirty" : "saved",
        saveLabel: saving ? t("saving") : t("save"),
        disabled: loading || !changed,
        busy: saving,
      });
    },
  });
  let form = makeForm();
  async function reload() {
    form.deactivate();
    dirty = false;
    form = makeForm();
    if (activation) await form.activate(activation);
  }
  for (const input of [enabled, autoAllow, progress, suggest]) input.addEventListener("change", () => form.changed(), { signal: zuri.signal });
  select.addEventListener("change", async () => {
    const next = channels.find(info => info.id === select.value);
    if (!next || next === current) return;
    if (dirty && !await zuri.dialogs.confirm({ title: t("discardTitle"), message: t("discardMessage"), confirmLabel: t("discard"), cancelLabel: t("keepEditing") })) {
      select.value = current?.id ?? "";
      return;
    }
    stopLogin();
    current = next;
    await reload(); // Builds and loads the other channel's form.
    void refresh();
  }, { signal: zuri.signal });
  const stopRefreshing = () => { clearInterval(refreshTimer); refreshTimer = undefined; };
  zuri.onDispose(stopRefreshing);

  zuri.registerSettings({
    id: SECTION_ID,
    title: t("title"),
    tab: { id: "channels", title: t("tab"), order: 40 },
    order: 10,
    element: section,
    async activate(context) {
      activation = context;
      void refresh();
      refreshTimer ??= setInterval(() => { void refresh(); }, REFRESH_MS);
      await form.activate(context);
    },
    deactivate() { stopRefreshing(); stopLogin(); form.deactivate(); },
    save: context => form.save(context),
  });
}
