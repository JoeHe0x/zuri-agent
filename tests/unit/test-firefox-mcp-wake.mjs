import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AUTOMATION_SCHEDULER_ALARM } from "../../src/background/automation/runtime.ts";
import { installFirefoxHost } from "../../src/background/firefox/host.ts";
import { FIREFOX_MCP_KEEPALIVE_MS, installFirefoxMcpWake } from "../../src/background/firefox/mcp-wake.ts";
import { RECONNECT_ALARM } from "../../src/background/mcp/mcp-bridge.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

test("the firefox keepalive pings from the event page and leaves session automations disabled", () => {
  const pings = [];
  const alarmListeners = [];
  const suspendListeners = [];
  const intervals = [];
  const browser = {
    zuriSessionAutomationsEnabled: false,
    alarms: {
      create() { throw new Error("keepalive must not create an alarm"); },
      onAlarm: { addListener(fn) { alarmListeners.push(fn); } },
    },
    runtime: {
      getPlatformInfo(callback) {
        pings.push(callback);
        return Promise.resolve({ os: "mac", arch: "arm" });
      },
      onSuspend: { addListener(fn) { suspendListeners.push(fn); } },
    },
  };
  const originalSet = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  globalThis.setInterval = (fn, ms) => {
    intervals.push({ fn, ms, cleared: false });
    return intervals.length;
  };
  globalThis.clearInterval = id => {
    intervals[id - 1].cleared = true;
  };
  try {
    installFirefoxMcpWake(browser);
    installFirefoxMcpWake(browser);
    assert.equal(browser.zuriFirefoxMcpWake, true);
    assert.equal(browser.zuriSessionAutomationsEnabled, false);
    assert.equal(alarmListeners.length, 1);
    assert.equal(suspendListeners.length, 1);
    assert.equal(pings.length, 0);
    assert.equal(intervals.length, 0);

    browser.zuriFirefoxMcpWakeHandlers.noteEnabled(false);
    browser.zuriFirefoxMcpWakeHandlers.noteEnabled(true);
    browser.zuriFirefoxMcpWakeHandlers.noteEnabled(true);
    assert.equal(pings.length, 1);
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].ms, FIREFOX_MCP_KEEPALIVE_MS);
    assert.equal(FIREFOX_MCP_KEEPALIVE_MS, 10_000);
    intervals[0].fn();
    assert.equal(pings.length, 2);

    alarmListeners[0]({ name: AUTOMATION_SCHEDULER_ALARM });
    assert.equal(browser.zuriFirefoxMcpWakePending, undefined);
    alarmListeners[0]({ name: RECONNECT_ALARM });
    assert.equal(browser.zuriFirefoxMcpWakePending, true);
    let woke = 0;
    let suspended = 0;
    browser.zuriFirefoxMcpWakePending = false;
    browser.zuriFirefoxMcpWakeHandlers.onAlarm = () => { woke += 1; };
    browser.zuriFirefoxMcpWakeHandlers.onSuspend = () => { suspended += 1; };
    alarmListeners[0]({ name: RECONNECT_ALARM });
    suspendListeners[0]();
    assert.equal(woke, 1);
    assert.equal(suspended, 1);
    assert.equal(browser.zuriFirefoxMcpWakePending, false);

    browser.zuriFirefoxMcpWakeHandlers.noteEnabled(false);
    browser.zuriFirefoxMcpWakeHandlers.noteEnabled(false);
    assert.equal(intervals[0].cleared, true);
    assert.equal(intervals.length, 1);
  } finally {
    globalThis.setInterval = originalSet;
    globalThis.clearInterval = originalClear;
  }
});

test("the firefox host arms mcp wake without arming session automations", async () => {
  const created = [];
  const listeners = [];
  const browser = {
    alarms: {
      create(name, info) { created.push({ name, info }); return Promise.resolve(); },
      clear() { return Promise.resolve(true); },
      onAlarm: { addListener(fn) { listeners.push(fn); } },
    },
    runtime: {
      id: "zuri-agent@heleifz.github.io",
      getURL: path => `moz-extension://uuid/${path}`,
      getPlatformInfo() { return Promise.resolve({ os: "mac" }); },
    },
  };
  installFirefoxHost(browser);
  assert.equal(browser.zuriSessionAutomationsEnabled, false);
  assert.equal(browser.zuriFirefoxMcpWake, true);
  assert.equal(listeners.length, 1);
  await browser.alarms.create(AUTOMATION_SCHEDULER_ALARM, { periodInMinutes: 1 });
  await browser.alarms.create(RECONNECT_ALARM, { periodInMinutes: 0.5 });
  assert.deepEqual(created, [{ name: RECONNECT_ALARM, info: { periodInMinutes: 0.5 } }]);
  listeners[0]({ name: RECONNECT_ALARM });
  assert.equal(browser.zuriFirefoxMcpWakePending, true);
});

test("chrome service worker does not import the firefox mcp wake", () => {
  const worker = readFileSync(join(repoRoot, "src/background/service-worker.ts"), "utf8");
  const wake = readFileSync(join(repoRoot, "src/background/firefox/mcp-wake.ts"), "utf8");
  assert.equal(worker.includes("zuriFirefoxMcpWake"), false);
  assert.equal(worker.includes("mcp-wake"), false);
  assert.match(worker, /offscreenKeepalive/);
  assert.equal(wake.includes(AUTOMATION_SCHEDULER_ALARM), false);
  assert.equal(wake.includes("Runtime.disable"), false);
  assert.match(wake, /getPlatformInfo/);
  assert.equal(wake.includes("mcp-bridge"), false);
  assert.match(wake, /import \{ RECONNECT_ALARM \} from "\.\.\/\.\.\/shared\/reconnect-alarm\.js"/);
  assert.match(wake, /alarm\?\.name !== RECONNECT_ALARM/);
  const automations = readFileSync(join(repoRoot, "src/background/firefox/session-automations.ts"), "utf8");
  assert.equal(automations.includes("automation/runtime"), false);
  assert.match(automations, /import \{ AUTOMATION_SCHEDULER_ALARM \} from "\.\.\/\.\.\/shared\/automation-scheduler-alarm\.js"/);
  assert.match(automations, /from "\.\.\/\.\.\/shared\/session-automations\.js"/);
});
