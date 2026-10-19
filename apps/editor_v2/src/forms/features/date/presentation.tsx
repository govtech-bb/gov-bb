import { setDOMUnmanaged } from "lexical";
import { cn } from "../../../cn";
import { $static, el, container } from "../../../editor/react/block-dom";
import { govbbBox } from "../../../ui/govbb";
import { $optional, $logicMount, answerGap } from "../../editor/answer-dom";

/** GovBB's date input: Day, Month and Year, each a labelled box. */
export function $dateParts() {
  const parts = $static("div", "flex w-fit cursor-default items-end gap-4", { "data-date": "" });
  setDOMUnmanaged(parts, { captureSelection: true });

  for (const [name, width] of [
    ["Day", "w-18"],
    ["Month", "w-18"],
    ["Year", "w-28"],
  ] as const) {
    const part = el("div", "flex flex-col gap-1");
    const label = el("span", "leading-[1.5] font-bold");
    label.textContent = name;
    part.append(label, el("div", cn("h-(--form-control)", width, govbbBox)));
    parts.append(part);
  }

  return parts;
}

export function $dateDOM() {
  const dom = el("div", `${container} ${answerGap}`);
  const parts = $dateParts();

  parts.append($optional("mb-3.5 self-end"));
  dom.append($logicMount(), parts, el("div", "sr-only", { "data-text": "" }));

  return dom;
}
