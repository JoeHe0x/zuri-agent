import { callTool } from "../../mcp-bridge/src/client.mjs";

// Every bridge tool name lives here, so a rename touches one file.
const TOOLS = { create: "zuri_create_session", send: "zuri_send_message", input: "zuri_get_user_input", respond: "zuri_respond_to_user_input" };

export function createBridge({ url, clientId = "" }) {
  const endpoint = new URL(url).origin;
  const call = (tool, args, waitTimeoutSeconds) => callTool(endpoint, TOOLS[tool],
    { ...args, ...(clientId ? { clientId } : {}), ...(waitTimeoutSeconds ? { wait: true, waitTimeoutSeconds } : {}) },
    // The call must outlive the bridge's own wait deadline.
    { timeoutMs: ((waitTimeoutSeconds || 0) + 60) * 1000 });
  return {
    createSession: async title => {
      const result = await call("create", { title });
      const sessionId = result?.session?.id || result?.sessionId;
      if (!sessionId) throw Object.assign(new Error("The bridge created a task without an ID."), { code: "invalid_response" });
      return { sessionId };
    },
    sendMessage: (sessionId, text, clientMessageId, waitTimeoutSeconds) =>
      call("send", { sessionId, text, clientMessageId }, waitTimeoutSeconds),
    pendingInput: sessionId => call("input", { sessionId }),
    respond: (sessionId, waitId, action, answers) => call("respond", { sessionId, waitId, action, ...(answers ? { answers } : {}) }),
  };
}
