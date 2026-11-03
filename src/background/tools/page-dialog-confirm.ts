import type { ToolRuntimeDependencies } from "../../sdk/background/services.js";
import { withLanguage, getLanguage } from "../../shared/i18n/index.js";
import { pageDialogT } from "../../shared/page-dialog.js";

/** A page's confirm/prompt dialog is the user's decision: Continue accepts it, Cancel dismisses it. */
export async function confirmPageDialog(
  { sessionId, runId, message }: { tabId: number; sessionId: string; runId: string; message: string },
  { sessions, emit }: ToolRuntimeDependencies,
): Promise<boolean> {
  if (!sessionId || !runId || typeof sessions?.beginUserWait !== "function" || typeof emit !== "function") return false;
  if (sessions.isWaitingForUser?.(sessionId)) return false;
  const waitId = `page_dialog_${crypto.randomUUID()}`;
  const pending = sessions.beginUserWait(sessionId, {
    waitId, runId,
    onSettled: reason => emit({ type: "user_wait_resolved", sessionId, runId, waitId, reason }),
  });
  emit({
    type: "waiting_for_user", sessionId, runId, waitId, message,
    form: { title: withLanguage(getLanguage(), () => pageDialogT("title")) },
  });
  try {
    await pending;
    return true;
  } catch {
    return false;
  }
}
