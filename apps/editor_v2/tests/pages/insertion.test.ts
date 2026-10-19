import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  UNDO_COMMAND,
  type LexicalNode,
} from "lexical";
import { $createListItemNode, $isListItemNode, $isListNode } from "@lexical/list";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import {
  $availableActions,
  executeAction,
  type ActionRequest,
} from "../../src/editor/core/actions";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { createEmptyPage } from "../../src/pages/converters";
import { $pageInsertionTarget } from "../../src/pages/insertion";
import { PageComponentNode } from "../../src/pages/nodes";

function page(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode === "source") throw new Error("Expected editable page");

  return createHeadlessEditor(govbbPageEditor, prepared.state);
}

test("page insertion preserves nested list paragraphs and undo removes only the inserted block", async () => {
  const editor = page("---\ntitle: Steps\n---\n\n1. First paragraph\n\n   Another paragraph\n");

  try {
    let targetKey = "";
    editor.update(
      () => {
        const list = $getRoot().getLastChild();
        const item = $isElementNode(list) ? list.getFirstChild() : null;
        const paragraph = $isElementNode(item) ? item.getFirstChild() : null;

        if (!$isElementNode(paragraph)) throw new Error("Expected nested paragraph");
        paragraph.selectEnd();
        targetKey = $pageInsertionTarget()!.getKey();
        expect(targetKey).toBe(paragraph.getKey());
      },
      { discrete: true },
    );
    const before = editor.getEditorState().toJSON();
    expect(executeAction(editor, govbbPageEditor, "page-h2", { targetKey }).executed).toBe(true);
    editor.getEditorState().read(() => {
      const list = $getRoot().getLastChild();
      const item = $isElementNode(list) ? list.getFirstChild() : null;
      expect($isElementNode(item) && item.getChildren().map((node) => node.getType())).toEqual([
        "paragraph",
        "heading",
        "paragraph",
      ]);
    });
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    editor.dispose();
  }
});

test("cell insertion offers only Markdown-compatible text while root tables offer all blocks", () => {
  const editor = page(
    "---\ntitle: Fees\n---\n\n| Service | Cost |\n| --- | --- |\n| Copy | $5 |\n",
  );

  try {
    editor.getEditorState().read(
      () => {
        const table = $getRoot().getLastChild();
        const row = $isElementNode(table) ? table.getFirstChild() : null;
        const cell = $isElementNode(row) ? row.getFirstChild() : null;
        const text = $isElementNode(cell) ? cell.getFirstChild() : null;

        if (!text || !table) throw new Error("Expected table text");
        expect(
          $availableActions(editor, govbbPageEditor, { targetKey: text.getKey() }).map(
            (action) => action.id,
          ),
        ).toEqual(["page-paragraph"]);
        expect(
          $availableActions(editor, govbbPageEditor, { targetKey: table.getKey() }).length,
        ).toBe(govbbPageEditor.actions.length);
      },
      { editor },
    );
  } finally {
    editor.dispose();
  }
});

test("consecutive block insertions are separate undo steps and metadata is never an insertion target", async () => {
  const editor = createHeadlessEditor(govbbPageEditor, createEmptyPage("New page"));

  try {
    const before = editor.getEditorState().toJSON();

    const first = editor.getEditorState().read(
      () => {
        expect(
          $availableActions(editor, govbbPageEditor, {
            targetKey: $getRoot().getFirstChild()!.getKey(),
          }),
        ).toEqual([]);

        return $getRoot().getLastChild()!.getKey();
      },
      { editor },
    );

    executeAction(editor, govbbPageEditor, "page-h2", { targetKey: first });
    const heading = editor.getEditorState().toJSON();
    const second = editor.getEditorState().read(() => $getRoot().getLastChild()!.getKey());
    executeAction(editor, govbbPageEditor, "page-notice", { targetKey: second });
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(heading);
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    editor.dispose();
  }
});

/** Run an action at a target found in the page, as the menus do, and return the page's Markdown and block types. */
function insert(
  source: string,
  id: string,
  $target: () => LexicalNode,
  request: Omit<ActionRequest, "targetKey"> = {},
) {
  const editor = page(source);

  try {
    let targetKey = "";
    editor.update(
      () => {
        const target = $target();

        if ($isElementNode(target)) target.selectEnd();
        targetKey = target.getKey();
      },
      { discrete: true },
    );
    expect(executeAction(editor, govbbPageEditor, id, { targetKey, ...request }).executed).toBe(
      true,
    );

    return {
      markdown: govbbPageCodec.encode(editor.getEditorState().toJSON()),
      blocks: editor
        .getEditorState()
        .read(() => $getRoot().getChildren().slice(1).map(describe), { editor }),
    };
  } finally {
    editor.dispose();
  }
}

const describe = (node: LexicalNode): string =>
  node instanceof PageComponentNode
    ? node.getKind()
    : $isListNode(node)
      ? `${node.getListType()} list`
      : node.getType();

/** An empty line added at the end of the first block of a type, as Enter there would. */
function $emptyLineIn(type: string) {
  const container = $getRoot()
    .getChildren()
    .find((node) => node.getType() === type);

  if (!$isElementNode(container)) throw new Error(`Expected ${type}`);

  const line = $isListNode(container) ? $createListItemNode() : $createParagraphNode();
  container.append(line);

  return line;
}

test("a block chosen on a list's empty last line goes below the list, not inside its last item", () => {
  const result = insert("- One\n- Two\n", "page-start", () => $emptyLineIn("list"));
  expect(result.blocks).toEqual(["bullet list", "start"]);
  expect(result.markdown).toBe("- One\n- Two\n\n<a data-start-link>Start now</a>\n");
});

test("a block chosen on an empty line inside a numbered list splits it, and the steps after keep their numbers", () => {
  const result = insert("1. One\n2. Two\n3. Three\n", "page-notice", () => {
    const list = $getRoot().getLastChild();
    const two = $isListNode(list) ? list.getChildAtIndex(1) : null;

    if (!$isListItemNode(two)) throw new Error("Expected the second step");
    const line = $createListItemNode();
    two.insertAfter(line);

    return line;
  });

  expect(result.blocks).toEqual(["number list", "notice", "number list"]);
  expect(result.markdown).toBe("1. One\n2. Two\n\n:::notice\n\n:::\n\n3. Three\n");
});

test("an empty last line leaves a quote or Notice, but a Details keeps the blocks chosen in it", () => {
  expect(insert("> Quoted\n", "page-h2", () => $emptyLineIn("quote")).blocks).toEqual([
    "quote",
    "heading",
  ]);
  expect(
    insert(":::notice\nImportant\n:::\n", "page-start", () => $emptyLineIn("page-component"))
      .blocks,
  ).toEqual(["notice", "start"]);
  expect(
    insert(':::details{summary="Help"}\nText\n:::\n', "page-bullet-list", () =>
      $emptyLineIn("page-component"),
    ).markdown,
  ).toBe(':::details{summary="Help"}\nText\n\n-\n:::\n');
});

test("an empty Notice chosen over takes the Notice's place rather than leaving it empty", () => {
  expect(
    insert(":::notice\n:::\n", "page-h2", () => {
      const notice = $getRoot().getLastChild();

      if (!$isElementNode(notice)) throw new Error("Expected a Notice");

      return notice.getFirstChild()!;
    }).blocks,
  ).toEqual(["heading"]);
});

test("a line with text keeps the chosen block beside it in its list item", () => {
  const result = insert("- One\n", "page-start", () => {
    const list = $getRoot().getLastChild();

    return $isListNode(list) ? list.getFirstChild()! : list!;
  });

  expect(result.blocks).toEqual(["bullet list"]);
  expect(result.markdown).toBe("- One\n\n  <a data-start-link>Start now</a>\n");
});

test("“+” adds a block below its block on the page, or above it, never inside a list item", () => {
  const $item = () => {
    const list = $getRoot().getLastChild();

    return $isListNode(list) ? list.getFirstChild()! : list!;
  };

  expect(insert("Intro\n\n- One\n", "page-h2", $item, { mode: "below" }).blocks).toEqual([
    "paragraph",
    "bullet list",
    "heading",
  ]);
  expect(insert("Intro\n\n- One\n", "page-h2", $item, { mode: "above" }).blocks).toEqual([
    "paragraph",
    "heading",
    "bullet list",
  ]);
});

test("what was typed to open the menu doesn't count as text, so an empty quote line can take any block", () => {
  const editor = page("> Quoted\n");

  try {
    editor.update(
      () => {
        $emptyLineIn("quote").append($createTextNode("/no")).selectEnd();
      },
      { discrete: true },
    );
    editor.getEditorState().read(
      () => {
        const targetKey = $pageInsertionTarget()!.getKey();

        const ids = (typed?: string) =>
          $availableActions(editor, govbbPageEditor, { targetKey, typed }).map(
            (action) => action.id,
          );

        expect(ids("/no")).toContain("page-notice");
        expect(ids()).not.toContain("page-notice");
      },
      { editor },
    );
  } finally {
    editor.dispose();
  }
});
