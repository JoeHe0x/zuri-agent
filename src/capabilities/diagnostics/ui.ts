import { t } from "./i18n.js";
import type { UiExtensionAPI } from "#sdk/sidepanel";
import { createLogsFeature } from "./workspace/logs-feature.js";

export default function (zuri: UiExtensionAPI) {
  const logs = createLogsFeature({
    root: zuri.root, signal: zuri.signal, send: zuri.send,
    isEnabled: zuri.isDebugEnabled,
    onClearLandingHistory: () => zuri.extensions.notify({ type: "ui_clear_landing_history" }),
  });
  zuri.onDispose(logs.dispose);
  zuri.on("trace", event => logs.render(Array.isArray(event.logs) ? event.logs : []));
  zuri.on("trace_cleared", () => logs.render([]));
  zuri.registerPage({
    id: "logs", title: t("logs"), order: 50, elements: [logs.panel],
    isEnabled: zuri.isDebugEnabled, activate: ({ refresh }) => { if (refresh) logs.load(); },
  });
}
