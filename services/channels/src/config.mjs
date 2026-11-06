import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CHANNELS_DIR = join(homedir(), ".zuri-agent", "channels");

const DEFAULTS = { bridge: { url: "http://127.0.0.1:18765/mcp", clientId: "" }, waitTimeoutSeconds: 600, channels: {} };

export function loadConfig(path = join(CHANNELS_DIR, "channels.json")) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}. See docs/channels.md.`);
  const file = JSON.parse(readFileSync(path, "utf8"));
  return { ...DEFAULTS, ...file, bridge: { ...DEFAULTS.bridge, ...file.bridge } };
}
