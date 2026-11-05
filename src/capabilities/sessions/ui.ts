import { t } from "./i18n.js";
import { sessionAutomationsEnabled } from "#sdk/shared/session-automations";
import type { UiExtensionAPI } from "#sdk/sidepanel";
import { isSessionRuntimeActive, trackerModeTitle, trackerModeUnit } from "#sdk/sidepanel/sessions";
import { goalStatusClass } from "#sdk/sidepanel/sessions";
import { clipText, formatLiveElapsedMs } from "#sdk/sidepanel/sessions";
import { record } from "#sdk/sidepanel/presentation";
import { createSessionsFeature } from "./sessions-feature.js";
import { createArtifactsFeature } from "./artifacts/artifacts-feature.js";
import { removeSessionAutomationControls } from "./automations/availability.js";
import { createAutomationsFeature } from "./automations/automations-feature.js";

/** Task lists, scheduled tasks and their result index share one package owner.
 * Opening a result table is an optional command supplied by the Data capability. */
export default function (zuri: UiExtensionAPI) {
  let sessions: ReturnType<typeof createSessionsFeature>;
  let automations: ReturnType<typeof createAutomationsFeature>;
  const automationsEnabled = sessionAutomationsEnabled();
  if (!automationsEnabled) removeSessionAutomationControls(zuri.root);
  const active = () => !zuri.signal.aborted && zuri.getCurrentPage() === "sessions";
  const current = (id: string) => zuri.getCurrentSessionId() === id;
  const chatActive = () => zuri.getCurrentPage() === "chat";
  const request: typeof zuri.request = async (...args) => {
    zuri.signal.throwIfAborted();
    const result = await zuri.request(...args);
    zuri.signal.throwIfAborted();
    return result;
  };
  const artifacts = createArtifactsFeature({
    root: zuri.root, signal: zuri.signal, request, send: zuri.send, sessionState: zuri.sessions,
    getTranscript: zuri.sessions.getTranscript, hasTranscript: zuri.sessions.hasTranscript,
    getRuntime: zuri.sessions.getRuntime, isRuntimeRunning: isSessionRuntimeActive,
    isCurrentSession: current, isCurrentRunActive: () => zuri.getRunContext().runStatus !== "idle",
    isChatActive: chatActive, isSessionsActive: active,
    isManualSessionsMode: () => sessions?.getMode() === "manual",
    isAutomationSessionsMode: () => sessions?.getMode() === "automation",
    isDeletedSession: zuri.sessions.isDeleted, getCurrentSessionId: zuri.getCurrentSessionId,
    getCurrentSessionTitle: () => zuri.root.querySelector("#current-session-title")?.textContent || "",
    renderChat: zuri.chat.refresh, scheduleTranscriptRender: zuri.chat.scheduleRender,
    scheduleSessionsRefresh: input => sessions?.scheduleRefresh(input),
    scheduleAutomationsRefresh: input => automations?.scheduleRefresh(input),
    clearTranscriptInlineActions: zuri.chat.clearInlineActions, showToast: zuri.showToast,
    appendSystemNote: zuri.chat.appendNote,
    openTable: (table, input) => {
      if (!zuri.extensions.hasCommand("data.openTable")) {
        zuri.showToast(t("theDataTableUiCapabilityIsNotInstalled"), { tone: "error" });
        return;
      }
      return zuri.extensions.invoke("data.openTable", { table, ...input });
    },
  });
  sessions = createSessionsFeature({
    root: zuri.root, signal: zuri.signal, onStableViewChange: zuri.notifyViewChange,
    automationsEnabled,
    request, send: zuri.send, sessionState: zuri.sessions, artifactsFeature: artifacts,
    sessionExportFeature: { exportSession: zuri.sessions.export, isPreparing: zuri.sessions.isExporting },
    getRuntime: zuri.sessions.getRuntime, isRuntimeRunning: isSessionRuntimeActive,
    goalStatusClass, trackerModeTitle, trackerModeUnit, formatLiveElapsedMs, clipText,
    cssEscapeValue: value => CSS.escape(String(value || "")),
    getCurrentSessionId: zuri.getCurrentSessionId, isCurrentSession: current,
    isActive: active, isChatActive: chatActive, isDeletedSession: zuri.sessions.isDeleted,
    isGoalClearPending: zuri.chat.isGoalClearPending, switchToSession: zuri.sessions.open,
    scheduleAutomationsRefresh: input => automations?.scheduleRefresh(input),
    setAutomationsVisible: visible => automations?.setVisible(visible),
    closeAutomationsEditor: () => automations?.closeEditor(),
    showToast: zuri.showToast, flashAction: zuri.chat.flashAction, syncKeepAlive: zuri.syncKeepAlive,
    renderCurrentGoalStrip: zuri.chat.renderGoal, liveElapsedTickMs: 100,
  });
  automations = automationsEnabled ? createAutomationsFeature({
    root: zuri.root, signal: zuri.signal, request,
    isActive: () => active() && sessions.getMode() === "automation",
    syncModeUi: sessions.syncModeUi, getSearchQuery: sessions.getSearchQuery,
    appendSystemNote: zuri.chat.appendNote, switchToSession: zuri.sessions.open,
    prepareListRemovalLayer: sessions.prepareRemovalLayer, shouldReduceMotion: sessions.shouldReduceMotion,
    morphListHtml: sessions.morphListHtml, listItemKey: sessions.listItemKey,
    scheduleArtifactHydration: artifacts.scheduleListHydration, getArtifactSummary: artifacts.getSessionSummary,
    artifactPreviewText: artifacts.previewText, artifactCompactItems: artifacts.compactItems,
    artifactMetaWithTime: artifacts.model.artifactMetaWithTime, artifactTypeLabel: artifacts.typeLabel,
    canOpenDataArtifact: artifacts.canOpenData, canOpenFileArtifact: artifacts.canOpenFile,
    dataArtifactActionAttributes: artifacts.dataActionAttributes, fileArtifactActionAttributes: artifacts.fileActionAttributes,
    artifactStatsText: artifacts.statsText, clipText, confirm: zuri.dialogs.confirm,
  }) : {
    panel: null,
    editor: null,
    setVisible() {},
    scheduleRefresh() {},
    async renderNow() {},
    openEditor() {},
    closeEditor() {},
    closeTopmostTransientUi() { return false; },
    reset() {},
  };
  zuri.extensions.register({
    commands: [
      { id: "sessions.closeArtifacts", run: () => artifacts.closePanel() },
      { id: "sessions.artifactToast", run: payload => {
        const input = record(payload);
        artifacts.showToast(String(input.message || ""), input.anchorEl instanceof HTMLElement ? input.anchorEl : null);
      } },
    ],
    transcript: [{ id: "artifacts", project: artifacts.projectTranscript,
      create: artifacts.createTranscriptElement, patch: artifacts.patchTranscriptElement,
      retire: artifacts.retireTranscriptElement, preview: entry => artifacts.previewText(record(entry.summary)) }],
  });
  zuri.on("*", event => {
    const id = String(event.sessionId || zuri.getCurrentSessionId() || "");
    if (event.type === "session_deleted") { artifacts.remove(id); sessions.remove(id); }
    if (event.type === "session_created" && record(event.session).id) sessions.markCreated(record(event.session));
    if (event.type === "session_imported_from_export") sessions.handleImported(event);
    if (event.type === "sessions_changed" || event.type === "session_created") sessions.scheduleRefresh();
    if (event.type === "automations_changed") automations.scheduleRefresh({ delay: 100 });
    if (event.type === "session_resources_changed") artifacts.handleResourcesChanged(id, { renderCurrent: current(id) });
    if (["agent_end", "aborted", "error"].includes(String(event.type))) artifacts.settleTerminal(id, { renderCurrent: current(id) });
    if (event.type === "reset") artifacts.releaseCardSuppression(id);
  });
  zuri.on("*", event => {
    const id = String(event.sessionId || zuri.getCurrentSessionId() || "");
    if (event.type === "ui_sessions_refresh") sessions.scheduleRefresh(event);
    if (event.type === "ui_session_terminal") artifacts.settleTerminal(id);
    if (event.type === "ui_chat_submitted") artifacts.suppressCard(id, String(event.clientMessageId || ""));
    if (event.type === "ui_transcript_replaced") artifacts.releaseCardSuppression(id);
    if (event.type === "ui_close_transient") { artifacts.closePanel(); automations.closeEditor(); }
    if (event.type === "ui_workspace_reset") { artifacts.reset(); sessions.reset(); automations.reset(); }
  });
  zuri.onDispose(() => { artifacts.reset(); sessions.reset(); automations.reset(); });
  zuri.extensions.register({
    commands: [{ id: "open-sessions", run: () => zuri.navigate("sessions", { userInitiated: true }) }],
  });
  zuri.registerPage({ id: "sessions", title: t("history"), order: 10, navigation: false, elements: [sessions.panel],
      activate: ({ refresh }) => { if (refresh) sessions.refresh({ requestFreshState: true }); },
      deactivate: sessions.clearInteractionHold,
      capture: () => ({ mode: sessions.getMode() }),
      restore: state => { sessions.setMode(record(state).mode === "automation" ? "automation" : "manual"); sessions.refresh({ requestFreshState: true }); },
  });
  zuri.registerOverlay({ id: "session-artifacts", priority: 60, close: () => {
        if (!artifacts.hasBlockingOverlay()) return false; artifacts.closePanel(); return true;
      }, blocksFocus: artifacts.hasBlockingOverlay });
  zuri.registerOverlay({ id: "session-automation-editor", priority: 50, close: automations.closeTopmostTransientUi,
    blocksFocus: () => Boolean(automations.editor && !automations.editor.classList.contains("hidden")) });
}
