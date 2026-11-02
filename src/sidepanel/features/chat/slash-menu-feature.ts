import { getLocale } from "../../../shared/i18n/index.js";
import { t, tHtml } from "../../i18n/index.js";
import type { UiReferenceItem as SlashItem, WorkspaceExtensions } from "../app/workspace-extensions.js";
interface SlashOptions {
  input: HTMLTextAreaElement; menu: HTMLElement; chips: HTMLElement;
  references?: Pick<WorkspaceExtensions, "referenceSources" | "listReferences">;
  onInputChanged?(): void; onCommand?(command: NonNullable<ReturnType<typeof parseSlashCommandText>>): Promise<unknown>;
}

import { escapeHtml, escapeHtmlAttribute } from "../../ui/ui-utils.js";

const SLASH_MENU_LIMIT = 12;

export const BUILTIN_SLASH_COMMANDS = Object.freeze([
  Object.freeze({
    kind: "command",
    name: "compact_context",
    aliases: Object.freeze(["compact", t("compactContext")]),
    token: "/compact",
    label: t("compactContext"),
    title: t("compactContext"),
    subtitle: t("compactHint"),
    meta: "/compact",
    priority: -1,
    search: "compact 压缩上下文 上下文 摘要 命令",
  }),
]);

export function parseSlashCommandText(value: unknown = "") {
  const source = String(value || "").trim();
  const match = source.match(/^\/([^\s/]+)(?:\s+([\s\S]*))?$/u);
  if (!match) return null;
  const alias = String(match[1] || "").toLowerCase();
  const command = BUILTIN_SLASH_COMMANDS.find(item => item.aliases.some(value => value.toLowerCase() === alias));
  if (!command) return null;
  return {
    ...command,
    alias: match[1],
    argumentText: String(match[2] || "").trim(),
  };
}

export function createSlashMenuFeature(options: SlashOptions) {
  const input = options.input;
  const menu = options.menu;
  const referenceSources = () => options.references?.referenceSources() || [];
  const sources = () => [...referenceSources(), {
    id: "command", label: t("commands"), menuLabel: t("commands"), filterLabel: "command", className: "command", emptyText: t("noMatchingCommands"),
  }];
  const onInputChanged = options.onInputChanged || (() => {});
  const onCommand = options.onCommand || (async () => ({}));
  if (!input || !menu) throw new Error("slash menu input and menu are required");

  let slashMenuState = createClosedMenuState();
  let slashResourcesSeq = 0;
  // `@` mentions live as chips above the input and join the prompt as [kind: name] tokens at send.
  // The current tab is shared by default until dismissed; several chips collapse to the first one.
  let mentions: SlashItem[] = [];
  let currentTab: SlashItem | null = null;
  let dismissedTab = "";
  let mentionsExpanded = false;
  const tabKey = (item: SlashItem) => item.name.match(/ #(\d+)/)?.[1] || item.name;
  const sharedItems = () => [
    ...(currentTab ? [currentTab] : []),
    ...mentions.filter(item => !currentTab || tabKey(item) !== tabKey(currentTab)),
  ];

  function renderMentions() {
    const items = sharedItems();
    const shown = mentionsExpanded ? items : items.slice(0, 1);
    options.chips.classList.toggle("hidden", !items.length);
    options.chips.innerHTML = shown.map((item, index) => `
      <span class="mention-chip" title="${escapeHtmlAttribute(item.title)}">
        ${item.icon ? `<img class="mention-chip-icon" src="${escapeHtmlAttribute(item.icon)}" alt="">` : `<span class="mention-chip-icon"></span>`}
        <span class="mention-chip-title">${escapeHtml(t("sharingTab", { title: item.title }))}</span>
        ${index === 0 && items.length > 1 ? `<button class="mention-chip-more" type="button" data-mention-toggle aria-expanded="${mentionsExpanded}">${mentionsExpanded ? tHtml("showLess") : `+${items.length - 1}`}</button>` : ""}
        <button class="mention-chip-remove" type="button" data-mention-remove="${index}" aria-label="${tHtml("remove")}">×</button>
      </span>`).join("");
  }
  options.chips.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (target?.closest("[data-mention-toggle]")) {
      mentionsExpanded = !mentionsExpanded;
      renderMentions();
      return;
    }
    const button = target?.closest<HTMLElement>("[data-mention-remove]");
    if (!button) return;
    const item = sharedItems()[Number(button.dataset.mentionRemove)];
    if (item === currentTab) { dismissedTab = tabKey(item); currentTab = null; }
    else mentions = mentions.filter(mention => mention !== item);
    if (sharedItems().length < 2) mentionsExpanded = false;
    renderMentions();
    input.focus();
  });

  async function refreshCurrentTab() {
    const current = (await options.references?.listReferences() || []).find(item => item.current);
    currentTab = current && tabKey(current) !== dismissedTab ? current : null;
    renderMentions();
  }
  if (typeof chrome !== "undefined" && chrome.tabs?.onActivated) {
    const refresh = () => void refreshCurrentTab().catch(() => {});
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener((_id, change) => { if (change.title || change.status === "complete") refresh(); });
  }
  void refreshCurrentTab().catch(() => {});

function handleSlashMenuKeydown(event: KeyboardEvent) {
  if (!slashMenuState.open) return false;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const count = slashMenuState.items.length;
    if (count > 0) {
      slashMenuState.selected = (slashMenuState.selected + delta + count) % count;
      renderSlashMenu();
    }
    return true;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    if (slashMenuState.items.length === 0) return false;
    event.preventDefault();
    selectSlashItem(slashMenuState.selected);
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeSlashMenu();
    return true;
  }
  return false;
}

async function updateSlashMenu() {
  const trigger = getSlashTrigger();
  if (!trigger) {
    closeSlashMenu();
    return;
  }
  const seq = ++slashResourcesSeq;
  const resources = await loadSlashResources(trigger.query, { includeCommands: trigger.commandEligible, mention: trigger.mention });
  if (seq !== slashResourcesSeq) return;
  const filter = slashMenuState.open ? resolveFilter(slashMenuState.filter) : "all";
  slashMenuState = {
    open: true,
    start: trigger.start,
    end: trigger.end,
    query: trigger.query,
    filter,
    selected: 0,
    allItems: resources,
    items: getVisibleSlashItems(resources, filter),
    commandEligible: trigger.commandEligible,
    mention: trigger.mention,
  };
  renderSlashMenu();
}

function getSlashTrigger() {
  const cursor = input.selectionStart ?? input.value.length;
  if (cursor !== (input.selectionEnd ?? cursor)) return null;
  const before = input.value.slice(0, cursor);
  const match = before.match(/(^|\s)([/@])([^\s/@\[\]]*)$/u);
  if (!match) return null;
  const start = before.length - match[3].length - 1;
  return {
    start,
    end: cursor,
    query: match[3] || "",
    mention: match[2] === "@",
    commandEligible: match[2] === "/" && !input.value.slice(0, start).trim() && !input.value.slice(cursor).trim(),
  };
}

async function loadSlashResources(query = "", { includeCommands = true, mention = false } = {}): Promise<SlashItem[]> {
  const q = String(query || "").trim().toLowerCase();
  const references = await options.references?.listReferences() || [];
  const commandItems = includeCommands ? BUILTIN_SLASH_COMMANDS : [];
  const all: SlashItem[] = [...commandItems, ...references];
  return all
    .filter(item => (item.kind === "tab") === mention)
    .filter(item => !q || item.search.includes(q))
    .sort((a, b) => Number(!!a.run) - Number(!!b.run) || kindRank(a.kind) - kindRank(b.kind) || a.kind.localeCompare(b.kind) || a.priority - b.priority || a.title.localeCompare(b.title, getLocale()));
}

async function refreshOpenSlashMenu() {
  if (!slashMenuState.open) return;
  const seq = ++slashResourcesSeq;
  try {
    const resources = await loadSlashResources(slashMenuState.query, {
      includeCommands: slashMenuState.commandEligible, mention: slashMenuState.mention,
    });
    if (seq !== slashResourcesSeq || !slashMenuState.open) return;
    const filter = resolveFilter(slashMenuState.filter);
    const items = getVisibleSlashItems(resources, filter);
    slashMenuState = {
      ...slashMenuState,
      allItems: resources,
      filter,
      items,
      selected: items.length ? Math.min(slashMenuState.selected, items.length - 1) : 0,
    };
    renderSlashMenu();
  } catch (err) {
    console.debug("[轻舟] refresh slash resources after registry update failed:", err instanceof Error ? err.message : err);
  }
}

function resolveFilter(filter: string) {
  return sources().some(source => source.id === filter) ? filter : "all";
}

function getVisibleSlashItems(items: SlashItem[] = [], filter = "all") {
  const visibleItems = filter === "all" ? items : items.filter(item => item.kind === filter);
  return visibleItems.slice(0, SLASH_MENU_LIMIT);
}

function getSlashEmptyText(filter: string) {
  return sources().find(source => source.id === filter)?.emptyText || t("noMatchingResources");
}

const kindRank = (kind: string) => kind === "skill" ? 0 : kind === "command" ? 2 : 1;
const SLASH_ICONS: Record<string, string> = {
  skill: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  command: '<path d="M8 20 16 4"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  data: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M10 10v9"/>',
};
const slashIcon = (kind: string) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SLASH_ICONS[kind] || SLASH_ICONS.data}</svg>`;

function slashKindLabel(item: Pick<SlashItem, "kind">) {
  const source = sources().find(source => source.id === item.kind);
  return source?.menuLabel || source?.label || item.kind;
}

function slashKindClass(item: Pick<SlashItem, "kind">) {
  return sources().find(source => source.id === item.kind)?.className || "";
}

function renderSlashMenu() {
  if (!slashMenuState.open) {
    menu.classList.add("hidden");
    menu.innerHTML = "";
    return;
  }
  menu.classList.remove("hidden");
  if (!slashMenuState.items.length) {
    menu.innerHTML = `<div class="slash-empty">${escapeHtml(getSlashEmptyText(slashMenuState.filter))}</div>`;
    return;
  }
  menu.innerHTML = `${slashMenuState.items.map((item, index) => slashMenuState.mention ? `
    <button class="qz-menu-item slash-item slash-tab ${index === slashMenuState.selected ? "active" : ""}" type="button" data-slash-index="${index}">
      ${item.icon ? `<img class="slash-tab-icon" src="${escapeHtmlAttribute(item.icon)}" alt="">` : `<span class="slash-tab-icon"></span>`}
      <span class="slash-title">${escapeHtml(item.title)}</span>
    </button>` : `
    ${item.run ? (slashMenuState.items[index - 1]?.run ? "" : `<div class="composer-menu-sep" role="separator"></div>`)
      : !index || item.kind !== slashMenuState.items[index - 1].kind ? `<div class="slash-group" role="presentation">${escapeHtml(slashKindLabel(item))}</div>` : ""}
    <button class="qz-menu-item slash-item ${index === slashMenuState.selected ? "active" : ""}" type="button" data-slash-index="${index}">
      <span class="slash-icon ${escapeHtmlAttribute(slashKindClass(item))}">${slashIcon(item.run ? "add" : item.kind)}</span>
      <span class="slash-main">
        <span class="slash-title">${escapeHtml(item.title)}</span>
        ${item.subtitle ? `<span class="slash-subtitle">${escapeHtml(item.subtitle)}</span>` : ""}
      </span>
      <span class="slash-meta">${escapeHtml(item.meta)}</span>
    </button>
  `).join("")}`;
  menu.querySelector(".slash-item.active")?.scrollIntoView({ block: "nearest" });
}

function selectSlashItem(index: number) {
  const item = slashMenuState.items[index];
  if (!item) return;
  if (slashMenuState.mention) {
    if (!mentions.some(mention => mention.name === item.name)) mentions.push(item);
    renderMentions();
    input.value = input.value.slice(0, slashMenuState.start) + input.value.slice(slashMenuState.end).replace(/^ /, "");
    input.setSelectionRange(slashMenuState.start, slashMenuState.start);
    closeSlashMenu();
    onInputChanged();
    input.focus();
    return;
  }
  if (item.run) {
    input.value = input.value.slice(0, slashMenuState.start) + input.value.slice(slashMenuState.end).replace(/^ /, "");
    closeSlashMenu();
    onInputChanged();
    item.run();
    return;
  }
  const token = item.token || (item.kind === "command" ? "" : `[${item.kind}: ${item.name}]`);
  if (!token) {
    closeSlashMenu();
    input.focus();
    return;
  }
  const before = input.value.slice(0, slashMenuState.start);
  const after = input.value.slice(slashMenuState.end);
  const needsSpace = item.kind === "command" || (after && !/^\s/.test(after)) ? " " : "";
  input.value = `${before}${token}${needsSpace}${after}`;
  const cursor = before.length + token.length + needsSpace.length;
  input.setSelectionRange(cursor, cursor);
  closeSlashMenu();
  onInputChanged();
  input.focus();
}

function closeSlashMenu() {
  slashResourcesSeq += 1;
  slashMenuState = createClosedMenuState();
  renderSlashMenu();
}

  menu.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null;
    const itemEl = target?.closest<HTMLElement>("[data-slash-index]");
    if (!itemEl) return;
    selectSlashItem(Number(itemEl.dataset.slashIndex));
  });
  document.addEventListener("click", (event) => {
    if (!slashMenuState.open) return;
    const target = event.target;
    if (target instanceof Node && target !== input && !menu.contains(target)) closeSlashMenu();
  });

  return {
    handleKeydown: handleSlashMenuKeydown,
    update: updateSlashMenu,
    refresh: refreshOpenSlashMenu,
    close: closeSlashMenu,
    isOpen: () => slashMenuState.open,
    mentionTokens: () => sharedItems().map(item => `[${item.kind}: ${item.name}]`).join(" "),
    clearMentions() { mentions = []; renderMentions(); },
    isTabShared: (item: SlashItem) => sharedItems().some(shared => tabKey(shared) === tabKey(item)),
    toggleTab(item: SlashItem) {
      const key = tabKey(item);
      if (sharedItems().some(shared => tabKey(shared) === key)) {
        if (currentTab && tabKey(currentTab) === key) { dismissedTab = key; currentTab = null; }
        mentions = mentions.filter(mention => tabKey(mention) !== key);
      } else mentions.push(item);
      if (sharedItems().length < 2) mentionsExpanded = false;
      renderMentions();
    },
    parseCommand: parseSlashCommandText,
    executeCommand: (command: NonNullable<ReturnType<typeof parseSlashCommandText>>) => onCommand(command),
  };
}

function createClosedMenuState() {
  return {
    open: false,
    start: -1,
    end: -1,
    query: "",
    filter: "all",
    selected: 0,
    allItems: [] as SlashItem[],
    items: [] as SlashItem[],
    commandEligible: false,
    mention: false,
  };
}
