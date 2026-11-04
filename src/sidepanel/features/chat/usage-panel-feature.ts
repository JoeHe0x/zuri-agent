import { t } from "../../i18n/index.js";
import { contextUsageLevel, contextUsagePercent, formatContextUsageText, formatTokenCount } from "../../ui/ui-utils.js";
import type { PortMessage } from "../app/port-client.js";

interface UsageStep { input: number; read: number; write: number; output: number }
interface ReplayEntry { role: string; text: string; tools: { name: string; args: string; result: string }[]; cache: UsageStep | null }
interface ContextBreakdown {
  window: number; used: number; tools: number; system: number; messages: number; buffer: number;
  toolList: { name: string; tokens: number }[];
}
interface UsagePanelOptions {
  button: HTMLElement; panel: HTMLElement;
  getSessionId?(): string | null;
  compact(): Promise<unknown>;
  request(type: string, payload?: PortMessage, timeout?: number | null): Promise<PortMessage>;
}

/** Hit rate at or above this reads as healthy; the cache tab draws it as a waterline. */
const HIT_WATERLINE = 0.8;
const RECENT_STEPS = 8;
const WHO_USER = '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>';
const WHO_AGENT = '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4.5M9 13.5v1M15 13.5v1"/>';
const ratio = (part: number, whole: number) => whole > 0 ? part / whole : 0;
const percent = (part: number, whole: number) => whole > 0 ? `${Math.round(part / whole * 100)}%` : "–";
const full = (value: number) => Math.round(value).toLocaleString();

function el(tag: string, className: string, text = "") {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Click the context ring: a "Context" tab with the window composition and a "Cache" tab with per-request hit rates. */
export function createUsagePanelFeature(options: UsagePanelOptions) {
  const { button, panel } = options;
  let tab: "context" | "cache" | "replay" = "context";
  let steps: UsageStep[] = [];
  let timeline: ReplayEntry[] = [];
  const replayOpen = new Set<number>();
  let context: ContextBreakdown | null = null;
  let toolsOpen = false;

  const ESTIMATED = new Set(["system", "tools", "messages"]);

  function legendRow(key: string, label: string, value: number, whole: number, extraTip = "") {
    const row = el("div", "usage-line");
    row.title = t("usageLineTip", { label, tokens: full(value), rate: percent(value, whole) }) + extraTip;
    row.append(el("i", `usage-dot usage-dot--${key}`), el("span", "usage-label", label), el("span", "usage-value", `${ESTIMATED.has(key) ? "≈" : ""}${formatTokenCount(value)}`), el("span", "usage-share", percent(value, whole)));
    return row;
  }

  /** Makes the tools row a disclosure that lists every tool definition with its estimated tokens. */
  function toolsDetail(row: HTMLElement, tools: ContextBreakdown["toolList"], total: number) {
    const list = el("div", "usage-tools");
    list.hidden = !toolsOpen;
    for (const tool of tools) {
      const item = el("div", "usage-tool");
      item.title = t("usageLineTip", { label: tool.name, tokens: full(tool.tokens), rate: percent(tool.tokens, total) });
      item.append(el("span", "usage-tool-name", tool.name), el("span", "usage-tool-tokens", `≈${formatTokenCount(tool.tokens)}`));
      list.append(item);
    }
    row.classList.add("usage-line--expandable");
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.setAttribute("aria-expanded", String(toolsOpen));
    const toggle = () => { toolsOpen = !toolsOpen; list.hidden = !toolsOpen; row.setAttribute("aria-expanded", String(toolsOpen)); };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } });
    return list;
  }

  function renderContext() {
    const view = el("div", "usage-view");
    if (!context || !context.used) {
      view.append(el("div", "usage-empty", t("usageEmpty")));
      return view;
    }
    const whole = context.window || context.used;
    const head = el("div", "usage-head");
    head.append(el("span", "usage-rate", percent(context.used, whole)), el("span", "usage-caption", `≈${formatTokenCount(context.used)} / ${formatTokenCount(whole)}`));
    const free = Math.max(0, whole - context.used - context.buffer);
    const parts = [["system", context.system], ["tools", context.tools], ["messages", context.messages], ["free", free], ["buffer", context.buffer]] as const;
    const bar = el("div", "usage-stack");
    for (const [key, value] of parts) {
      const part = el("i", `usage-dot--${key}`);
      part.style.flexGrow = String(value);
      bar.append(part);
    }
    const labels = { system: t("usageSystem"), tools: t("usageTools"), messages: t("usageMessages"), free: t("usageFree"), buffer: t("usageBuffer") };
    const runway = whole - context.buffer - context.used;
    const foot = el("div", "usage-foot");
    foot.append(el("span", "usage-runway", runway > 0 ? t("usageRunway", { tokens: formatTokenCount(runway) }) : t("usageCompactSoon")));
    const compact = el("button", "usage-compact", t("compactContext")) as HTMLButtonElement;
    compact.type = "button";
    compact.addEventListener("click", async () => {
      compact.disabled = true;
      await options.compact().catch(() => undefined);
      await load();
    });
    foot.append(compact);
    view.append(head, bar, foot);
    for (const [key, value] of parts) {
      if (value <= 0) continue;
      const row = legendRow(key, labels[key], value, whole, key === "buffer" ? `\n${t("usageBufferTip")}` : "");
      view.append(row);
      if (key === "tools" && context.toolList.length) view.append(toolsDetail(row, context.toolList, value));
    }
    return view;
  }

  function renderCache() {
    const view = el("div", "usage-view");
    if (!steps.length) {
      view.append(el("div", "usage-empty", t("usageEmpty")));
      return view;
    }
    const sum = (key: keyof UsageStep) => steps.reduce((total, step) => total + step[key], 0);
    // The first request is always a cold start, so it is neither flagged low nor picked as costliest.
    const costliest = steps.length > 2 ? steps.reduce((best, step, i) => i > 0 && step.input - step.read > steps[best].input - steps[best].read ? i : best, 1) : -1;
    const firstShown = Math.max(0, steps.length - RECENT_STEPS);
    const head = el("div", "usage-head");
    head.append(el("span", "usage-rate", percent(sum("read"), sum("input"))), el("span", "usage-caption", t("usageCacheCaption", { count: steps.length })));
    const list = el("div", "usage-list");
    steps.forEach((step, index) => {
      if (index < firstShown) return;
      const rate = ratio(step.read, step.input);
      const row = el("div", `usage-row${index === costliest ? " usage-row--top" : ""}${index > 0 && rate < HIT_WATERLINE ? " usage-row--low" : ""}`);
      row.title = t("usageRowTip", { read: formatTokenCount(step.read), input: formatTokenCount(step.input) });
      const fill = el("i", "usage-fill");
      fill.style.width = `${Math.round(rate * 100)}%`;
      const track = el("div", "usage-track");
      track.style.setProperty("--waterline", `${HIT_WATERLINE * 100}%`);
      track.append(fill);
      row.append(el("span", "usage-n", String(index + 1)), track, el("span", "usage-in", formatTokenCount(step.input)), el("span", "usage-pct", percent(step.read, step.input)));
      list.append(row);
    });
    view.append(head, list, el("div", "usage-note", t("usageWaterline", { rate: Math.round(HIT_WATERLINE * 100) }) + (firstShown ? ` ${t("usageRecent", { n: RECENT_STEPS })}` : "")));
    return view;
  }

  /** History in order; each assistant turn carries the same cache_usage numbers the trace records. */
  function renderReplay() {
    const view = el("div", "usage-view");
    if (!timeline.length) {
      view.append(el("div", "usage-empty", t("usageEmpty")));
      return view;
    }
    const list = el("div", "usage-list usage-replay");
    timeline.forEach((entry, index) => {
      const row = el("div", `usage-step usage-step--${entry.role}`);
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-expanded", String(replayOpen.has(index)));
      const who = el("span", "usage-who");
      who.title = entry.role === "user" ? t("replayYou") : t("replayAgent");
      who.setAttribute("role", "img");
      who.setAttribute("aria-label", who.title);
      who.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${entry.role === "user" ? WHO_USER : WHO_AGENT}</svg>`;
      row.append(who);
      row.append(el("span", "usage-text", entry.text || entry.tools.map(tool => tool.name).join(" · ")));
      const tail = entry.cache && entry.cache.input > 0 ? el("span", `usage-tail${ratio(entry.cache.read, entry.cache.input) < HIT_WATERLINE ? " usage-meta--low" : ""}`, percent(entry.cache.read, entry.cache.input)) : null;
      if (tail) row.append(tail);
      if (entry.tools.length) row.append(el("span", "usage-tool-calls", entry.tools.map(tool => tool.name).join(" · ")));
      const cache = entry.cache;
      if (cache && cache.input > 0) {
        const meta = el("span", `usage-meta${ratio(cache.read, cache.input) < HIT_WATERLINE ? " usage-meta--low" : ""}`, t("replayCache", { rate: percent(cache.read, cache.input), input: formatTokenCount(cache.input), output: formatTokenCount(cache.output) }));
        meta.title = t("usageRowTip", { read: formatTokenCount(cache.read), input: formatTokenCount(cache.input) });
        row.append(meta);
      }
      const detail = el("div", "usage-detail");
      detail.hidden = !replayOpen.has(index);
      for (const tool of entry.tools) {
        const block = el("div", "usage-call");
        block.append(el("b", "usage-call-name", tool.name));
        if (tool.args) block.append(el("code", "usage-call-body", tool.args));
        if (tool.result) block.append(el("code", "usage-call-body usage-call-result", tool.result));
        detail.append(block);
      }
      if (cache && cache.input > 0) detail.append(el("span", "usage-meta", t("replayCacheDetail", { read: formatTokenCount(cache.read), write: formatTokenCount(cache.write), fresh: formatTokenCount(Math.max(0, cache.input - cache.read - cache.write)) })));
      row.append(detail);
      const toggle = () => { const open = detail.hidden; detail.hidden = !open; row.setAttribute("aria-expanded", String(open)); if (open) replayOpen.add(index); else replayOpen.delete(index); };
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } });
      list.append(row);
    });
    view.append(list);
    return view;
  }

  function render() {
    const tabs = el("div", "usage-tabs");
    for (const [key, label] of [["context", t("usageTabContext")], ["cache", t("usageTabCache")], ["replay", t("usageTabReplay")]] as const) {
      const item = el("button", "usage-tab", label) as HTMLButtonElement;
      item.type = "button";
      item.setAttribute("aria-pressed", String(tab === key));
      item.addEventListener("click", () => { tab = key; render(); });
      tabs.append(item);
    }
    panel.replaceChildren(tabs, tab === "context" ? renderContext() : tab === "cache" ? renderCache() : renderReplay());
  }

  async function load() {
    const sessionId = options.getSessionId?.();
    if (!sessionId) return;
    try {
      const reply = await options.request("get_usage", { sessionId }, 3000);
      steps = Array.isArray(reply.steps) ? reply.steps as UsageStep[] : [];
      timeline = Array.isArray(reply.timeline) ? reply.timeline as ReplayEntry[] : [];
      context = (reply.context as ContextBreakdown | undefined) ?? null;
      // The ring only hears about send-time snapshots; sync it to the fresh estimate so both show one number.
      if (context?.used) {
        button.title = formatContextUsageText(context.used, context.window);
        button.dataset.level = contextUsageLevel(context.used, context.window);
        button.style.setProperty("--pct", String(contextUsagePercent(context.used, context.window)));
      }
    } catch (_err) {
      steps = [];
      timeline = [];
      context = null;
    }
    render();
  }

  /** Same placement as the "+" menu: the panel sits 4px above the button, with its right edge on the button's. */
  function alignToButton() {
    const area = panel.offsetParent;
    if (!area) return;
    const areaRect = area.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    panel.style.bottom = `${Math.round(areaRect.bottom - buttonRect.top + 4)}px`;
    // Keep the left edge inside the area (12px gutter) when the ring sits far from the right edge.
    const maxEnd = Math.max(0, areaRect.width - panel.offsetWidth - 12);
    panel.style.insetInlineEnd = `${Math.min(maxEnd, Math.max(0, Math.round(areaRect.right - buttonRect.right)))}px`;
  }

  button.addEventListener("click", () => {
    if (panel.classList.toggle("hidden")) return;
    alignToButton();
    void load();
  });
  document.addEventListener("pointerdown", event => {
    if (!panel.classList.contains("hidden") && !panel.contains(event.target as Node) && !button.contains(event.target as Node)) panel.classList.add("hidden");
  });
}
