const SHOW_DELAY_MS = 400;
const EDGE_MARGIN = 6;

/** Replaces the native `title` bubble with a pill. The title moves to `data-tip` while hovered so the browser stays quiet. */
export function installTooltipFeature(root: Document = document) {
  const pill = root.createElement("div");
  pill.className = "zuri-tooltip";
  pill.setAttribute("role", "tooltip");
  root.body.append(pill);
  let target: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Live-updated titles (context usage) are rewritten while hovered; take them over again.
  const retitle = new MutationObserver(() => {
    if (!target?.hasAttribute("title")) return;
    const text = target.getAttribute("title") || "";
    target.removeAttribute("title");
    target.setAttribute("data-tip", text);
    if (pill.classList.contains("visible")) pill.textContent = text;
  });

  function hide() {
    retitle.disconnect();
    clearTimeout(timer);
    pill.classList.remove("visible");
    if (target?.hasAttribute("data-tip")) {
      if (!target.hasAttribute("title")) target.setAttribute("title", target.getAttribute("data-tip") || "");
      target.removeAttribute("data-tip");
    }
    target = null;
  }

  function place(el: HTMLElement) {
    const anchor = el.getBoundingClientRect();
    const width = pill.offsetWidth;
    const left = Math.min(Math.max(EDGE_MARGIN, anchor.left + anchor.width / 2 - width / 2), root.documentElement.clientWidth - width - EDGE_MARGIN);
    const above = anchor.top - pill.offsetHeight - 6;
    pill.style.left = `${left}px`;
    pill.style.top = `${above >= EDGE_MARGIN ? above : anchor.bottom + 6}px`;
    pill.classList.add("visible");
  }

  root.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch" || !(event.target instanceof Element)) return;
    const el = event.target.closest<HTMLElement>("[title]");
    if (el === target || !el) return;
    hide();
    const text = el.getAttribute("title")?.trim();
    if (!text) return;
    if (!el.hasAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", text);
    target = el;
    el.setAttribute("data-tip", text);
    el.removeAttribute("title");
    retitle.observe(el, { attributes: true, attributeFilter: ["title"] });
    timer = setTimeout(() => {
      pill.textContent = el.getAttribute("data-tip") || text;
      place(el);
    }, SHOW_DELAY_MS);
  });
  root.addEventListener("pointerout", (event) => {
    if (target && !target.contains(event.relatedTarget as Node | null)) hide();
  });
  root.addEventListener("pointerdown", hide, true);
  root.addEventListener("scroll", hide, true);
  root.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
}
