import { $getEditor, type LexicalNode } from "lexical";
import { editorDefinition } from "../../../editor/core/context";
import { $installedField } from "../../editor/field-context";
import {
  $blockGroup,
  $blockKind,
  $isFormTitleNode,
  $isPageBreak,
  $isQuestionNode,
  $pageBlocks,
  $pageType,
  $settings,
} from "../../editor/nodes";
import {
  autoAddAnother,
  autoQuestion,
  fieldArrayDrawing,
  fieldArrayOf,
  repeatableOf,
  entriesText,
  type PageRepeat,
  type RepeatEnd,
  type RepeatableBehaviour,
  type FieldArrayBehaviour,
} from "../../core/repetition";

export const fieldArrayKinds = {
  has: (kind: string) => $installedField(kind)?.capabilities.repeat ?? false,
};

/** Repetition is a declared capability, independent of its module's implementation key. */
export const $hasRepetition = () =>
  editorDefinition($getEditor()).capabilities.includes("form-repetition");

export function $labelOf(input: LexicalNode) {
  const kind = $blockKind(input);

  return (
    $blockGroup(input).find($isQuestionNode)?.getTextContent().trim() ||
    String($settings(input).name ?? "").trim() ||
    $installedField(kind)?.label ||
    kind
  );
}

export const $fieldArrayOf = (input: LexicalNode) =>
  fieldArrayKinds.has($blockKind(input)) ? fieldArrayOf($settings(input)) : undefined;

export function $fieldArrayMenu(input: LexicalNode) {
  if (!$hasRepetition() || !fieldArrayKinds.has($blockKind(input))) return;
  const value = $fieldArrayOf(input);

  return { ...(value && { value }), auto: autoAddAnother($labelOf(input)) };
}

export function $fieldArrayDrawingOf(input: LexicalNode) {
  const value = $fieldArrayOf(input);

  return value ? fieldArrayDrawing($labelOf(input), value) : null;
}

export function $pageRepeat(start: LexicalNode): PageRepeat | undefined {
  if (
    !$hasRepetition() ||
    (!$isFormTitleNode(start) && !$isPageBreak(start)) ||
    $pageType(start) !== "questions"
  )
    return;
  const value = repeatableOf($settings(start));

  return {
    ...(value && { value }),
    question: value?.addAnotherLabel ?? autoQuestion(value?.instanceLabel),
  };
}

export function $repeatEnd(start: LexicalNode): RepeatEnd | null {
  const repeat = $pageRepeat(start);

  if (!repeat?.value || $settings(start).folded || !$pageBlocks(start).length) return null;

  return repeat.value.min < repeat.value.max
    ? { caption: "Preview · " + entriesText(repeat.value), question: repeat.question }
    : { caption: "SSB repeats this page · " + entriesText(repeat.value) };
}

export function $pageBehaviours(start: LexicalNode): RepeatableBehaviour[] | undefined {
  const repeat = $pageRepeat(start);

  if (!repeat?.value) return;
  const { min, max, instanceLabel } = repeat.value;

  return [
    {
      type: "repeatable",
      min,
      max,
      ...(min < max && { addAnotherLabel: repeat.question }),
      ...(instanceLabel && { instanceLabel }),
    },
  ];
}

export function $questionBehaviours(input: LexicalNode): FieldArrayBehaviour[] | undefined {
  const value = $fieldArrayOf(input);

  if (!value) return;
  const { min, max } = value;

  return [
    {
      type: "fieldArray",
      min,
      max,
      ...(max > min && {
        addAnotherLabel: value.addAnotherLabel ?? autoAddAnother($labelOf(input)),
      }),
    },
  ];
}
