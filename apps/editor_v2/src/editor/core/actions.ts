import {
  $getEditor,
  $getNodeByKey,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import type { ReactNode } from "react";
import type { EditorDefinition } from "./definition";
import { editorDefinition } from "./context";

export type ActionRequest = { targetKey: NodeKey; mode?: string };

export type ActionContext = { editor: LexicalEditor; target: LexicalNode; request: ActionRequest };

export type ActionResult = { afterClose?: () => void };

type ActionMetadata = {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  readonly order?: number;
  readonly description?: string;
  readonly keywords?: string;
  readonly icon?: ReactNode;
  readonly preview?: ReactNode;
  /** These callbacks run in this editor's Lexical context. */
  readonly $available?: (context: ActionContext) => boolean;
};

export type EditorAction = ActionMetadata &
  (
    | {
        readonly $execute: (context: ActionContext) => ActionResult | void;
        readonly $prepare?: never;
      }
    | {
        /** Validate and prepare before the caller removes a trigger or changes selection. */
        readonly $prepare: (context: ActionContext) => () => ActionResult | void;
        readonly $execute?: never;
      }
  );

export type ActionOutcome = { executed: boolean; result?: ActionResult; error?: string };

function $context(editor: LexicalEditor, request: ActionRequest): ActionContext | undefined {
  const target = $getNodeByKey(request.targetKey);

  return editor.isEditable() && target?.isAttached() ? { editor, target, request } : undefined;
}

export function $availableActions(
  editor: LexicalEditor,
  definition: EditorDefinition,
  request: ActionRequest,
) {
  if (editorDefinition(editor) !== definition)
    throw new Error("Actions must use this editor's installed definition");
  const context = $context(editor, request);

  return context ? definition.actions.filter((action) => action.$available?.(context) ?? true) : [];
}

/** Run synchronously inside an existing editor update, including Lexical's slash callback. */
export function $executeAction(
  editor: LexicalEditor,
  definition: EditorDefinition,
  id: string,
  request: ActionRequest,
  beforeExecute?: () => void,
): ActionOutcome {
  if (editorDefinition(editor) !== definition)
    throw new Error("Actions must use this editor's installed definition");

  if ($getEditor() !== editor) throw new Error("Actions must run in their owning editor's update");
  const action = definition.actions.find((item) => item.id === id);
  const context = $context(editor, request);

  if (!action || !context || (action.$available && !action.$available(context)))
    return { executed: false };
  let commit: () => ActionResult | void;

  try {
    commit = action.$prepare ? action.$prepare(context) : () => action.$execute(context);
  } catch (error) {
    return { executed: false, error: error instanceof Error ? error.message : String(error) };
  }

  const current = $context(editor, request);

  if (!current || (action.$available && !action.$available(current))) return { executed: false };
  beforeExecute?.();
  const result = commit();

  return result ? { executed: true, result } : { executed: true };
}

/** Open one update for UI handlers that are outside Lexical's update context. */
export function executeAction(
  editor: LexicalEditor,
  definition: EditorDefinition,
  id: string,
  request: ActionRequest,
  beforeExecute?: () => void,
): ActionOutcome {
  if (editorDefinition(editor) !== definition)
    throw new Error("Actions must use this editor's installed definition");
  let outcome: ActionOutcome = { executed: false };
  editor.update(
    () => {
      outcome = $executeAction(editor, definition, id, request, beforeExecute);
    },
    { discrete: true },
  );

  return outcome;
}

export function matchesAction(action: Pick<EditorAction, "title" | "keywords">, query: string) {
  const text = `${action.title} ${action.keywords ?? ""}`.toLowerCase();

  return query
    .toLowerCase()
    .split(" ")
    .every((word) => text.includes(word.trim()));
}

export function sectioned<T extends { group: string }>(items: readonly T[]) {
  const out: { group: string; items: { item: T; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const last = out.at(-1);

    if (last?.group === item.group) last.items.push({ item, index });
    else out.push({ group: item.group, items: [{ item, index }] });
  });

  return out;
}
