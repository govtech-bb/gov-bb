import { setDOMUnmanaged } from "lexical";
import { cn } from "../../cn";
import { $static } from "../../editor/react/block-dom";
import { govbbOptional } from "../../ui/govbb";

export const $logicMount = () =>
  $static("div", "", { "data-dynamic-wording": "", "aria-hidden": "false" });

/**
 * What a drawn answer is, for a screen reader: the box is a picture, so after the question it reads “Answer: Email
 * address”, not a blank line. `label` is the field's, as the insert menu names it.
 */
export function $answerText(label: string) {
  const text = $static("span", "sr-only", { "aria-hidden": "false", "data-answer": "" });

  text.textContent = `Answer: ${label}`;

  return text;
}

/**
 * GovBB marks what's optional, never what's required: "(optional)" after the label, muted and regular weight (its
 * `govbb-label__optional`). markBlocks shows it on an optional question's first block.
 */
export function $optional(position: string) {
  const mark = $static("span", cn(govbbOptional, position), { "data-optional": "" });

  mark.textContent = "(optional)";
  mark.hidden = true;

  return mark;
}

/**
 * SSB's "Answer more than once" (fieldArray), drawn as GovBB's add another: the entry's numbered legend over the box,
 * then its rule, any further entries and the Add another button. Empty and hidden until repeat-ui.tsx's markRepeats fills them.
 */
export function $repeatParts(box: HTMLElement) {
  const legend = $static(
    "div",
    "cursor-default pb-2 text-20 leading-[1.4] font-semibold select-none",
    { "data-drawn": "", "data-repeat-legend": "" },
  );

  const rest = $static("div", "cursor-default select-none", {
    "data-drawn": "",
    "data-repeat-rest": "",
  });

  for (const part of [legend, rest]) {
    setDOMUnmanaged(part, { captureSelection: true });
    part.hidden = true;
  }

  box.before(legend);
  box.after(rest);
}

// An untitled input has no label to follow: it sits over its box's right end, in the room `optionalRoom` makes
export const onEdge = "absolute -top-7 right-0 text-16 leading-6";

export const optionalRoom = "has-[[data-optional]:not([hidden])]:pt-7";

// The space under a question's answer (GovBB's form group margin)
export const answerGap = "mb-(--form-gap)";
