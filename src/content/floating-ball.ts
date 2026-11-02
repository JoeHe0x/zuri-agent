export {};

/**
 * Floating ball: a draggable launcher pinned to the right edge of the top frame.
 * Click opens the Side Panel. Set chrome.storage.local `floatingBallEnabled` to false to hide it.
 */

(() => {
  const ENABLED_KEY = "floatingBallEnabled";
  const TOP_KEY = "floatingBallTop";
  const SIZE = 44;
  const DRAG_THRESHOLD = 4;
  const w = window as Window & { __WEEE_FLOATING_BALL?: boolean };
  if (w.__WEEE_FLOATING_BALL || !chrome.runtime?.id) return;
  w.__WEEE_FLOATING_BALL = true;

  const clampTop = (top: number) => Math.min(Math.max(0, top), Math.max(0, window.innerHeight - SIZE));
  let host: HTMLElement | null = null;
  let panelOpen = false;
  const syncVisibility = () => { if (host) host.style.display = panelOpen ? "none" : ""; };

  void chrome.storage.local.get([ENABLED_KEY, TOP_KEY]).then(items => {
    if (items[ENABLED_KEY] === false) return;
    mount(typeof items[TOP_KEY] === "number" ? items[TOP_KEY] : Math.round(window.innerHeight * 0.6));
    return chrome.runtime.sendMessage({ type: "side_panel_state" }).then(reply => {
      panelOpen = reply?.open === true;
      syncVisibility();
    });
  }).catch(() => {});

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== "side_panel_visibility") return;
    panelOpen = message.open === true;
    syncVisibility();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[ENABLED_KEY]) return;
    if (changes[ENABLED_KEY].newValue === false) { host?.remove(); host = null; }
    else if (!host) mount(Math.round(window.innerHeight * 0.6));
  });

  function mount(initialTop: number) {
    host = document.createElement("div");
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    // @property cannot be registered inside a shadow root, so the ring spins as a rotated conic-gradient layer.
    style.textContent = `
      button { all: initial; position: fixed; right: 0; width: ${SIZE}px; height: ${SIZE}px; box-sizing: border-box; overflow: hidden;
        border-radius: 50% 0 0 50%; background: transparent; cursor: pointer; opacity: .85; transform-origin: right center;
        box-shadow: 0 2px 10px rgb(0 0 0 / .25); touch-action: none;
        transition: opacity .2s, transform .25s cubic-bezier(.2, .8, .2, 1), box-shadow .25s; }
      button::before { content: ""; position: absolute; left: 50%; top: 50%; width: 120px; height: 120px; margin: -60px 0 0 -60px;
        background: conic-gradient(from 0deg, transparent 0 55%, #38bdf8 80%, #a78bfa 95%, transparent); opacity: 0; transition: opacity .25s; animation: spin 2s linear infinite; }
      button::after { content: ""; position: absolute; inset: 0; border-radius: 50% 0 0 50%; background: var(--icon) center / 28px no-repeat #fff;
        box-shadow: inset 0 0 0 1px rgb(0 0 0 / .18); transition: inset .25s; }
      button:hover, button:focus-visible { opacity: 1; transform: translateX(-4px) scale(1.1);
        box-shadow: 0 0 14px rgb(56 189 248 / .45), 0 0 28px rgb(167 139 250 / .25); }
      button:hover::before, button:focus-visible::before { opacity: 1; }
      button:hover::after, button:focus-visible::after { inset: 1px 0 1px 1px; box-shadow: none; }
      button.dragging { cursor: grabbing; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { button, button::before { animation: none; transition: none; } }`;
    const ball = document.createElement("button");
    ball.type = "button";
    ball.title = chrome.runtime.getManifest().name;
    ball.setAttribute("aria-label", ball.title);
    ball.style.setProperty("--icon", `url(${chrome.runtime.getURL("icons/icon48.png")})`);
    let top = clampTop(initialTop);
    ball.style.top = `${top}px`;
    root.append(style, ball);
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;";
    document.documentElement.append(host);
    syncVisibility();

    let startY = 0, startTop = 0, moved = false;
    ball.addEventListener("pointerdown", event => {
      startY = event.clientY; startTop = top; moved = false;
      ball.setPointerCapture(event.pointerId);
    });
    ball.addEventListener("pointermove", event => {
      if (!ball.hasPointerCapture(event.pointerId)) return;
      if (Math.abs(event.clientY - startY) > DRAG_THRESHOLD) { moved = true; ball.classList.add("dragging"); }
      if (moved) { top = clampTop(startTop + event.clientY - startY); ball.style.top = `${top}px`; }
    });
    ball.addEventListener("pointerup", () => {
      ball.classList.remove("dragging");
      if (moved) void chrome.storage.local.set({ [TOP_KEY]: top }).catch(() => {});
    });
    ball.addEventListener("click", () => {
      if (moved) return;
      // The extension was reloaded: this orphaned ball can no longer reach it until the page is refreshed.
      if (!chrome.runtime?.id) { host?.remove(); host = null; return; }
      void chrome.runtime.sendMessage({ type: "open_side_panel" }).catch(() => {});
    });
  }
})();
