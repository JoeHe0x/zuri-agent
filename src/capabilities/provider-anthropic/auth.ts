import { t } from "./i18n.js";
import type { ProviderAuthStatus, ProviderDeviceLogin, ProviderLoginPoll } from "#sdk/background/providers";

interface StoredAuth { access: string; refresh: string; expires: number; email: string }
interface PendingLogin { verifier: string; expiresAt: number }
type Token = Omit<StoredAuth, "email"> & { email?: string };

const AUTH_KEY = "claudePlanAuth";
// Public OAuth client id shipped with Claude Code; it identifies the client, not the user.
const CLIENT_ID = atob("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl");
const REDIRECT_URI = "http://localhost:54545/callback";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://api.anthropic.com/v1/oauth/token";
const SCOPES = "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
const LOGIN_POLL_SECONDS = 2;

const pendingLogins = new Map<string, PendingLogin>();
let authEpoch = 0;
let refreshing: { epoch: number; promise: Promise<StoredAuth> } | null = null;

export async function getClaudeAuthStatus(signal?: AbortSignal): Promise<ProviderAuthStatus> {
  const epoch = authEpoch;
  let auth = await readAuth();
  if (epoch !== authEpoch) return { loggedIn: false };
  if (!auth) return { loggedIn: false, accountId: "", expiresAt: 0, expired: false };
  let refreshError = "";
  try {
    auth = await refreshIfNeeded(auth, signal, epoch);
  } catch (err) {
    if (epoch !== authEpoch) return { loggedIn: false };
    refreshError = err instanceof Error ? err.message : String(err);
  }
  return {
    loggedIn: true, accountId: auth.email, expiresAt: auth.expires,
    expired: auth.expires > 0 && auth.expires <= Date.now(), hasRefreshToken: Boolean(auth.refresh), refreshError,
  };
}

export async function clearClaudeAuth() {
  authEpoch += 1;
  pendingLogins.clear();
  await chrome.storage.local.remove(AUTH_KEY);
  return getClaudeAuthStatus();
}

/** The Side Panel opens `verificationUri`; Claude then redirects to a loopback URL that `poll` finds in an open tab. */
export async function startClaudeLogin(signal?: AbortSignal): Promise<ProviderDeviceLogin> {
  signal?.throwIfAborted();
  pendingLogins.clear();
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = Date.now() + LOGIN_TIMEOUT_MS;
  pendingLogins.set(state, { verifier, expiresAt });
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    code: "true", client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI, scope: SCOPES,
    code_challenge: challenge, code_challenge_method: "S256", state,
  }).toString();
  return { loginId: state, userCode: "", verificationUri: url.href, intervalSeconds: LOGIN_POLL_SECONDS, expiresAt };
}

export async function pollClaudeLogin(loginId: unknown, signal?: AbortSignal): Promise<ProviderLoginPoll> {
  const epoch = authEpoch;
  const state = String(loginId || "");
  const pending = pendingLogins.get(state);
  if (!pending || Date.now() > pending.expiresAt) {
    pendingLogins.delete(state);
    return { status: "expired", message: t("theLoginSessionExpiredStartClaudeLoginAgain") };
  }
  signal?.throwIfAborted();
  const callback = await findCallbackTab(state);
  if (!callback) return { status: "pending", intervalSeconds: LOGIN_POLL_SECONDS };
  pendingLogins.delete(state);
  if (callback.tabId != null) chrome.tabs.remove(callback.tabId).catch(() => {});
  const { searchParams } = callback.url;
  const code = searchParams.get("code");
  if (!code) throw new Error(t("claudeSignInFailed", { reason: searchParams.get("error") || "no authorization code" }));

  const token = await requestToken({ grant_type: "authorization_code", code, state, redirect_uri: REDIRECT_URI, code_verifier: pending.verifier }, signal);
  const auth = await saveAuth({ ...token, email: token.email || "" }, epoch, signal);
  return { status: "complete", authStatus: await getClaudeAuthStatus(), accountId: auth.email };
}

/** Returns a usable access token, refreshing it when it is close to expiry. */
export async function resolveClaudeAuth(signal?: AbortSignal) {
  const epoch = authEpoch;
  signal?.throwIfAborted();
  let auth = await readAuth();
  if (!auth) throw new Error(t("signInToClaudeInSettingsFirst"));
  auth = await refreshIfNeeded(auth, signal, epoch);
  return { token: auth.access };
}

async function findCallbackTab(state: string) {
  for (const tab of await chrome.tabs.query({ url: "http://localhost/*" })) {
    const href = tab.url || tab.pendingUrl || "";
    if (!href.startsWith(REDIRECT_URI)) continue;
    const url = new URL(href);
    if (url.searchParams.get("state") === state) return { tabId: tab.id, url };
  }
  return null;
}

/** Concurrent callers share one refresh request. */
function refreshIfNeeded(auth: StoredAuth, signal: AbortSignal | undefined, epoch: number): Promise<StoredAuth> {
  assertCurrentAuth(epoch, signal);
  if (auth.access && auth.expires > Date.now() + REFRESH_SKEW_MS) return Promise.resolve(auth);
  if (refreshing?.epoch !== epoch) {
    // Refresh tokens rotate, so a single in-flight request must own the stored one.
    const promise = requestToken({ grant_type: "refresh_token", refresh_token: auth.refresh })
      .then(token => saveAuth({ ...auth, access: token.access, expires: token.expires, refresh: token.refresh || auth.refresh }, epoch))
      .finally(() => { if (refreshing?.promise === promise) refreshing = null; });
    refreshing = { epoch, promise };
  }
  return refreshing.promise;
}

async function requestToken(params: Record<string, string>, signal?: AbortSignal): Promise<Token> {
  const response = await fetch(TOKEN_URL, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", ...(params.grant_type === "refresh_token" ? { "anthropic-beta": "oauth-2025-04-20" } : {}) },
    body: JSON.stringify({ ...params, client_id: CLIENT_ID }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Claude token request failed (${response.status}): ${text.slice(0, 300)}`);
  let data: { access_token?: string; refresh_token?: string; expires_in?: number; account?: { email_address?: string } };
  try { data = JSON.parse(text); } catch (_err) { throw new Error("Claude token endpoint returned non-JSON response"); }
  const access = String(data.access_token || "");
  const refresh = String(data.refresh_token || "");
  const expiresIn = Number(data.expires_in);
  if (!access || !Number.isFinite(expiresIn)) throw new Error(`Claude token response missing fields: ${text.slice(0, 300)}`);
  return { access, refresh, expires: Date.now() + expiresIn * 1000, email: data.account?.email_address };
}

async function readAuth(): Promise<StoredAuth | null> {
  const { [AUTH_KEY]: stored } = await chrome.storage.local.get(AUTH_KEY);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
  const { access, refresh, expires, email } = stored as Record<string, unknown>;
  if (typeof access !== "string" && typeof refresh !== "string") return null;
  return { access: String(access || ""), refresh: String(refresh || ""), expires: Number(expires) || 0, email: String(email || "") };
}

async function saveAuth(auth: StoredAuth, epoch: number, signal?: AbortSignal) {
  assertCurrentAuth(epoch, signal);
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
  return auth;
}

function assertCurrentAuth(epoch: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (epoch !== authEpoch) throw new DOMException(t("loginCanceledStartAgain"), "AbortError");
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
