import { t } from "./i18n.js";
import type { UiExtensionAPI } from "#sdk/sidepanel";
import { createDataFeature } from "./workspace/data-feature.js";
import { createDataReferences } from "./references.js";

export default function (zuri: UiExtensionAPI) {
  const data = createDataFeature({
    root: zuri.root, signal: zuri.signal,
    isActive: () => zuri.getCurrentPage() === "data",
    onStableViewChange: zuri.notifyViewChange,
    startTrace: (name, detail) => zuri.performance.start(name, detail) || (() => {}),
    gridTrace: zuri.performance.grid,
    confirm: zuri.dialogs.confirm, requestText: zuri.dialogs.requestText,
    showToast: zuri.showToast, hideToast: zuri.hideToast,
    showArtifactToast: message => zuri.showToast(message),
    beforeOpenArtifactTable: () => { zuri.extensions.invoke("sessions.closeArtifacts"); },
  });
  zuri.onDispose(data.dispose);
  zuri.extensions.register({
    references: [createDataReferences(data.listTables, data.formatTableDate)],
    commands: [{ id: "open-data", run: () => zuri.navigate("data", { userInitiated: true }) }, { id: "data.openTable", run: payload => {
      const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      return data.openArtifactTable(String(value.table || ""), {
        anchorEl: value.anchorEl instanceof HTMLElement ? value.anchorEl : null,
      });
    } }],
  });
  zuri.on("data_changed", () => data.invalidate());
  zuri.registerPage({
      id: "data", title: t("data"), order: 30, navigation: false, elements: [data.panel],
      activate: () => { data.leaveSheet(); return data.activate(); }, deactivate: data.deactivate,
      capture: () => ({ table: data.getCurrentTable() }),
      restore: state => {
        // Restore the destination before reveal; loading a table must not hold workspace startup.
        void data.restore(state && typeof state === "object" && "table" in state ? String(state.table || "") || null : null)
          .catch(error => { if (!zuri.signal.aborted) console.debug("[Zuri] restore data table failed:", error); });
      },
  });
  zuri.registerOverlay({ id: "data", priority: 40, close: data.closeTopmostTransientUi, blocksFocus: data.hasBlockingOverlay });
}
