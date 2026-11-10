import { productText } from "../shared/product-text.js";
import { requestRuntimeMessage } from "../shared/transport/runtime-request.js";

// This packaged script only runs on the CLI's top-level local connection page.
if (window === window.top && location.protocol === "http:"
  && ["127.0.0.1", "localhost"].includes(location.hostname) && (location.pathname === "/zuri-connect" || location.pathname === "/qz-connect")) {
  const status = document.querySelector<HTMLElement>("[data-zuri-connection-status]") || document.querySelector<HTMLElement>("[data-qz-connection-status]");
  if (status) {
    // The page keeps its install help hidden once the extension claims it.
    status.dataset.zuriExtension = "active";
    status.dataset.qzExtension = "active";
    const message = status.querySelector<HTMLElement>("[data-zuri-connection-message]") || status.querySelector<HTMLElement>("[data-qz-connection-message]") || status;
    const controller = new AbortController();
    const stop = () => controller.abort();
    window.addEventListener("pagehide", stop, { once: true });
    void (async () => {
      let response = await requestRuntimeMessage({ type: "mcp_bridge_connect" }, { timeoutMs: 30000, signal: controller.signal });
      while (!controller.signal.aborted) {
        const value = response.status || response.result;
        const connection = value && typeof value === "object" ? value as Record<string, unknown> : {};
        const connected = response.ok && connection.state === "connected";
        const pending = response.ok && ["connecting", "reconnecting"].includes(String(connection.state));
        const connectedText = `Connected${connection.name ? ` as ${connection.name}` : ""}.`;
        const error = connection.lastError as { code?: string; message?: string } | undefined;
        status.dataset.zuriConnectionState = connected ? "connected" : pending ? String(connection.state) : "error";
        status.dataset.qzConnectionState = status.dataset.zuriConnectionState;
        status.dataset.zuriConnectionCode = pending || connected ? "" : String(response.code || error?.code || "");
        status.dataset.qzConnectionCode = status.dataset.zuriConnectionCode;
        if (connected) {
          status.dataset.zuriClientId = String(connection.clientId || "");
          status.dataset.qzClientId = status.dataset.zuriClientId;
          status.dataset.zuriBrowserName = String(connection.name || "");
          status.dataset.qzBrowserName = status.dataset.zuriBrowserName;
        }
        message.textContent = connected ? `${connectedText} Closing this tab in 3s.`
          : pending ? connection.state === "reconnecting" ? "Reconnecting to zuri…" : "Connecting to zuri…"
            : response.code === "DATA_CONSENT_REQUIRED"
              ? productText("Open the zuri side panel and complete first-time setup, then reload this page.", "Open the zuri sidebar and complete first-time setup, then reload this page.")
              : String(response.error || error?.message || "Connection failed. Run zuri connect uri and open the printed URL in this browser.");
        if (connected) {
          for (let remaining = 3; remaining > 0; remaining--) {
            message.textContent = `${connectedText} Closing this tab in ${remaining}s.`;
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (controller.signal.aborted) return;
          }
          const closed = await requestRuntimeMessage({ type: "mcp_bridge_close" }, { timeoutMs: 5000, signal: controller.signal }).catch(() => null);
          if (controller.signal.aborted) return;
          if (closed?.ok && closed.closed === false && closed.status) { response = closed; continue; }
          if (!closed?.ok) message.textContent = `${connectedText} You can close this tab.`;
          return;
        }
        if (!pending) return;
        await new Promise(resolve => setTimeout(resolve, 1000));
        response = await requestRuntimeMessage({ type: "mcp_connection_status" }, { timeoutMs: 5000, signal: controller.signal });
      }
    })().catch(() => {
      if (controller.signal.aborted) return;
      status.dataset.zuriConnectionState = "error";
      status.dataset.qzConnectionState = "error";
      message.textContent = "Connection failed. Run zuri connect uri and open the printed URL in this browser.";
    }).finally(() => window.removeEventListener("pagehide", stop));
  }
}
