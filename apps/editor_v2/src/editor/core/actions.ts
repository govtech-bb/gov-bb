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

export type ActionRequest = {
  targetKey: NodeKey;
  mode?: string;
  /** What was typed to open the menu, such as "/h2". It goes before the action runs, so it isn't the line's text. */
  typed?: string;
};

export type ActionContext = { editor: LexicalEditor; target: LexicalNode; request: ActionRequest };

export type ActionResult = { afterClose?: () => void };

type ActionMetadata = {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  readonly order?: number;
  readonly description?: string;
  /** More words a search finds it by, such as what it's often used for. */
  readonly keywords?: string;
  /** Other names writers call it, which a search puts first, such as "h2" or "divider". */
  readonly aliases?: readonly string[];
  /** The Markdown that makes it at the start of a line, such as "##": the menus show it beside the title. */
  readonly markdown?: string;
  /** Found by searching, but left out of the list a menu shows before anything is typed. */
  readonly searchOnly?: boolean;
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

/** What a search reads in an action, or in a field a picker lists. */
type Searchable = Pick<
  ActionMetadata,
  "description" | "keywords" | "aliases" | "markdown" | "searchOnly"
> & { readonly title: string };

// Case and accents aside, as a search box should
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

/**
 * How well a search finds an action: an alias or its Markdown typed in full ("h2", "##"),
 * then its title, the start of its title, its initials ("bl" for Bulleted list), the start of one of its words and
 * the start of an alias. From three letters, it also finds the query in the title, its words in the title and
 * keywords, the description, and last the title's letters in order. 0 is no match.
 */
function score(query: string, action: Searchable) {
  const typed = fold(query);

  if (!typed) return action.searchOnly ? 0 : 1;
  const title = fold(action.title);
  const words = title.split(" ");
  const names = [...(action.aliases ?? []), action.markdown ?? []].flat().map(fold);

  if (names.includes(typed)) return 100;

  if (title === typed) return 95;

  if (title.startsWith(typed)) return 90;

  if (
    typed.length > 1 &&
    words
      .map((word) => word[0])
      .join("")
      .startsWith(typed)
  )
    return 85;

  if (words.some((word) => word.startsWith(typed))) return 80;

  if (names.some((name) => name.startsWith(typed))) return 70;

  // One or two letters would find too much in the middle of words
  if (typed.length < 3) return 0;

  if (title.includes(typed)) return 60;
  const text = `${title} ${fold(action.keywords ?? "")}`;

  if (typed.split(" ").every((word) => text.includes(word))) return 50;

  if (fold(action.description ?? "").includes(typed)) return 40;
  let found = 0;

  for (const character of title)
    if (character === typed[found] && ++found === typed.length) return 20;

  return 0;
}

/**
 * The actions a search finds, best first, with ties in their own order: the one ranking for the insert menus and the
 * field pickers. With nothing typed, the actions a menu lists, in order.
 */
export function rankActions<T extends Searchable>(query: string, actions: readonly T[]): T[] {
  return actions
    .flatMap((action, order) => {
      const found = score(query, action);

      return found ? [{ action, order, found }] : [];
    })
    .toSorted((a, b) => b.found - a.found || a.order - b.order)
    .map((entry) => entry.action);
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
