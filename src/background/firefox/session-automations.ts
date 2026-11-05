import { AUTOMATION_SCHEDULER_ALARM } from "../../shared/automation-scheduler-alarm.js";
import { disableSessionAutomations, type SessionAutomationHost } from "../../shared/session-automations.js";

interface FirefoxAlarmHost extends SessionAutomationHost {
  alarms?: {
    create?: (name: string, info?: chrome.alarms.AlarmCreateInfo) => Promise<void> | void;
    clear?: (name?: string) => Promise<boolean> | boolean;
    zuriSessionAutomationAlarmBlocked?: boolean;
  };
}

/** Drop the session-automation alarm. MCP reconnect alarms keep their own name. */
export function disableFirefoxSessionAutomations(chromeApi: FirefoxAlarmHost): void {
  disableSessionAutomations(chromeApi);
  const alarms = chromeApi.alarms;
  if (alarms && !alarms.zuriSessionAutomationAlarmBlocked && typeof alarms.create === "function") {
    alarms.zuriSessionAutomationAlarmBlocked = true;
    const create = alarms.create.bind(alarms);
    alarms.create = (name, info) => {
      if (name === AUTOMATION_SCHEDULER_ALARM) return Promise.resolve();
      return create(name, info);
    };
  }
  const cleared = alarms?.clear?.(AUTOMATION_SCHEDULER_ALARM);
  if (cleared && typeof (cleared as Promise<boolean>).catch === "function") {
    void (cleared as Promise<boolean>).catch(() => {});
  }
  console.info("[Zuri] firefox session automations disabled");
}
