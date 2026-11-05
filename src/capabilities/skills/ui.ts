import { t } from "./i18n.js";
import type { UiExtensionAPI } from "#sdk/sidepanel";
import { createSkillsFeature } from "./workspace/skills-feature.js";
import { createSkillReferences } from "./references.js";

export default function (zuri: UiExtensionAPI) {
  const skills = createSkillsFeature({
    root: zuri.root, signal: zuri.signal, request: zuri.request, send: zuri.send,
    isActive: () => zuri.getCurrentPage() === "skills",
    getCurrentSessionId: zuri.getCurrentSessionId,
    getSessionRuntime: id => zuri.sessions.getRuntime(id || ""),
    updateSessionRuntime: zuri.sessions.updateRuntime,
    isCurrentSession: id => zuri.getCurrentSessionId() === id,
    renderMarkdown: zuri.presentation.renderMarkdown,
    clearMathTypeset: zuri.presentation.clearMath,
    scheduleMathTypeset: zuri.presentation.scheduleMath,
    highlightSearchText: zuri.presentation.highlightSearchText,
    confirm: zuri.dialogs.confirm, choose: zuri.dialogs.choose,
    showToast: zuri.showToast, hideToast: zuri.hideToast,
    onStableViewChange: zuri.notifyViewChange,
  });
  zuri.onDispose(skills.dispose);
  zuri.extensions.register({
    commands: [{ id: "open-skills", composerLabel: t("manageSkills"),
      composerIcon: '<path d="M15 12h-5M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>', run: () => zuri.navigate("skills", { userInitiated: true }) }],
    references: [createSkillReferences(skills.list, () => skills.resolveCurrentSiteUrls({ fresh: false }), () => zuri.navigate("skills", { userInitiated: true }))],
  });
  zuri.on("plugin_registry_update", async () => {
    if (zuri.getCurrentPage() !== "skills") return;
    try { await skills.refresh(); }
    catch (error) {
      if (!zuri.signal.aborted) console.debug("[Zuri] refresh skills after registry update failed:", error instanceof Error ? error.message : error);
    }
  });
  zuri.registerPage({
      id: "skills", title: t("skills"), order: 40, navigation: false, elements: [skills.panel],
      activate: () => skills.activate(), deactivate: skills.deactivate,
      capture: () => ({ skill: skills.getCurrentSkill() }),
      restore: state => skills.restore(state && typeof state === "object" && "skill" in state ? String(state.skill || "") || null : null),
  });
  zuri.registerOverlay({
      id: "skills", priority: 30,
      close: () => zuri.getCurrentPage() === "skills" && skills.closeTopmostTransientUi(),
      blocksFocus: () => false,
  });
}
