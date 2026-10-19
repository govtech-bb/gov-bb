import { setDOMUnmanaged } from "lexical";
import { $static } from "../../../editor/react/block-dom";
import { govbbBox, govbbFieldWidth } from "../../../ui/govbb";

export function $drawLongAnswer() {
  const box = $static(
    "div",
    `relative flex min-h-26 w-full cursor-default p-3 ${govbbFieldWidth} ${govbbBox}`,
    { "data-drawn": "" },
  );

  setDOMUnmanaged(box, { captureSelection: true });

  return box;
}
