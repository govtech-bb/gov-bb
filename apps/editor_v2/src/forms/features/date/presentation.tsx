import { setDOMUnmanaged } from "lexical";
import { cn } from "../../../cn";
import { $static, el, container } from "../../../editor/react/block-dom";
import { $optional, $logicMount, frame, answerGap } from "../../editor/answer-dom";

export function $dateDOM() {
  const dom = el("div", `${container} ${answerGap}`);
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
    part.append(label, el("div", cn("h-(--form-control)", width, frame)));
    parts.append(part);
  }

  parts.append($optional("mb-3.5 self-end"));
  dom.append($logicMount(), parts, el("div", "sr-only", { "data-text": "" }));

  return dom;
}

export function DatePreview() {
  return (
    <div className="flex gap-3">
      {[
        ["Day", "w-14"],
        ["Month", "w-14"],
        ["Year", "w-22"],
      ].map(([name, width]) => (
        <div key={name} className="flex flex-col gap-1">
          <span className="font-bold leading-[1.5]">{name}</span>
          <span
            className={cn("h-(--form-control) rounded-sm border-2 border-ink bg-white", width)}
          />
        </div>
      ))}
    </div>
  );
}
