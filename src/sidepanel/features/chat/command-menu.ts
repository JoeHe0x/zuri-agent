import { escapeHtml } from "../../ui/ui-utils.js";
import type { WorkspaceExtensions } from "../app/workspace-extensions.js";

export interface MenuItem {
  id: string; label: string; icon?: string; run?(): void; separator?: boolean; chevron?: boolean;
  /** Re-renders the open menu after `run` instead of closing it. */
  keepOpen?: boolean;
  /** Favicon URL, muted trailing text and a check mark for toggle rows. */
  iconUrl?: string; hint?: string; tooltip?: string; checked?: boolean;
}

/** Opens a popover of commands from a button; arrow keys move, Esc closes and returns focus. */
export function createCommandMenu({ button, menu, extensions, list }: {
  button: HTMLElement; menu: HTMLElement; extensions: Pick<WorkspaceExtensions, "invoke">;
  /** `icon` is trusted static SVG inner markup from the capability (24x24 viewBox). */
  list(): MenuItem[] | Promise<MenuItem[]>;
}) {
  menu.setAttribute("role", "menu");
  const items = () => [...menu.querySelectorAll<HTMLElement>("[data-index]")];
  let shown: MenuItem[] = [];
  const setOpen = (open: boolean) => {
    menu.classList.toggle("hidden", !open);
    // The button is vertically centred in a growing input row; open just above it, not above the whole input area.
    const area = menu.offsetParent;
    if (open && area) menu.style.bottom = `${Math.round(area.getBoundingClientRect().bottom - button.getBoundingClientRect().top + 4)}px`;
    button.setAttribute("aria-expanded", String(open));
  };
  async function render() {
    const commands = shown = await list();
    menu.innerHTML = commands.map((command, index) => {
      const icon = command.iconUrl ? `<img class="composer-menu-favicon" src="${escapeHtml(command.iconUrl)}" alt="">`
        : command.icon ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${command.icon}</svg>` : "";
      const trail = command.checked ? `<svg class="composer-menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>`
        : command.chevron ? `<svg class="composer-menu-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>` : "";
      return `${command.separator && index ? `<div class="composer-menu-sep" role="separator"></div>` : ""}<button class="zuri-menu-item" role="menuitem" type="button" data-index="${index}"${command.tooltip ? ` title="${escapeHtml(command.tooltip)}"` : ""}>${icon}<span class="composer-menu-label">${escapeHtml(command.label)}</span>${command.hint ? `<span class="composer-menu-hint">${escapeHtml(command.hint)}</span>` : ""}${trail}</button>`;
    }).join("");
    return commands.length;
  }
  button.addEventListener("click", async () => {
    if (!menu.classList.contains("hidden")) { setOpen(false); return; }
    if (!await render()) return;
    setOpen(true);
    items()[0]?.focus();
  });
  menu.addEventListener("click", event => {
    const index = (event.target as Element).closest<HTMLElement>("[data-index]")?.dataset.index;
    if (index === undefined) return;
    const command = shown[Number(index)];
    if (command.keepOpen) { command.run?.(); void render(); return; }
    setOpen(false);
    if (command.run) command.run(); else extensions.invoke(command.id);
  });
  menu.addEventListener("keydown", event => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); button.focus(); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      all[(at + (event.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
    }
  });
  document.addEventListener("pointerdown", event => {
    if (!menu.classList.contains("hidden") && !menu.contains(event.target as Node) && !button.contains(event.target as Node)) setOpen(false);
  });
}
