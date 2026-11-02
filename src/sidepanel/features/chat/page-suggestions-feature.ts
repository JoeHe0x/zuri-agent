import { getLanguage } from "../../../shared/i18n/index.js";
import { t } from "../../i18n/index.js";
import type { WorkspaceExtensions } from "../app/workspace-extensions.js";

type Key = Parameters<typeof t>[0];

const GENERIC: Key[] = ["suggestSummarizePage", "suggestKeyPoints", "suggestAskPage"];
const WEEE_PRODUCT: Key[] = ["suggestWeeeRecipe", "suggestWeeeSimilar", "suggestAskPage"];
const BY_HOST: [RegExp, Key[]][] = [
  [/^(www\.)?sayweee\.com$|^(www\.)?weee\.com$/, ["suggestWeeeDeals", "suggestWeeeFind", "suggestAskPage"]],
  [/^(mail\.google\.com|outlook\.(live|office)\.com)$/, ["suggestMailRecent", "suggestMailDraft", "suggestAskPage"]],
  [/(^|\.)(youtube\.com|bilibili\.com)$/, ["suggestVideoSummary", "suggestKeyPoints", "suggestAskPage"]],
  [/^github\.com$/, ["suggestRepoExplain", "suggestSummarizePage", "suggestAskPage"]],
];

export function pageSuggestionKeys(url: string): Key[] {
  try {
    const { hostname, pathname } = new URL(url);
    if (/^(www\.)?weee\.com$/.test(hostname) && /\/product\//.test(pathname)) return WEEE_PRODUCT;
    return BY_HOST.find(([pattern]) => pattern.test(hostname))?.[1] || GENERIC;
  } catch {
    return GENERIC;
  }
}

/** Shows page-aware prompt chips above the composer while the chat is on the landing screen. */
export function createPageSuggestionsFeature(options: {
  root: HTMLElement; messagesEl: HTMLElement; extensions: Pick<WorkspaceExtensions, "listReferences">;
  submit(text: string): unknown;
  request(type: string, payload: Record<string, unknown>, timeout: number): Promise<Record<string, any>>;
}) {
  const { root, messagesEl, extensions } = options;
  const list = document.createElement("div");
  list.className = "page-suggestion-list";
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "page-suggestion-reload";
  reload.textContent = t("suggestRefresh");
  root.append(list, reload);
  root.hidden = true;

  let keys: Key[] = [];
  let generated: string[] = [];
  let page: { key: string; tabId: number } | null = null;
  let seq = 0;
  let renderSeq = 0;
  // Per-URL model results; storing the promise also merges the url and complete tab events into one request.
  const results = new Map<string, Promise<string[]>>();
  const dismissed = new Map<string, Set<string>>();
  const hidden = () => (page && dismissed.get(page.key)) || new Set<string>();
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function render() {
    const landing = messagesEl.dataset.chatState === "landing";
    root.hidden = !landing || !page;
    const texts = landing ? (generated.length ? generated : keys.map(key => t(key))).filter(text => !hidden().has(text)) : [];
    const shown = [...list.children].map(child => child.firstElementChild?.textContent);
    if (texts.length === shown.length && texts.every((text, index) => text === shown[index])) return;
    const current = ++renderSeq;
    const swap = () => {
      if (current !== renderSeq) return;
      list.classList.remove("is-leaving");
      list.replaceChildren(...texts.map((text, index) => {
        const chip = document.createElement("div");
        chip.className = "page-suggestion";
        chip.style.setProperty("--i", String(index));
        const ask = document.createElement("button");
        ask.type = "button";
        ask.className = "page-suggestion-text";
        ask.textContent = text;
        ask.addEventListener("click", () => options.submit(text));
        const close = document.createElement("button");
        close.type = "button";
        close.className = "page-suggestion-dismiss";
        close.textContent = "×";
        close.setAttribute("aria-label", t("suggestDismiss"));
        close.addEventListener("click", () => {
          if (!page) return;
          dismissed.set(page.key, new Set([...hidden(), text]));
          chip.classList.add("is-removing");
          setTimeout(() => { chip.remove(); render(); }, reducedMotion() ? 0 : 150);
        });
        chip.append(ask, close);
        return chip;
      }));
    };
    // Old chips fade out before the new ones stagger in; hiding and first display swap at once.
    if (shown.length && texts.length && !reducedMotion()) {
      list.classList.add("is-leaving");
      setTimeout(swap, 150);
    } else swap();
  }

  function request(tabId: number, exclude: string[] = []) {
    return options.request("page_suggestions", { tabId, exclude }, 30000)
      .then(reply => (Array.isArray(reply?.suggestions) ? reply.suggestions : []).filter((item: unknown) => typeof item === "string") as string[])
      .catch(() => [] as string[]);
  }

  function generate({ key, tabId }: { key: string; tabId: number }) {
    let result = results.get(key);
    if (!result) {
      result = request(tabId);
      results.set(key, result);
      // Failed or empty results are not remembered, so the next visit retries.
      void result.then(items => { if (!items.length) results.delete(key); });
      if (results.size > 50) results.delete(results.keys().next().value!);
    }
    return result;
  }

  async function refresh() {
    const current = ++seq;
    const tab = (await extensions.listReferences()).find(item => item.kind === "tab" && item.current);
    if (current !== seq) return;
    keys = tab ? pageSuggestionKeys(tab.subtitle) : [];
    generated = [];
    page = null;
    render();
    const [active] = tab ? await chrome.tabs.query({ active: true, currentWindow: true }) : [];
    if (!tab || !active?.id || current !== seq) return;
    page = { key: `${getLanguage()}\n${tab.subtitle}`, tabId: active.id };
    render();
    // Rules above show at once; the model's page-specific suggestions replace them when ready.
    const items = await generate(page);
    if (current !== seq) return;
    generated = items;
    render();
  }

  reload.addEventListener("click", async () => {
    if (!page || reload.disabled) return;
    const target = page;
    const current = seq;
    // The model avoids everything already shown or dismissed on this page.
    const avoid = [...list.querySelectorAll(".page-suggestion-text")].map(el => el.textContent || "").concat([...hidden()]);
    reload.disabled = true;
    const items = (await request(target.tabId, avoid)).filter(text => !avoid.includes(text));
    reload.disabled = false;
    if (current !== seq || !items.length) return;
    results.set(target.key, Promise.resolve(items));
    dismissed.delete(target.key);
    generated = items;
    render();
  });

  new MutationObserver(render).observe(messagesEl, { attributes: true, attributeFilter: ["data-chat-state"] });
  if (typeof chrome !== "undefined" && chrome.tabs?.onActivated) {
    const run = () => void refresh().catch(() => {});
    chrome.tabs.onActivated.addListener(run);
    chrome.tabs.onUpdated.addListener((_id, change) => { if (change.url || change.status === "complete") run(); });
  }
  void refresh().catch(() => {});
}
