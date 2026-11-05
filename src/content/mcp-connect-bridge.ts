import { productText } from "../shared/product-text.js";
import { requestRuntimeMessage } from "../shared/transport/runtime-request.js";

// This packaged script only runs on the CLI's top-level local connection page.
if (window === window.top && location.protocol === "http:"
  && ["127.0.0.1", "localhost"].includes(location.hostname) && location.pathname === "/zuri-connect") {
  const status = document.querySelector<HTMLElement>("[data-zuri-connection-status]");
  if (status) {
    void requestRuntimeMessage({ type: "mcp_bridge_connect" }, { timeoutMs: 30000 }).then(response => {
      status.dataset.zuriConnectionState = response.ok ? "connected" : "error";
      status.dataset.zuriConnectionCode = String(response.code || "");
      const connection = response.status && typeof response.status === "object" ? response.status as Record<string, unknown> : {};
      if (response.ok) {
        status.dataset.zuriClientId = String(connection.clientId || "");
        status.dataset.zuriBrowserName = String(connection.name || "");
      }
      status.textContent = response.ok ? `Connected${connection.name ? ` as ${connection.name}` : ""}. You can close this tab.`
        : response.code === "DATA_CONSENT_REQUIRED"
          ? productText("Open the zuri side panel and complete first-time setup, then reload this page.", "Open the zuri sidebar and complete first-time setup, then reload this page.")
          : String(response.error || "Connection failed. Run zuri connect to try again.");
    }).catch(() => {
      status.dataset.zuriConnectionState = "error";
      status.textContent = "Connection failed. Run zuri connect to try again.";
    });
  }
}
