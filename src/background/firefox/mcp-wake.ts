import { RECONNECT_ALARM } from "../../shared/reconnect-alarm.js";

/** Parent-API ping interval. Firefox's default event-page idle timeout is 30 seconds. */
export const FIREFOX_MCP_KEEPALIVE_MS = 10_000;

interface WakeHandlers {
  noteEnabled?(enabled: boolean): void;
  onAlarm?(): void;
  onSuspend?(): void;
}
interface WakeChrome {
  zuriFirefoxMcpWake?: boolean;
  zuriFirefoxMcpWakeInstalled?: boolean;
  zuriFirefoxMcpWakePending?: boolean;
  zuriFirefoxMcpWakeHandlers?: WakeHandlers;
  alarms?: { onAlarm?: { addListener(listener: (alarm: { name?: string }) => void): void } };
  runtime?: {
    getPlatformInfo?(callback?: () => void): unknown;
    onSuspend?: { addListener(listener: () => void): void };
  };
}

/** Arm the Firefox event-page keepalive and the MCP reconnect alarm listener. */
export function installFirefoxMcpWake(chromeApi: WakeChrome): void {
  chromeApi.zuriFirefoxMcpWake = true;
  if (chromeApi.zuriFirefoxMcpWakeInstalled) return;
  chromeApi.zuriFirefoxMcpWakeInstalled = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  const ping = () => {
    const ask = chromeApi.runtime?.getPlatformInfo;
    if (typeof ask !== "function") return;
    try {
      const pending = ask(() => {});
      if (pending && typeof (pending as Promise<unknown>).then === "function") {
        void (pending as Promise<unknown>).then(() => {}, () => {});
      }
    } catch { /* The reconnect alarm remains the wake path. */ }
  };
  const noteEnabled = (enabled: boolean) => {
    if (!enabled) {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
      console.info("[Zuri] firefox mcp keepalive stopped");
      return;
    }
    if (timer !== undefined) return;
    ping();
    timer = setInterval(ping, FIREFOX_MCP_KEEPALIVE_MS);
    unrefInterval(timer);
    console.info("[Zuri] firefox mcp keepalive armed");
  };
  chromeApi.zuriFirefoxMcpWakeHandlers = { ...chromeApi.zuriFirefoxMcpWakeHandlers, noteEnabled };
  chromeApi.alarms?.onAlarm?.addListener(alarm => {
    if (alarm?.name !== RECONNECT_ALARM) return;
    const handle = chromeApi.zuriFirefoxMcpWakeHandlers?.onAlarm;
    if (handle) {
      handle();
      return;
    }
    chromeApi.zuriFirefoxMcpWakePending = true;
  });
  chromeApi.runtime?.onSuspend?.addListener(() => {
    try { chromeApi.zuriFirefoxMcpWakeHandlers?.onSuspend?.(); }
    catch { /* Suspension still proceeds. */ }
  });
}

function unrefInterval(timer: ReturnType<typeof setInterval>) {
  const candidate = timer as { unref?: () => void };
  if (typeof candidate.unref === "function") candidate.unref();
}
