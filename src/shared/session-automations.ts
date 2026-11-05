/** Firefox boot sets this on `chrome` before the shared graph runs. Absent means enabled. */
export interface SessionAutomationHost {
  zuriSessionAutomationsEnabled?: boolean;
}

/** Create, edit, and run controls. The Firefox sidebar omits these; Chrome keeps them. */
export const SESSION_AUTOMATION_CONTROL_SELECTORS = [
  '[data-sessions-mode="automation"]',
  "#btn-new-automation",
  "#automations-panel",
] as const;

export function sessionAutomationsEnabled(chromeApi?: SessionAutomationHost | null): boolean {
  const browser = chromeApi === undefined
    ? (globalThis as { chrome?: SessionAutomationHost }).chrome
    : chromeApi;
  return browser?.zuriSessionAutomationsEnabled !== false;
}

export function disableSessionAutomations(chromeApi: SessionAutomationHost): void {
  chromeApi.zuriSessionAutomationsEnabled = false;
}
