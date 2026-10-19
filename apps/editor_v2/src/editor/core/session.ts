import {
  $createNodeSelection,
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  $setSelection,
  type LexicalEditor,
  type LexicalNode,
  type PointType,
} from "lexical";
import type { Step } from "./history";

/** A point by where it sits rather than by node key: the child index at each level down from the root. */
type PointPlace = { path: number[]; offset: number; type: "text" | "element" };

/** A selection as places, which still mean something to another editor opened on the same document. */
type SelectionPlace =
  | { kind: "range"; anchor: PointPlace; focus: PointPlace }
  | { kind: "nodes"; paths: number[][] };

/**
 * What a document's editor leaves behind when its view closes, so the next editor opened on it carries on: the undo
 * history, and where the selection was. A host keeps one per document, while its view is closed.
 */
export type EditorSession = {
  history: { steps: Step[]; index: number };
  selection?: SelectionPlace;
};

export const createEditorSession = (): EditorSession => ({ history: { steps: [], index: 0 } });

const sessions = new WeakMap<LexicalEditor, EditorSession>();

/** The session an editor carries on, if its host gave it one. */
export const editorSession = (editor: LexicalEditor) => sessions.get(editor);

const pathOf = (node: LexicalNode) => {
  const path: number[] = [];

  for (let at: LexicalNode | null = node; at && !$isRootNode(at); at = at.getParent())
    path.unshift(at.getIndexWithinParent());

  return path;
};

const nodeAt = (path: readonly number[]) => {
  let node: LexicalNode | null = $getRoot();

  for (const index of path) node = $isElementNode(node) ? node.getChildAtIndex(index) : null;

  return node;
};

const placeOf = (point: PointType): PointPlace => ({
  path: pathOf(point.getNode()),
  offset: point.offset,
  type: point.type,
});

function $selectionPlace(): SelectionPlace | undefined {
  const selection = $getSelection();

  if ($isRangeSelection(selection))
    return { kind: "range", anchor: placeOf(selection.anchor), focus: placeOf(selection.focus) };

  if ($isNodeSelection(selection))
    return { kind: "nodes", paths: selection.getNodes().map((node) => pathOf(node)) };
}

// The node a place points into, if it's still there and long enough for the offset
const $pointAt = (place: PointPlace) => {
  const node = nodeAt(place.path);

  if (place.type === "text")
    return $isTextNode(node) && place.offset <= node.getTextContentSize() ? node : undefined;

  return $isElementNode(node) && place.offset <= node.getChildrenSize() ? node : undefined;
};

function $restoreSelection(place: SelectionPlace) {
  if (place.kind === "nodes") {
    const nodes = place.paths.map((path) => nodeAt(path));

    if (!nodes.length || nodes.some((node) => !node || $isRootNode(node))) return;
    const selection = $createNodeSelection();

    for (const node of nodes) if (node) selection.add(node.getKey());
    $setSelection(selection);

    return;
  }

  const anchor = $pointAt(place.anchor);
  const focus = $pointAt(place.focus);

  if (!anchor || !focus) return;
  const selection = $createRangeSelection();
  selection.anchor.set(anchor.getKey(), place.anchor.offset, place.anchor.type);
  selection.focus.set(focus.getKey(), place.focus.offset, place.focus.type);
  $setSelection(selection);
}

/**
 * Lets an editor carry on its document's session: its history goes on from the session's, and closing the editor
 * leaves where its selection was for the next.
 */
export function registerEditorSession(editor: LexicalEditor, session: EditorSession) {
  sessions.set(editor, session);

  return () => {
    session.selection = editor.getEditorState().read($selectionPlace);
    sessions.delete(editor);
  };
}

/** Puts back the selection the session's last editor left, where the document still has room for it. */
export function $restoreEditorSelection(session: EditorSession) {
  if (session.selection) $restoreSelection(session.selection);
}
