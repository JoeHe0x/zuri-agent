import { t } from "./i18n.js";
import type { UiExtensionAPI } from "#sdk/sidepanel";
import { createSkillsFeature } from "./workspace/skills-feature.js";
import { createSkillReferences } from "./references.js";

export default function (qz: UiExtensionAPI) {
  const skills = createSkillsFeature({
    root: qz.root, signal: qz.signal, request: qz.request, send: qz.send,
    isActive: () => qz.getCurrentPage() === "skills",
    getCurrentSessionId: qz.getCurrentSessionId,
    getSessionRuntime: id => qz.sessions.getRuntime(id || ""),
    updateSessionRuntime: qz.sessions.updateRuntime,
    isCurrentSession: id => qz.getCurrentSessionId() === id,
    renderMarkdown: qz.presentation.renderMarkdown,
    clearMathTypeset: qz.presentation.clearMath,
    scheduleMathTypeset: qz.presentation.scheduleMath,
    highlightSearchText: qz.presentation.highlightSearchText,
    confirm: qz.dialogs.confirm, choose: qz.dialogs.choose,
    showToast: qz.showToast, hideToast: qz.hideToast,
    onStableViewChange: qz.notifyViewChange,
  });
  qz.onDispose(skills.dispose);
  qz.extensions.register({
    commands: [{ id: "open-skills", composerLabel: t("manageSkills"),
      composerIcon: '<path d="M15 12h-5M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>', run: () => qz.navigate("skills", { userInitiated: true }) }],
    references: [createSkillReferences(skills.list, () => skills.resolveCurrentSiteUrls({ fresh: false }), () => qz.navigate("skills", { userInitiated: true }))],
  });
  qz.on("plugin_registry_update", async () => {
    if (qz.getCurrentPage() !== "skills") return;
    try { await skills.refresh(); }
    catch (error) {
      if (!qz.signal.aborted) console.debug("[轻舟] refresh skills after registry update failed:", error instanceof Error ? error.message : error);
    }
  });
  qz.registerPage({
      id: "skills", title: t("skills"), order: 40, navigation: false, elements: [skills.panel],
      activate: () => skills.activate(), deactivate: skills.deactivate,
      capture: () => ({ skill: skills.getCurrentSkill() }),
      restore: state => skills.restore(state && typeof state === "object" && "skill" in state ? String(state.skill || "") || null : null),
  });
  qz.registerOverlay({
      id: "skills", priority: 30,
      close: () => qz.getCurrentPage() === "skills" && skills.closeTopmostTransientUi(),
      blocksFocus: () => false,
  });
}
