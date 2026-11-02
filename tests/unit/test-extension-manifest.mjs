import assert from "node:assert/strict";
import { createHash, createPublicKey } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { transformSync } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readText(relativePath) {
  const target = path.join(repoRoot, relativePath);
  const file = existsSync(target) ? target : target.replace(/\.js$/, ".ts");
  const source = readFileSync(file, "utf8");
  return file.endsWith(".ts") ? transformSync(source, { loader: "ts", charset: "utf8" }).code : source;
}

const manifest = JSON.parse(readText("src/manifest.json"));
const serviceWorker = readText("src/background/service-worker.js");
const appShellFeature = readText("src/sidepanel/features/app/app-shell-feature.ts");

assert.equal(manifest.manifest_version, 3);
const publicKey = Buffer.from(manifest.key, "base64");
assert.equal(createPublicKey({ key: publicKey, format: "der", type: "spki" }).asymmetricKeyType, "rsa");
const extensionId = createHash("sha256").update(publicKey).digest("hex").slice(0, 32)
  .replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
assert.equal(extensionId, "ghbaodmonhcgkfeejcpffknlggbjhjgj", "the published extension identity stays stable");
const removedAudioCapturePermission = ["tab", "Capture"].join("");
assert.ok(!manifest.permissions?.includes(removedAudioCapturePermission));
assert.ok(
  !(manifest.sandbox?.pages || []).some(page => /audio/i.test(String(page))),
  "Removed audio sandbox should not be registered.",
);
assert.deepEqual(
  manifest.sandbox?.pages,
  ["runner-sandbox.html"],
  "The only sandbox page should be the explicit inner run_script runner.",
);
assert.match(
  manifest.content_security_policy?.sandbox || "",
  /sandbox allow-scripts[\s\S]*worker-src blob:/,
  "Inner runner sandbox should be isolated and allow its worker blob.",
);
assert.doesNotMatch(
  manifest.content_security_policy?.extension_pages || "",
  /wasm-unsafe-eval/,
  "Extension pages should not keep removed audio-runtime WASM CSP privileges.",
);

const sidePanelCommand = manifest.commands?._execute_action;
assert.equal(sidePanelCommand?.suggested_key?.default, "Ctrl+Shift+K");
assert.equal(sidePanelCommand?.suggested_key?.mac, "Command+Shift+K");
assert.notEqual(sidePanelCommand?.global, true, "side panel shortcut should only fire while Chrome is focused");
const presetSwitcherCommand = manifest.commands?.["open-model-preset-switcher"];
assert.equal(presetSwitcherCommand?.suggested_key?.default, "Ctrl+Shift+M");
assert.equal(presetSwitcherCommand?.suggested_key?.mac, "Command+Shift+M");
assert.equal(presetSwitcherCommand?.description, "__MSG_switchModel__");
assert.equal(JSON.parse(readText("src/_locales/zh_CN/messages.json")).switchModel.message, "快速切换模型预设");
assert.equal(JSON.parse(readText("src/_locales/en/messages.json")).switchModel.message, "Quickly switch model presets");
assert.notEqual(presetSwitcherCommand?.global, true, "preset switching should only fire while Chrome is focused");
assert.match(serviceWorker, /setPanelBehavior\(\{\s*openPanelOnActionClick:\s*true\s*\}\)/, "the action shortcut should use Chrome's native side panel toggle");
assert.match(appShellFeature, /sidePanelApi\?\.onOpened\?\.addListener\?\.\(scheduleComposerFocus\)/, "opening the side panel should schedule composer focus from the real panel lifecycle");
assert.match(appShellFeature, /function canFocusComposer[\s\S]*getCurrentTab\?\.\(\) !== options\.tabs\.CHAT[\s\S]*options\.input\.disabled[\s\S]*options\.ui\.hasBlockingOverlay/, "composer focus should preserve non-chat and transient UI focus");

console.log("extension manifest tests passed");
