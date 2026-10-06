import { expect, test } from "vitest";
import { $getRoot, HISTORY_PUSH_TAG, REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { $isListItemNode, $isListNode } from "@lexical/list";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { parsePageMarkdown } from "../../src/pages/markdown";
import { $setPageMetadata } from "../../src/pages/metadata";

function page(source: string) {
  const prepared = govbbPageCodec.prepare(source);

  if (prepared.mode === "source") throw new Error("Expected editable lists");

  return createHeadlessEditor(govbbPageEditor, prepared.state);
}

function list(source: string) {
  const node = parsePageMarkdown(source).children.find((child) => child.type === "list");

  if (node?.type !== "list") throw new Error("Expected Markdown list");

  return node;
}

for (const marker of ["-", "1."])
  test(`${marker} lists preserve item hierarchy through indentation, reload, outdent and undo`, async () => {
    const original = `${marker} One\n${marker} Two\n${marker} Three\n`;
    const editor = page(original);

    try {
      editor.update(
        () => {
          const rootList = $getRoot().getLastChild();
          const second = $isListNode(rootList) ? rootList.getChildAtIndex(1) : null;

          if (!$isListItemNode(second)) throw new Error("Expected second item");
          second.setIndent(1);
        },
        { discrete: true, tag: HISTORY_PUSH_TAG },
      );
      const indented = govbbPageCodec.encode(editor.getEditorState().toJSON());
      const result = list(indented);
      expect(result.ordered).toBe(marker === "1.");
      expect(result.children).toHaveLength(2);
      expect(result.children[0]!.children.map((node) => node.type)).toEqual(["paragraph", "list"]);
      expect(result.children[1]!.children).toMatchObject([
        { type: "paragraph", children: [{ type: "text", value: "Three" }] },
      ]);
      const nested = result.children[0]!.children[1];
      expect(nested).toMatchObject({
        type: "list",
        children: [{ children: [{ type: "paragraph", children: [{ value: "Two" }] }] }],
      });
      editor.dispatchCommand(UNDO_COMMAND, undefined);
      await Promise.resolve();
      expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(original);
      editor.dispatchCommand(REDO_COMMAND, undefined);
      await Promise.resolve();
      expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(indented);

      const reopened = page(indented);

      try {
        reopened.update(
          () => {
            const rootList = $getRoot().getLastChild();
            const wrapper = $isListNode(rootList) ? rootList.getChildAtIndex(1) : null;
            const inner = $isListItemNode(wrapper) ? wrapper.getFirstChild() : null;
            const item = $isListNode(inner) ? inner.getFirstChild() : null;

            if (!$isListItemNode(item)) throw new Error("Expected nested item");
            item.setIndent(0);
          },
          { discrete: true, tag: HISTORY_PUSH_TAG },
        );
        const restored = list(govbbPageCodec.encode(reopened.getEditorState().toJSON()));
        expect(restored.children).toHaveLength(3);
        expect(restored.children).toMatchObject(
          ["One", "Two", "Three"].map((value) => ({
            children: [{ type: "paragraph", children: [{ type: "text", value }] }],
          })),
        );
        reopened.dispatchCommand(UNDO_COMMAND, undefined);
        await Promise.resolve();
        expect(govbbPageCodec.encode(reopened.getEditorState().toJSON())).toBe(indented);
      } finally {
        reopened.dispose();
      }
    } finally {
      editor.dispose();
    }
  });

test("nested lists retain multi-paragraph instructions, mixed list kinds and multiple levels", () => {
  const original =
    "1. First paragraph\n\n   Second paragraph\n\n   - Nested bullet\n     - Deeper bullet\n\n   1. Nested number\n\n2. Next instruction\n";

  const editor = page(original);

  try {
    expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(original);
    editor.update(() => $setPageMetadata({ title: "Edited title" }), { discrete: true });
    const encoded = govbbPageCodec.encode(editor.getEditorState().toJSON());
    const result = list(encoded);
    expect(result.children).toHaveLength(2);
    expect(result.children[0]!.children.map((node) => node.type)).toEqual([
      "paragraph",
      "paragraph",
      "list",
      "list",
    ]);
    expect(result.children[0]!.children[2]).toMatchObject({
      type: "list",
      ordered: false,
      children: [{ children: [{ type: "paragraph" }, { type: "list", ordered: false }] }],
    });
    expect(result.children[0]!.children[3]).toMatchObject({ type: "list", ordered: true });
    const reopened = page(encoded);

    try {
      expect(reopened.getEditorState().toJSON().root.children.slice(1)).toEqual(
        editor.getEditorState().toJSON().root.children.slice(1),
      );
    } finally {
      reopened.dispose();
    }
  } finally {
    editor.dispose();
  }
});
