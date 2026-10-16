import { expect, test } from "vitest";
import { $getRoot, HISTORY_PUSH_TAG, REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { $isListItemNode, $isListNode } from "@lexical/list";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { govbbPageCodec, govbbPageEditor } from "../../src/presets/govbb-page";
import { parsePageMarkdown } from "../../src/pages/markdown";
import { $setPageMetadata } from "../../src/pages/metadata";
import { $nearestPageList, $setPageListType } from "../../src/pages/modules/lists";

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

test.each([
  { type: "number" as const, marker: "-", target: "Parent" },
  { type: "bullet" as const, marker: "3.", target: "Parent" },
  { type: "number" as const, marker: "-", target: "Nested" },
  { type: "bullet" as const, marker: "3.", target: "Nested" },
])(
  "converting $target to $type preserves content, nested lists, undo and reload",
  async ({ type, marker, target }) => {
    const original =
      target === "Parent"
        ? `${marker} Parent\n\n   More instructions\n\n   - Nested\n\n${marker} Sibling\n`
        : `5. Parent\n\n   ${marker} Nested\n\n      <a data-start-link href="/apply">Start now</a>\n\n      - Deeper\n\n   ${marker} Nested sibling\n\n6. Sibling\n`;

    const editor = page(original);

    try {
      editor.update(
        () => {
          const text = $getRoot()
            .getAllTextNodes()
            .find((node) => node.getTextContent() === target);

          const selected = $nearestPageList(text ?? null);

          if (!text || !selected) throw new Error("Missing list conversion target");
          const key = selected.getKey();
          const children = selected.getChildrenKeys();
          const content = selected.getTextContent();
          expect($setPageListType(text, type)).toBe(true);
          expect($nearestPageList(text)?.getKey()).toBe(key);
          expect(selected.getChildrenKeys()).toEqual(children);
          expect(selected.getTextContent()).toBe(content);
          expect($setPageListType(text, type)).toBe(false);
        },
        { discrete: true, tag: HISTORY_PUSH_TAG },
      );
      const encoded = govbbPageCodec.encode(editor.getEditorState().toJSON());
      const result = list(encoded);

      expect(result.children).toHaveLength(2);
      expect(result.children[1]!.children).toMatchObject([
        { type: "paragraph", children: [{ value: "Sibling" }] },
      ]);

      if (target === "Parent") {
        expect(result.ordered).toBe(type === "number");

        if (type === "number") expect(result.start).toBe(1);
        expect(result.children[0]!.children).toMatchObject([
          { type: "paragraph", children: [{ value: "Parent" }] },
          { type: "paragraph", children: [{ value: "More instructions" }] },
          { type: "list", ordered: false },
        ]);
      } else {
        expect(result).toMatchObject({ ordered: true, start: 5 });
        const nested = result.children[0]!.children.find((node) => node.type === "list");
        expect(nested?.ordered).toBe(type === "number");

        if (type === "number") expect(nested?.start).toBe(1);
        expect(nested?.children).toHaveLength(2);
        expect(nested?.children[0]!.children.at(-1)).toMatchObject({
          type: "list",
          ordered: false,
        });
        expect(encoded).toContain('<a data-start-link href="/apply">Start now</a>');
      }

      const reopened = page(encoded);

      try {
        expect(reopened.getEditorState().toJSON().root.children.slice(1)).toEqual(
          editor.getEditorState().toJSON().root.children.slice(1),
        );
      } finally {
        reopened.dispose();
      }

      editor.dispatchCommand(UNDO_COMMAND, undefined);
      await Promise.resolve();
      expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(original);
      editor.dispatchCommand(REDO_COMMAND, undefined);
      await Promise.resolve();
      expect(govbbPageCodec.encode(editor.getEditorState().toJSON())).toBe(encoded);
    } finally {
      editor.dispose();
    }
  },
);

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
