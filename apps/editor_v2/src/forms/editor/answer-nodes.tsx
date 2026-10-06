import {
  $create,
  $getNodeByKey,
  $getState,
  $getStateChange,
  $setState,
  createState,
  DecoratorNode,
  ElementNode,
  setDOMUnmanaged,
  type LexicalEditor,
  type LexicalNode,
  type RangeSelection,
} from "lexical";
import type { ReactNode } from "react";
import { cn } from "../../cn";
import { $paragraphAfter } from "../../editor/core/blocks";
import { installedEditorDefinition } from "../../editor/core/context";
import { $depth, $setDepth, $settings, settingsState } from "../../editor/core/document-state";
import { $static, container, el } from "../../editor/react/block-dom";
import { RendererHost } from "../../editor/react/contributions";
import type { WidgetKind } from "../core/widget-kinds";
import { formDefinition } from "../definition";
import {
  $logicMount,
  $optional,
  $repeatParts,
  answerGap,
  frame,
  onEdge,
  optionalRoom,
} from "./answer-dom";
import { $installedField } from "./field-context";

export {
  $blockId,
  $depth,
  $setDepth,
  $setSettings,
  $settings,
  blockIdState,
  depthState,
  settingsState,
} from "../../editor/core/document-state";

export {
  $createInsetNode,
  $createWarningNode,
  $isCallout,
  InsetNode,
  WarningNode,
} from "../../editor/modules/callouts/nodes";

export {
  $createShowHideNode,
  $isShowHideNode,
  $toggleShowHide,
  ShowHideNode,
} from "../../editor/modules/disclosure/nodes";

export {
  $createBulletNode,
  $createListLine,
  $createNumberNode,
  $isListLine,
  $listRun,
  BulletNode,
  listIndexState,
  NumberNode,
} from "../../editor/modules/lists/nodes";

export { container, ghost } from "../../editor/react/block-dom";

import { $nested, $run } from "./nodes";

export const choiceKinds = ["checkboxes", "multiple-choice", "dropdown"] as const;

export type ChoiceKind = string;

export const choiceKindState = createState("kind", {
  parse: (value): string => (typeof value === "string" ? value : "checkboxes"),
});

export type InputKind = string;

export const inputKindState = createState("kind", {
  parse: (value): string => (typeof value === "string" ? value : "text"),
});

export const widgetState = createState("widget", {
  parse: (v): WidgetKind => (typeof v === "string" ? v : "page-break"),
});

/** TEXTAREA: GovBB's textarea, drawn with its empty text slot out of sight. */
export class LongAnswerNode extends ElementNode {
  override $config() {
    return this.config("long-answer", {
      extends: ElementNode,
      // Drawn inputs have nothing to type in; saved placeholder text is cleared when old drafts load too
      $transform: (node: LongAnswerNode) => {
        if (!node.isEmpty()) node.clear();
      },
    });
  }
  override createDOM() {
    const dom = el("div", `${container} ${answerGap} ${optionalRoom}`);
    const box = $installedField(this.getType())!.draw!($settings(this));
    setDOMUnmanaged(box, { captureSelection: true });
    box.append($optional(onEdge));
    dom.append($logicMount(), box, el("div", "sr-only", { "data-text": "" }));
    $repeatParts(box);

    return dom;
  }
  override updateDOM() {
    return false;
  }
  override getDOMSlot(dom: HTMLElement) {
    // SAFETY: createDOM always installs an HTML element with data-text as this node's editable slot.
    return super.getDOMSlot(dom).withElement(dom.querySelector("[data-text]") as HTMLElement);
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    return $paragraphAfter(this, restoreSelection);
  }
}

/** INPUT_TEXT, INPUT_EMAIL…: GovBB's input, drawn with its empty text slot out of sight. */
export class InputNode extends ElementNode {
  override $config() {
    return this.config("input", {
      extends: ElementNode,
      stateConfigs: [{ stateConfig: inputKindState, flat: true }],
      // Drawn inputs have nothing to type in; saved placeholder text is cleared when old drafts load too
      $transform: (node: InputNode) => {
        if (!node.isEmpty()) node.clear();
      },
    });
  }
  override createDOM(_: unknown, editor: LexicalEditor): HTMLElement {
    const kind = $getState(this, inputKindState);
    const field = $installedField(kind);

    if (field?.createDOM) return field.createDOM($settings(this), editor);
    const dom = el("div", `${container} ${answerGap} ${optionalRoom}`);

    // Field width caps the box; GovBB's number input always stops at 11rem
    const box =
      field?.draw?.($settings(this)) ??
      $static(
        "div",
        cn(
          "relative flex h-(--form-control) w-full cursor-default items-center justify-end gap-2 pl-3",
          "max-w-[var(--field-width,100%)] pr-3",
          frame,
        ),
        { "data-drawn": "" },
      );

    setDOMUnmanaged(box, { captureSelection: true });
    box.append($optional(onEdge));
    dom.append($logicMount(), box, el("div", "sr-only", { "data-text": "" }));
    $repeatParts(box);

    return dom;
  }
  override updateDOM(prev: this) {
    // Normal NodeState reads resolve to the latest node, so compare the two versions directly
    const settings = $getStateChange(this, prev, settingsState);

    return (
      $getStateChange(this, prev, inputKindState) !== null ||
      (!!settings &&
        ($installedField($getState(this, inputKindState))?.redraw?.(settings[1], settings[0]) ??
          false))
    );
  }
  override getDOMSlot(dom: HTMLElement) {
    // SAFETY: createDOM always installs an HTML element with data-text as this node's editable slot.
    return super.getDOMSlot(dom).withElement(dom.querySelector("[data-text]") as HTMLElement);
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    return $paragraphAfter(this, restoreSelection);
  }
}

/** OptionNode’s transform keeps this index aligned with the option order for placeholder labels. */
const indexState = createState("index", { parse: (v) => (typeof v === "number" ? v : 0) });

/** One option of a choice question (checkboxes, multiple choice, dropdown). Enter adds the next one. */
export class OptionNode extends ElementNode {
  override $config() {
    return this.config("option", {
      extends: ElementNode,
      stateConfigs: [{ stateConfig: choiceKindState, flat: true }],
      // Number the options of this node's run, so placeholders follow moves and deletes
      $transform: (option: OptionNode) => {
        let index = 0;

        for (const next of $run(option)) {
          const at = index++;
          $setState(next, indexState, () => at);
        }
      },
    });
  }
  override createDOM(_: unknown, editor: LexicalEditor): HTMLElement {
    const kind = $getState(this, choiceKindState);
    const choice = $installedField(kind)?.choice;

    if (!choice) throw new Error(`No choice presentation installed: ${kind}`);

    return choice.createDOM($getState(this, indexState), () => {
      if (!editor.isEditable()) return;
      editor.update(() => {
        if (!editor.isEditable()) return;
        const node = $getNodeByKey(this.getKey());

        if ($isOptionNode(node))
          node.insertAfter($createOptionNode($getState(node, choiceKindState))).selectStart();
      });
    });
  }

  override updateDOM(prev: this, dom: HTMLElement) {
    if ($getStateChange(this, prev, choiceKindState)) return true;

    if ($getStateChange(this, prev, indexState))
      $installedField($getState(this, choiceKindState))?.choice?.paint(
        dom,
        $getState(this, indexState),
      );

    return false;
  }
  override getDOMSlot(dom: HTMLElement) {
    // SAFETY: createDOM always installs an HTML element with data-text as this node's editable slot.
    return super.getDOMSlot(dom).withElement(dom.querySelector("[data-text]") as HTMLElement);
  }
  override insertNewAfter(_: RangeSelection, restoreSelection = true) {
    const next = $setDepth($createOptionNode($getState(this, choiceKindState)), $depth(this));
    ($nested(this).at(-1) ?? this).insertAfter(next, restoreSelection);

    return next;
  }
}

/** Every non-text block (file upload, page breaks, logic, calculated fields): a React island picked by `widget`, its settings in settingsState. */
export class WidgetNode extends DecoratorNode<ReactNode> {
  override $config() {
    return this.config("widget", {
      extends: DecoratorNode,
      stateConfigs: [{ stateConfig: widgetState, flat: true }],
    });
  }
  override createDOM(_: unknown, editor: LexicalEditor) {
    const definition = installedEditorDefinition(editor);

    const claim =
      definition &&
      formDefinition(definition).structural.find(
        (claim) =>
          claim.storage.type === this.getType() &&
          claim.storage.property === "widget" &&
          claim.storage.value === $getState(this, widgetState),
      );

    const dom = el("div", cn(container, "cursor-default", claim?.containerClassName));
    dom.append($logicMount());

    return dom;
  }
  override updateDOM() {
    return false;
  }
  override isInline() {
    return false;
  }
  override decorate() {
    return (
      <RendererHost
        name={`widget:${$getState(this, widgetState)}`}
        props={{ nodeKey: this.getKey(), settings: $settings(this) }}
      />
    );
  }
}

export const $createLongAnswerNode = () => $create(LongAnswerNode);

export const $createInputNode = (kind: InputKind = "text") =>
  $setState($create(InputNode), inputKindState, kind);

export const $createOptionNode = (kind: ChoiceKind = "checkboxes"): OptionNode =>
  $setState($create(OptionNode), choiceKindState, kind);

export const $createWidgetNode = (widget: WidgetKind) =>
  $setState($create(WidgetNode), widgetState, widget);

export const $isOptionNode = (node: LexicalNode | null | undefined): node is OptionNode =>
  node instanceof OptionNode;

export const $isWidgetNode = (node: LexicalNode | null | undefined): node is WidgetNode =>
  node instanceof WidgetNode;
