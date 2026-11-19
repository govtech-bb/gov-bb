import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  CUT_TAG,
  FORMAT_TEXT_COMMAND,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  PASTE_TAG,
  REDO_COMMAND,
  UNDO_COMMAND,
  mergeRegister,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import { editorSession, type EditorSession } from "./session";

/** Starts a new undo step that typing can continue, where HISTORY_PUSH_TAG's step stands alone. */
export const HISTORY_START_TAG = "history-start";

/**
 * How a change joins the undo history. Typing merges into the step before it, within 800ms. A start begins a new step
 * that typing can continue, such as typing after the caret has moved. A step alone, such as a paste or an inserted
 * block, is never merged into.
 */
export type StepKind = "typing" | "start" | "alone";

/** An undo snapshot with its timestamp, and whether it stands alone. */
export type Step<T = EditorState> = { state: T; at: number; alone?: boolean };

/** Coalesce typing while preserving the starting state and the steps that stand alone. */
export function pushStep<T>(
  steps: Step<T>[],
  index: number,
  before: T,
  state: T,
  at: number,
  kind: StepKind = "typing",
) {
  const branched = index < steps.length - 1;
  steps.splice(index + 1);

  if (!steps.length) steps.push({ state: before, at });
  const current = steps.at(-1)!;

  if (
    steps.length > 1 &&
    !branched &&
    kind === "typing" &&
    !current.alone &&
    current.at >= at - 800
  ) {
    steps[steps.length - 1] = { state, at };
  } else {
    const step: Step<T> = { state, at };

    if (kind === "alone") step.alone = true;
    steps.push(step);
  }

  if (steps.length > 50) steps.shift();

  return steps.length - 1;
}

// Where the caret is, so that typing somewhere else starts a new step, as in Lexical's own history
const caretIn = (state: EditorState) =>
  state.read(() => {
    const selection = $getSelection();

    return $isRangeSelection(selection)
      ? `${selection.anchor.key}:${selection.anchor.offset}:${selection.focus.key}:${selection.focus.offset}`
      : "";
  });

const histories = new WeakMap<LexicalEditor, EditorSession["history"]>();

/** Whether the editor's history has a step to undo and one to redo, such as a history carried on from a session. */
export function historyAvailable(editor: LexicalEditor) {
  const history = histories.get(editor);

  return {
    undo: !!history && history.index > 0,
    redo: !!history && history.index < history.steps.length - 1,
  };
}

/**
 * Records content changes while ignoring selection-only updates. History-merge updates
 * join the current step so transforms and widget normalisation do not add extra undo steps.
 * A paste, a cut and a format change each stand alone, as Lexical's own history keeps them.
 * Uses Lexical's undo, redo and availability commands. In a session, the history goes on from where the document's
 * last editor left it.
 */
export function registerEditorHistory(editor: LexicalEditor) {
  const history: EditorSession["history"] = editorSession(editor)?.history ?? {
    steps: [],
    index: 0,
  };

  const { steps } = history;
  // The content of the latest state (no selection in it), to tell changes that change nothing
  let content = JSON.stringify(editor.getEditorState());
  let caret = caretIn(editor.getEditorState());

  const tell = () => {
    const available = historyAvailable(editor);
    editor.dispatchCommand(CAN_UNDO_COMMAND, available.undo);
    editor.dispatchCommand(CAN_REDO_COMMAND, available.redo);
  };

  const go = (to: number) => {
    const step = steps[to];

    if (!step) return true;
    history.index = to;
    content = JSON.stringify(step.state);
    caret = caretIn(step.state);
    tell(); // before the restore, which commits and leaves this command's context read-only
    editor.setEditorState(step.state, { tag: HISTORIC_TAG });

    return true;
  };

  histories.set(editor, history);

  return mergeRegister(
    () => histories.delete(editor),
    editor.registerUpdateListener(
      ({ editorState, prevEditorState, dirtyElements, dirtyLeaves, tags }) => {
        if (tags.has(HISTORIC_TAG) || (!dirtyElements.size && !dirtyLeaves.size)) return;
        const next = JSON.stringify(editorState);

        if (next === content) return;
        content = next;
        const moved = caretIn(prevEditorState) !== caret;
        caret = caretIn(editorState);
        const current = steps[history.index];

        if (tags.has(HISTORY_MERGE_TAG)) {
          if (current) current.state = editorState;

          return;
        }

        const kind: StepKind =
          tags.has(HISTORY_PUSH_TAG) || tags.has(PASTE_TAG) || tags.has(CUT_TAG)
            ? "alone"
            : tags.has(HISTORY_START_TAG) || moved
              ? "start"
              : "typing";

        history.index = pushStep(
          steps,
          history.index,
          prevEditorState,
          editorState,
          Date.now(),
          kind,
        );
        tell();
      },
    ),
    editor.registerCommand(
      FORMAT_TEXT_COMMAND,
      () => {
        $addUpdateTag(HISTORY_PUSH_TAG);

        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    ),
    editor.registerCommand(UNDO_COMMAND, () => go(history.index - 1), COMMAND_PRIORITY_EDITOR),
    editor.registerCommand(REDO_COMMAND, () => go(history.index + 1), COMMAND_PRIORITY_EDITOR),
  );
}
