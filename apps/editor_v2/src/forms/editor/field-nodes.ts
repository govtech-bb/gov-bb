export { LongAnswerNode } from "./nodes";

import {
  $createInputNode,
  $createLongAnswerNode,
  $createOptionNode,
  $createQuestionNode,
  $createWidgetNode,
  settingsState,
} from "./nodes";
import { $setState, $createTextNode } from "lexical";
import type { Settings } from "../core/settings";

export const $createDrawnInput = (kind: string, settings: Settings = {}) =>
  $setState($createInputNode(kind), settingsState, structuredClone(settings));

export const $createDecoratorField = (kind: string, settings: Settings = {}) =>
  $setState($createWidgetNode(kind), settingsState, structuredClone(settings));

export const $createFieldLabel = () => $createQuestionNode();

export const $createLongAnswerInput = (settings: Settings = {}) =>
  $setState($createLongAnswerNode(), settingsState, structuredClone(settings));

export const $createChoiceInput = (
  kind: string,
  settings: Settings = {},
  labels: readonly string[] = [""],
) =>
  labels.map((label) =>
    $setState($createOptionNode(kind), settingsState, structuredClone(settings)).append(
      $createTextNode(label),
    ),
  );
