import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  REDO_COMMAND,
  UNDO_COMMAND,
  mergeRegister,
  type EditorState,
  type LexicalEditor,
} from "lexical";

/** An undo snapshot with its timestamp and optional structural boundary. */
export type Step<T = EditorState> = { state: T; at: number; boundary?: boolean };

/** Coalesce typing while preserving the starting state and explicit structural boundaries. */
export function pushStep<T>(
  steps: Step<T>[],
  index: number,
  before: T,
  state: T,
  at: number,
  boundary = false,
) {
  const branched = index < steps.length - 1;
  steps.splice(index + 1);

  if (!steps.length) steps.push({ state: before, at });
  const current = steps.at(-1)!;

  if (steps.length > 1 && !branched && !boundary && !current.boundary && current.at >= at - 800) {
    steps[steps.length - 1] = { state, at };
  } else {
    const step: Step<T> = { state, at };

    if (boundary) step.boundary = true;
    steps.push(step);
  }

  if (steps.length > 50) steps.shift();

  return steps.length - 1;
}

/**
 * Records content changes while ignoring selection-only updates. History-merge updates
 * join the current step so transforms and widget normalisation do not add extra undo steps.
 * Uses Lexical's undo, redo and availability commands.
 */
export function registerEditorHistory(editor: LexicalEditor) {
  const steps: Step[] = [];
  let index = 0;
  // The content of the latest state (no selection in it), to tell changes that change nothing
  let content = JSON.stringify(editor.getEditorState());

  const tell = () => {
    editor.dispatchCommand(CAN_UNDO_COMMAND, index > 0);
    editor.dispatchCommand(CAN_REDO_COMMAND, index < steps.length - 1);
  };

  const go = (to: number) => {
    const step = steps[to];

    if (!step) return true;
    index = to;
    content = JSON.stringify(step.state);
    tell(); // before the restore, which commits and leaves this command's context read-only
    editor.setEditorState(step.state, { tag: HISTORIC_TAG });

    return true;
  };

  return mergeRegister(
    editor.registerUpdateListener(
      ({ editorState, prevEditorState, dirtyElements, dirtyLeaves, tags }) => {
        if (tags.has(HISTORIC_TAG) || (!dirtyElements.size && !dirtyLeaves.size)) return;
        const next = JSON.stringify(editorState);

        if (next === content) return;
        content = next;
        const current = steps[index];

        if (tags.has(HISTORY_MERGE_TAG)) {
          if (current) current.state = editorState;

          return;
        }

        index = pushStep(
          steps,
          index,
          prevEditorState,
          editorState,
          Date.now(),
          tags.has(HISTORY_PUSH_TAG),
        );
        tell();
      },
    ),
    editor.registerCommand(UNDO_COMMAND, () => go(index - 1), COMMAND_PRIORITY_EDITOR),
    editor.registerCommand(REDO_COMMAND, () => go(index + 1), COMMAND_PRIORITY_EDITOR),
  );
}
