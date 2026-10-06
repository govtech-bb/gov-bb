import plus from "@phosphor-icons/core/assets/bold/plus-bold.svg?raw";
import { cn } from "../../../cn";
import { container, ghostBase, el, $static, icon } from "../../../editor/react/block-dom";
import { $logicMount, $optional } from "../../editor/answer-dom";
import type { ChoicePresentation } from "../../field";

export const markerPad = "pt-[calc((var(--form-marker)_-_1.5em)/2)]";

/** Shared option slots and events; each field supplies its own frame and markers. */
export function choicePresentation({
  kind,
  multiple,
  classes,
  rowClass,
  textClass,
  optionalClass,
  marker,
  leading,
}: {
  kind: string;
  multiple: boolean;
  classes: { dom: string; card: string; add: string };
  rowClass: string;
  textClass?: string;
  optionalClass: string;
  marker?: () => HTMLElement;
  leading?: (index: number) => HTMLElement | null;
}): ChoicePresentation {
  const paint = (dom: HTMLElement, index: number) => {
    dom.querySelector<HTMLElement>("[data-card]")!.className = classes.card;
    const text = dom.querySelector<HTMLElement>("[data-text]")!;
    text.dataset.placeholder = `Option ${index + 1}`;
    const row = text.parentElement!;
    row.querySelector("[data-marker]")?.remove();
    const mark = marker?.();
    mark?.setAttribute("data-marker", "");

    if (mark) row.prepend(mark);
    dom.querySelector(":scope > [data-select]")?.remove();
    const lead = leading?.(index);

    if (lead) dom.prepend(lead);
    const add = dom.querySelector<HTMLElement>("[data-add-row]")!;

    const addRow = el(
      "div",
      "flex w-full cursor-pointer items-center gap-2 text-16 leading-6 font-semibold text-muted hover:text-ink",
    );

    addRow.innerHTML = icon(plus, 16);
    addRow.append("Add option");
    add.replaceChildren(addRow);
  };

  return {
    multiple,
    paint,
    createDOM(index, onAdd) {
      const dom = el(
        "div",
        cn(
          container,
          classes.dom,
          "[&:not(:has(+[data-option],+[data-nested],+[data-statement]))]:pb-(--form-gap)",
        ),
        { "data-option": "", "data-kind": kind },
      );

      const card = el("div", "", { "data-card": "" });
      const row = el("div", cn("flex min-w-0 flex-1", rowClass));
      row.append(
        el(
          "div",
          cn(
            "min-w-0 leading-[1.5]",
            textClass,
            `${ghostBase} before:text-subtle has-[>br:only-child]:before:content-[attr(data-placeholder)]`,
          ),
          { "data-text": "" },
        ),
        $optional(cn("ml-1.5 leading-[1.5]", optionalClass)),
      );
      card.append(row);

      const add = $static("div", cn("hidden in-data-adding:block", classes.add), {
        "data-add-row": "",
      });

      add.addEventListener("mousedown", (event) => event.preventDefault());
      add.addEventListener("click", onAdd);
      dom.append($logicMount(), card, add);
      paint(dom, index);

      return dom;
    },
  };
}
