import { t } from "./i18n.js";
import type { UiExtensionAPI } from "#sdk/sidepanel";

/** `@` in the composer lists the window's tabs; the token carries the tabId for the agent. */
export default function (qz: UiExtensionAPI) {
  qz.extensions.register({
    references: [{
      id: "tab", label: t("tab", { tabId: "" }).trim(), menuLabel: t("tabs"), filterLabel: "tab", className: "tab", order: 5,
      emptyText: t("noMatchingTabs"),
      async list(signal) {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        signal.throwIfAborted();
        return tabs.filter(tab => Number(tab.id) > 0).map(tab => {
          const title = (tab.title || tab.url || String(tab.id)).replace(/[[\]]/g, "").slice(0, 60);
          const origin = /^https?:/.test(tab.url || "") ? new URL(tab.url!).origin : "";
          return {
            kind: "tab", name: `${title} #${tab.id}${origin ? ` ${origin}` : ""}`, label: title, title, subtitle: tab.url || "",
            meta: `#${tab.id}`, icon: tab.favIconUrl, current: tab.active && Boolean(origin), priority: tab.active ? 0 : 1,
            search: `${tab.title || ""} ${tab.url || ""} ${tab.id}`.toLowerCase(),
          };
        });
      },
    }],
  });
}
