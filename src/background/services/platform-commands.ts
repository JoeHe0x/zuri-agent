import { t } from "../../shared/i18n/backend.js";
import { listDataTables } from "../../shared/data-store.js";
import { isWebTab } from "../../shared/tab-utils.js";

interface PickedRect { x: number; y: number; width: number; height: number; viewportWidth: number }

interface PlatformCommandsOptions<Context> {
  sessionSupervisor: { size(): number };
  getBridgeConfig(): Promise<unknown>;
  tabs?: Pick<typeof chrome.tabs, "get">;
  sendToContent(tabId: number, action: string): Promise<unknown>;
  ensureSkillToolRegistryReady?(reason: string): Promise<unknown>;
  listSkillContributions(context: Context): unknown;
  buildSkillUiContext(sessionId: string): Context | Promise<Context>;
  commitSkillRegistryChange(reason: string, change: { skillName: string; previousSkillName: string }): Promise<unknown>;
}

export function createPlatformCommands<Context>({
  sessionSupervisor,
  getBridgeConfig,
  tabs = globalThis.chrome?.tabs,
  sendToContent,
  ensureSkillToolRegistryReady = async () => {},
  listSkillContributions,
  buildSkillUiContext,
  commitSkillRegistryChange,
}: PlatformCommandsOptions<Context>) {
  async function ping() {
    return {
      ok: true,
      pong: true,
      at: Date.now(),
      sessions: sessionSupervisor.size(),
      bridge: await getBridgeConfig(),
    };
  }

  async function runElementPicker(action: string, tabId: unknown) {
    const tab = await resolveElementPickerTab(tabId);
    const result = await sendToContent(tab.id!, action);
    const picked = result && typeof result === "object" ? result as { rect?: PickedRect | null } : null;
    const preview = picked?.rect ? await captureElementPreview(tab.windowId, picked.rect) : "";
    return {
      tabId: tab.id,
      ...(picked || { result }),
      preview,
    };
  }

  // The preview is best-effort; a failed capture leaves the text chip.
  async function captureElementPreview(windowId: number, rect: PickedRect) {
    try {
      await new Promise(resolve => setTimeout(resolve, 80)); // let the picker overlay disappear
      const image = await createImageBitmap(await (await fetch(await chrome.tabs.captureVisibleTab(windowId, { format: "png" }))).blob());
      const scale = image.width / rect.viewportWidth;
      const outScale = Math.min(1, 320 / (rect.width * scale), 240 / (rect.height * scale));
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(rect.width * scale * outScale)), Math.max(1, Math.round(rect.height * scale * outScale)));
      canvas.getContext("2d")!.drawImage(image, rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale, 0, 0, canvas.width, canvas.height);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 })).arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `data:image/jpeg;base64,${btoa(binary)}`;
    } catch (_error) {
      return "";
    }
  }

  function startElementPicker(tabId: unknown) {
    return runElementPicker("startElementPicker", tabId);
  }

  function confirmElementPicker(tabId: unknown) {
    return runElementPicker("confirmElementPicker", tabId);
  }

  function cancelElementPicker(tabId: unknown) {
    return runElementPicker("cancelElementPicker", tabId);
  }

  async function listTables() {
    return { tables: await listDataTables() };
  }

  async function contributions(sessionId = "") {
    try {
      await ensureSkillToolRegistryReady("platform_contributions");
    } catch (_error) {
      // Core UI remains available while optional Skill discovery retries later.
    }
    return listSkillContributions(await buildSkillUiContext(sessionId));
  }

  async function refreshSkills(params: Record<string, unknown> = {}) {
    const reason = String(params.reason || "background_api");
    const skillToolRegistry = await commitSkillRegistryChange(reason, {
      skillName: String(params.skillName || ""),
      previousSkillName: String(params.previousSkillName || ""),
    });
    return { skillToolRegistry };
  }

  async function resolveElementPickerTab(tabId: unknown) {
    const id = Number(tabId);
    if (!Number.isInteger(id) || id <= 0) throw new Error(t("browser.selectPage"));
    const tab = await tabs?.get(id);
    if (!tab?.id || !isWebTab(tab)) throw new Error(t("browser.cannotSelectElement"));
    return tab;
  }

  return Object.freeze({
    ping,
    startElementPicker,
    confirmElementPicker,
    cancelElementPicker,
    listTables,
    contributions,
    refreshSkills,
  });
}
