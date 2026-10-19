import { $getDocument, setDOMUnmanaged } from "lexical";
import { cn } from "../../cn";
import { $tip } from "../../editor/react/block-dom";
import { govbbBox, govbbFieldWidth } from "../../ui/govbb";

/** GovBB's text input, drawn: the box at its question's width, its mark at the end. */
export const inputBox = `relative flex h-(--form-control) w-full cursor-default items-center justify-end gap-2 pl-3 pr-3 ${govbbFieldWidth} ${govbbBox}`;

/** Shared drawn-input box; feature modules supply its mark and explanatory tooltip. */
export function $drawInputBox({ svg, mask, help }: { svg?: string; mask?: string; help: string }) {
  const document = $getDocument();
  const box = document.createElement("div");
  box.className = inputBox;
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
  mark.append($tip(help, "bottom"));
  box.append(mark);

  return box;
}
