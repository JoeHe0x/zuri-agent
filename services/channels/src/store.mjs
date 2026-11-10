import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const VERSION = 1;

/** conversation key -> { sessionId, updatedAt }. The Background service owns task state. */
export function openStore(path) {
  let conversations = {};
  if (existsSync(path)) {
    try {
      const file = JSON.parse(readFileSync(path, "utf8"));
      if (file.version === VERSION) conversations = file.conversations;
    } catch { /* A corrupt file starts empty; its tasks stay in the browser. */ }
  }
  const save = () => {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp`;
    writeFileSync(temp, JSON.stringify({ version: VERSION, conversations }), { mode: 0o600 });
    renameSync(temp, path);
  };
  return {
    get: key => conversations[key],
    set(key, sessionId) { conversations[key] = { sessionId, updatedAt: Date.now() }; save(); },
    delete(key) { delete conversations[key]; save(); },
  };
}
