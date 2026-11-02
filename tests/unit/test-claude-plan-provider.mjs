import assert from "node:assert/strict";

const storage = {};
let tabs = [];
const removed = [];
const calls = [];
globalThis.chrome = {
  storage: { local: {
    async get(key) { return { [key]: storage[key] }; },
    async set(values) { Object.assign(storage, values); },
    async remove(key) { delete storage[key]; },
  } },
  tabs: { async query() { return tabs; }, async remove(id) { removed.push(id); } },
};
let modelsStatus = 200;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url, body, headers: init.headers });
  if (url.endsWith("/v1/oauth/token")) return json({ access_token: "at-new", refresh_token: "rt-new", expires_in: 3600, account: { email_address: "a@b.c" } });
  if (url.includes("/v1/models")) return modelsStatus === 200 ? json({ data: [{ id: "claude-x-9" }, { id: "not-claude" }, { id: "claude-y-8" }] }) : json({}, modelsStatus);
  if (url.endsWith("/v1/messages")) return json({ content: globalThis.messageContent || [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
  throw new Error(`unexpected fetch ${url}`);
};

const auth = await import("../../src/capabilities/provider-anthropic/auth.js");
const { chatClaudePlan } = await import("../../src/capabilities/provider-anthropic/claude-plan.js");
const endpoint = "https://api.anthropic.com/v1/messages";
const provider = { api: "claude-plan", protocol: "claude-plan", endpoint };
const ask = (tools = []) => chatClaudePlan([{ role: "system", content: "sys" }, { role: "user", content: "go" }], tools, undefined, { providerDefinition: provider }, { provider: "claudeplan", model: "claude-sonnet-5-5", endpoint });

// Signed out: requests are refused before any network call.
assert.equal((await auth.getClaudeAuthStatus()).loggedIn, false);
await assert.rejects(ask(), /Claude/);
assert.equal(calls.length, 0);

// Login: PKCE challenge, foreign tabs ignored, matching callback exchanged with the verifier.
const login = await auth.startClaudeLogin();
const authorize = new URL(login.verificationUri);
assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
assert.equal(authorize.searchParams.get("state"), login.loginId);
tabs = [{ id: 1, url: "http://localhost:54545/callback?code=old&state=other" }];
assert.equal((await auth.pollClaudeLogin(login.loginId)).status, "pending");
tabs = [{ id: 8, url: `http://localhost:54545/callback?code=c2&state=${login.loginId}` }];
const done = await auth.pollClaudeLogin(login.loginId);
assert.equal(done.status, "complete");
assert.equal(done.accountId, "a@b.c");
assert.deepEqual(removed, [8]);
assert.equal(calls[0].body.code, "c2");
assert.equal(calls[0].body.state, login.loginId);
assert.ok(calls[0].body.code_verifier.length >= 43);

// Requests carry the bearer token, OAuth beta and Claude Code identity, and no API key.
await ask();
const request = calls.at(-1);
assert.equal(request.headers.Authorization, "Bearer at-new");
assert.match(request.headers["anthropic-beta"], /oauth-2025-04-20/);
assert.equal("x-api-key" in request.headers, false);
assert.match(request.body.system[0].text, /Claude Code/);

// Tool names are prefixed on the wire and restored in the result.
globalThis.messageContent = [{ type: "tool_use", id: "t1", name: "_click", input: {} }];
const reply = await ask([{ type: "function", function: { name: "click", description: "", parameters: {} } }]);
assert.equal(calls.at(-1).body.tools[0].name, "_click");
assert.equal(reply.tool_calls?.[0]?.function.name ?? reply.message?.tool_calls?.[0]?.function.name, "click");
globalThis.messageContent = null;

// An expired token is refreshed once with the stored refresh token.
storage.claudePlanAuth.expires = Date.now() - 1;
await ask();
assert.equal(calls.filter(call => call.body?.grant_type === "refresh_token").length, 1);
assert.equal(storage.claudePlanAuth.refresh, "rt-new");

// Models come from the account, newest first; a failed listing falls back to the packaged list.
const { listModels } = await import("../../src/capabilities/provider-anthropic/models.js");
const definition = { baseUrl: "https://api.anthropic.com", staticModels: [{ id: "static" }] };
const read = async (endpoint, headers) => { const response = await fetch(endpoint, { headers }); return { response, text: await response.text() }; };
assert.deepEqual((await listModels({ definition, read })).map(m => m.id), ["claude-x-9", "claude-y-8"]);
modelsStatus = 500;
assert.deepEqual(await listModels({ definition, read }), definition.staticModels);

// Logout invalidates the stored credentials.
assert.equal((await auth.clearClaudeAuth()).loggedIn, false);
await assert.rejects(ask(), /Claude/);
console.log("claude plan provider ok");
