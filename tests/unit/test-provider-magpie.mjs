import assert from "node:assert/strict";
import test from "node:test";
import { getProviderDef, listProviderSummaries } from "../../src/background/llm/provider-catalog.js";
import { listProviderModels, matchProviderModelCapabilities } from "../../src/background/llm/model-directory.js";

const gateway = { data: [
  { id: "qwen-vl", display_name: "Qwen VL", owned_by: "local", context_window: 32768, max_output_tokens: 4096, modalities: { input: ["text", "image"] } },
  { id: "text-only", context_window: 8192, modalities: { input: ["text"] } },
  { object: "ignored" },
] };

async function withGateway(run) {
  const urls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async url => { urls.push(String(url)); return new Response(JSON.stringify(gateway), { status: 200 }); };
  try { return await run(urls); } finally { globalThis.fetch = original; }
}

test("Magpie keeps an editable endpoint and needs no API key", () => {
  const summary = listProviderSummaries().find(item => item.id === "magpie");
  assert.equal(summary.editableEndpoint, "http://127.0.0.1:3425/v1");
  assert.equal(summary.modelsIncludeCapabilities, true);
  assert.equal(summary.requiresApiKey, false);
  assert.equal(getProviderDef({ provider: "magpie" }).endpoint, "http://127.0.0.1:3425/v1/chat/completions");
  assert.equal(getProviderDef({ provider: "magpie", customEndpoint: "http://10.0.0.2:9000/v1" }).endpoint, "http://10.0.0.2:9000/v1/chat/completions");
});

test("Magpie model discovery reads limits and modalities from the configured gateway", async () => {
  await withGateway(async urls => {
    const definition = getProviderDef({ provider: "magpie", customEndpoint: "http://10.0.0.2:9000/v1" });
    const { models } = await listProviderModels("magpie", definition, "");
    assert.deepEqual(urls, ["http://10.0.0.2:9000/v1/models"]);
    assert.deepEqual(models.map(model => model.id), ["qwen-vl", "text-only"]);
    const vl = models.find(model => model.id === "qwen-vl");
    assert.deepEqual([vl.label, vl.contextWindow, vl.maxOutputTokens, vl.vision], ["Qwen VL", 32768, 4096, true]);
    assert.equal(models.find(model => model.id === "text-only").vision, false);
    const match = await matchProviderModelCapabilities({ provider: "magpie", model: "qwen-vl", customEndpoint: "http://10.0.0.2:9000/v1" });
    assert.deepEqual([match.matched, match.contextWindow, match.maxOutputTokens, match.vision], [true, 32768, 4096, true]);
  });
});
