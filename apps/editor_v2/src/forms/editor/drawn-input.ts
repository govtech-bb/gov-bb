import { $getDocument, setDOMUnmanaged } from "lexical";
import { cn } from "../../cn";

/** Shared drawn-input box; feature modules supply its mark and explanatory tooltip. */
export function $drawInputBox({ svg, mask, help }: { svg?: string; mask?: string; help: string }) {
  const document = $getDocument();
  const box = document.createElement("div");
  box.className =
    "relative flex h-(--form-control) w-full cursor-default items-center justify-end gap-2 pl-3 max-w-[var(--field-width,100%)] pr-3 rounded-sm border-2 border-ink bg-input";
  box.setAttribute("data-drawn", "");
  box.setAttribute("contenteditable", "false");
  box.setAttribute("aria-hidden", "true");
  setDOMUnmanaged(box, { captureSelection: true });
  const mark = document.createElement("span");
  mark.className = cn(
    "group/tip relative flex shrink-0 items-center text-muted",
    mask && "font-mono text-14 leading-none",
  );
  mark.setAttribute("contenteditable", "false");
  mark.setAttribute("aria-hidden", "true");
  setDOMUnmanaged(mark);

  if (mask) mark.textContent = mask;
  else if (svg)
    mark.innerHTML = svg.replace("<svg ", '<svg width="18" height="18" aria-hidden="true" ');
  const tip = document.createElement("span");
  tip.className =
    "pointer-events-none invisible absolute left-1/2 z-60 -translate-x-1/2 rounded-sm bg-ink px-2 py-1 font-sans text-12 leading-4 font-semibold whitespace-nowrap text-white opacity-0 transition-[opacity,visibility] duration-200 ease-out group-hover/tip:visible group-hover/tip:opacity-100 top-full mt-2.5";
  tip.textContent = help;
  mark.append(tip);
  box.append(mark);

  return box;
}
