import { escapeHtml } from "../../ui/ui-utils.js";

const TOKEN = /(^|\s)([/@][^\s/@[\]]*)/gu;

/** Colors "/" and "@" tokens in the composer textarea through a mirror layer behind it.
 * The textarea text turns transparent only while a token exists, so plain text renders natively. */
export function createInputHighlight(input: HTMLTextAreaElement) {
  const mirror = document.createElement("div");
  mirror.className = "input-highlight hidden";
  mirror.setAttribute("aria-hidden", "true");
  mirror.dir = "auto";
  input.before(mirror);

  function sync() {
    const value = input.value;
    const active = TOKEN.test(value);
    TOKEN.lastIndex = 0;
    input.classList.toggle("has-highlight", active);
    mirror.classList.toggle("hidden", !active);
    if (!active) return;
    mirror.innerHTML = escapeHtml(value).replace(TOKEN, (_, lead: string, token: string) =>
      `${lead}<span class="${token[0] === "/" ? "hl-slash" : "hl-mention"}">${token}</span>`) + "\n";
    Object.assign(mirror.style, {
      left: `${input.offsetLeft}px`, top: `${input.offsetTop}px`,
      width: `${input.clientWidth}px`, height: `${input.clientHeight}px`,
    });
    mirror.scrollTop = input.scrollTop;
  }

  // Programmatic writes (draft restore, clear after send, menu selection) do not fire "input".
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!;
  Object.defineProperty(input, "value", {
    configurable: true,
    get: () => descriptor.get!.call(input),
    set: (next: string) => { descriptor.set!.call(input, next); sync(); },
  });
  input.addEventListener("input", sync);
  input.addEventListener("scroll", () => { mirror.scrollTop = input.scrollTop; });
  new ResizeObserver(sync).observe(input);
  sync();
}
