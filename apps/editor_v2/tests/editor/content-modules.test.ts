import { expect, test } from "vitest";
import { $createLinkNode, $isLinkNode } from "@lexical/link";
import { $createHeadingNode } from "@lexical/rich-text";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isParagraphNode,
  $isRangeSelection,
  REDO_COMMAND,
  UNDO_COMMAND,
  type ElementNode,
} from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineEditor } from "../../src/editor/core/definition";
import { executeAction } from "../../src/editor/core/actions";
import { $depth, $setDepth, $settings, $setSettings } from "../../src/editor/core/document-state";
import { TextModule } from "../../src/editor/modules/text/module";
import { HistoryModule } from "../../src/editor/modules/history/module";
import { HeadingsModule } from "../../src/editor/modules/headings/module";
import { LinksModule } from "../../src/editor/modules/links/module";
import { ListsModule } from "../../src/editor/modules/lists/module";
import { CalloutsModule } from "../../src/editor/modules/callouts/module";
import { DisclosureModule } from "../../src/editor/modules/disclosure/module";
import { FormattingModule } from "../../src/editor/modules/formatting/module";
import {
  $createBulletNode,
  $createNumberNode,
  $listRun,
  listIndexState,
} from "../../src/editor/modules/lists/nodes";
import { $createInsetNode, $createWarningNode } from "../../src/editor/modules/callouts/nodes";
import {
  $createShowHideNode,
  $disclosureChildren,
  $isShowHideNode,
  $toggleShowHide,
} from "../../src/editor/modules/disclosure/nodes";
import { $enterHeading } from "../../src/editor/modules/headings/editing";
import { $enterList, $exitList } from "../../src/editor/modules/lists/editing";
import { $enterCallout, $exitCallout } from "../../src/editor/modules/callouts/editing";
import {
  $enterDisclosure,
  $exitDisclosureBody,
  $pasteDisclosure,
} from "../../src/editor/modules/disclosure/editing";
import { $textSelection } from "../../src/editor/modules/formatting/toolbar";

const definition = defineEditor(
  [
    TextModule(),
    HistoryModule(),
    HeadingsModule(),
    LinksModule(),
    ListsModule(),
    CalloutsModule(),
    DisclosureModule(),
    FormattingModule({ isPlainText: $isShowHideNode }),
  ],
  "content-module-tests",
);

const text = <T extends ElementNode>(node: T, value: string): T =>
  node.append($createTextNode(value));

const run = (editor: ReturnType<typeof createHeadlessEditor>, fn: () => void) =>
  editor.update(fn, { discrete: true });

test("content composition owns its nodes, editing and toolbar without form document or persistence", () => {
  const editor = createHeadlessEditor(definition);

  try {
    expect(definition.nodes.map((node) => node.type).sort()).toEqual([
      "bullet",
      "heading",
      "inset",
      "linebreak",
      "link",
      "number",
      "paragraph",
      "show-hide",
      "tab",
      "text",
      "warning",
    ]);
    expect(
      editor
        .getEditorState()
        .toJSON()
        .root.children.map((node) => node.type),
    ).toEqual(["paragraph"]);
    expect(definition.slots.map((slot) => slot.slot)).toEqual(["editor.overlay"]);
    expect(definition.registrations.filter((item) => item.key === "text-editing")).toHaveLength(1);
    expect(definition.registrations.filter((item) => item.key === "history")).toHaveLength(1);
    expect(definition.moduleKeys.some((key) => /^(form|storage|ssb|rule)(-|$)/.test(key))).toBe(
      false,
    );
    expect(() =>
      definition.validateDocument({
        root: { type: "root", children: [{ type: "form-title", children: [] }] },
      }),
    ).toThrow("Unsupported node form-title");
    expect(() =>
      definition.validateDocument({
        root: { type: "root", children: [{ type: "heading", tag: "h7", children: [] }] },
      }),
    ).toThrow("Unsupported heading subtype");
  } finally {
    editor.dispose();
  }
});

test("flat rich content, retained settings and links survive isolated serialization and reload", () => {
  const editor = createHeadlessEditor(definition);

  try {
    run(editor, () => {
      const link = $createLinkNode("https://example.test/help", {
        target: "_blank",
        rel: "noopener noreferrer",
      }).append($createTextNode("help").toggleFormat("bold"));

      const heading = $setSettings($createHeadingNode("h2"), {
        custom: { retained: ["v1", true] },
      }).append(link);

      $getRoot()
        .clear()
        .append(
          heading,
          text($createBulletNode(), "Bring an ID"),
          text($createNumberNode(), "Apply"),
          text($createInsetNode(), "Note"),
          text($createWarningNode(), "Deadline"),
          text($createShowHideNode(), "Help"),
          $setDepth(text($createParagraphNode(), "Details"), 1),
        );
    });
    const saved = editor.getEditorState().toJSON();
    const reloaded = createHeadlessEditor(definition, saved);

    try {
      expect(reloaded.getEditorState().toJSON()).toEqual(saved);
      reloaded.getEditorState().read(
        () => {
          const heading = $getRoot().getFirstChildOrThrow<ElementNode>();
          expect($settings(heading)).toEqual({ custom: { retained: ["v1", true] } });
          const link = heading.getFirstChild();
          expect($isLinkNode(link) && link.getURL()).toBe("https://example.test/help");
          expect($depth($getRoot().getLastChild()!)).toBe(1);
        },
        { editor: reloaded },
      );
    } finally {
      reloaded.dispose();
    }
  } finally {
    editor.dispose();
  }
});

test("numbered runs retain root ordering, depth boundaries and derived numbering", () => {
  const editor = createHeadlessEditor(definition);

  try {
    run(editor, () =>
      $getRoot()
        .clear()
        .append(
          text($createNumberNode(), "One"),
          text($createNumberNode(), "Two"),
          $setDepth(text($createNumberNode(), "Nested"), 1),
          text($createNumberNode(), "New run"),
          text($createBulletNode(), "Bullet"),
        ),
    );
    editor.getEditorState().read(
      () => {
        const blocks = $getRoot().getChildren();
        expect(blocks.map((node) => $getState(node, listIndexState))).toEqual([0, 1, 0, 0, 0]);
        expect($listRun(blocks[1]!).map((node) => node.getTextContent())).toEqual(["One", "Two"]);
        expect($listRun(blocks[2]!).map((node) => node.getTextContent())).toEqual(["Nested"]);
      },
      { editor },
    );
  } finally {
    editor.dispose();
  }
});

test("list Enter opens a matching line at the start and exits an empty line at the same depth", () => {
  const editor = createHeadlessEditor(definition);

  try {
    run(editor, () => {
      const item = $setDepth(text($createBulletNode(), "Keep"), 1);
      $getRoot().clear().append(item);
      item.selectStart();
      let selection = $getSelection();

      if (!$isRangeSelection(selection)) throw new Error("Expected caret");
      expect($enterList(item, selection, true)).toBe(true);
      const opened = $getRoot().getFirstChildOrThrow<ElementNode>();
      expect(opened.getType()).toBe("bullet");
      expect($depth(opened)).toBe(1);
      opened.selectStart();
      selection = $getSelection();

      if (!$isRangeSelection(selection)) throw new Error("Expected caret");
      expect($enterList(opened, selection, true)).toBe(true);
      expect($isParagraphNode($getRoot().getFirstChild())).toBe(true);
      expect($depth($getRoot().getFirstChild()!)).toBe(1);
      expect(item.getTextContent()).toBe("Keep");
    });
  } finally {
    editor.dispose();
  }
});

test("heading split carries the remaining rich text into a paragraph", () => {
  const editor = createHeadlessEditor(definition);

  try {
    run(editor, () => {
      const content = $createTextNode("First second").toggleFormat("italic");
      const heading = $createHeadingNode("h2").append(content);
      $getRoot().clear().append(heading);
      content.select(6, 6);
      const selection = $getSelection();

      if (!$isRangeSelection(selection)) throw new Error("Expected caret");
      expect($enterHeading(heading, selection, false)).toBe(true);
      expect(
        $getRoot()
          .getChildren()
          .map((node) => [node.getType(), node.getTextContent()]),
      ).toEqual([
        ["heading", "First "],
        ["paragraph", "second"],
      ]);
      expect(
        $getRoot().getLastChildOrThrow<ElementNode>().getAllTextNodes()[0]!.hasFormat("italic"),
      ).toBe(true);
    });
  } finally {
    editor.dispose();
  }
});

test("Backspace conversion keeps rich text, hidden state and depth for lists and callouts", () => {
  for (const create of [$createBulletNode, $createInsetNode, $createWarningNode]) {
    const editor = createHeadlessEditor(definition);

    try {
      run(editor, () => {
        const node = $setDepth(
          $setSettings(create().append($createTextNode("Retained").toggleFormat("bold")), {
            hidden: true,
          }),
          1,
        );

        $getRoot().clear().append(node);
        expect($exitList(node) || $exitCallout(node)).toBe(true);
        const paragraph = $getRoot().getFirstChildOrThrow<ElementNode>();
        expect(paragraph.getType()).toBe("paragraph");
        expect(paragraph.getTextContent()).toBe("Retained");
        expect($depth(paragraph)).toBe(1);
        expect($settings(paragraph).hidden).toBe(true);
        expect(paragraph.getAllTextNodes()[0]!.hasFormat("bold")).toBe(true);
      });
    } finally {
      editor.dispose();
    }
  }
});

test("disclosure fold keeps the caret visible and summary paste stays plain on one line", () => {
  const editor = createHeadlessEditor(definition);

  try {
    run(editor, () => {
      const disclosure = text($createShowHideNode(), "What is this?");

      const body = $setDepth(text($createParagraphNode(), "Details"), 1),
        following = text($createParagraphNode(), "After");

      $getRoot().clear().append(disclosure, body, following);
      body.selectEnd();
      expect($disclosureChildren(disclosure)).toEqual([body]);
      $toggleShowHide(disclosure);
      expect($settings(disclosure).folded).toBe(true);
      let selection = $getSelection();
      expect(
        $isRangeSelection(selection) &&
          selection.anchor.getNode().getTopLevelElement()?.is(disclosure),
      ).toBe(true);
      disclosure.select(0, disclosure.getChildrenSize());
      selection = $getSelection();

      if (!$isRangeSelection(selection)) throw new Error("Expected selection");
      expect($pasteDisclosure(selection, disclosure, " First \n\n Second\r\nThird ")).toBe(true);
      expect(disclosure.getTextContent()).toBe("First Second Third");
      const next = disclosure.insertNewAfter(selection);
      expect($depth(next)).toBe(1);
      expect($settings(disclosure).folded).toBeUndefined();
      following.insertBefore(next);
      next.selectStart();
      expect($exitDisclosureBody(next)).toBe(true);
      expect($depth(next)).toBe(0);
    });
  } finally {
    editor.dispose();
  }
});

test("injected formatting policy rejects disclosure summary and accepts its rich body", () => {
  const editor = createHeadlessEditor(definition);

  try {
    run(editor, () => {
      const disclosure = text($createShowHideNode(), "Summary"),
        body = $setDepth(text($createParagraphNode(), "Details"), 1);

      $getRoot().clear().append(disclosure, body);
      disclosure.select(0, 1);
      expect($textSelection($isShowHideNode)).toBeNull();
      body.select(0, 1);
      expect($textSelection($isShowHideNode)).not.toBeNull();
      expect($textSelection(() => true)).toBeNull();
    });
  } finally {
    editor.dispose();
  }
});

test("content actions insert an independent flat disclosure transaction with exact undo and redo", async () => {
  const editor = createHeadlessEditor(definition);

  try {
    const before = editor.getEditorState().toJSON();

    const key = editor
      .getEditorState()
      .read(() => $getRoot().getFirstChild()!.getKey(), { editor });

    expect(executeAction(editor, definition, "SHOW_HIDE", { targetKey: key }).executed).toBe(true);
    const after = editor.getEditorState().toJSON();
    expect(after.root.children.map((node) => node.type)).toEqual(["show-hide", "paragraph"]);
    expect(after.root.children[1]?.$?.depth).toBe(1);
    editor.dispatchCommand(UNDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(before);
    editor.dispatchCommand(REDO_COMMAND, undefined);
    await Promise.resolve();
    expect(editor.getEditorState().toJSON()).toEqual(after);
    editor.setEditable(false);

    const currentKey = editor
      .getEditorState()
      .read(() => $getRoot().getFirstChild()!.getKey(), { editor });

    expect(
      executeAction(editor, definition, "WARNING_TEXT", { targetKey: currentKey }).executed,
    ).toBe(false);
    expect(editor.getEditorState().toJSON()).toEqual(after);
  } finally {
    editor.dispose();
  }
});

test("Enter before a callout or disclosure retains styled content and opens text above it", () => {
  for (const create of [$createInsetNode, $createWarningNode, $createShowHideNode]) {
    const editor = createHeadlessEditor(definition);

    try {
      run(editor, () => {
        const node = $setDepth(text(create(), "Keep the block"), 1);
        $getRoot().clear().append(node);
        node.selectStart();
        expect($enterCallout(node, true) || $enterDisclosure(node, true)).toBe(true);
        const first = $getRoot().getFirstChild()!;
        expect($isParagraphNode(first)).toBe(true);
        expect($depth(first)).toBe(1);
        expect($getRoot().getLastChild()!.is(node)).toBe(true);
        expect(node.getTextContent()).toBe("Keep the block");
      });
    } finally {
      editor.dispose();
    }
  }
});

test("content insertion between a disclosure summary and its body retains nested ownership", () => {
  const editor = createHeadlessEditor(definition);

  try {
    const paragraphKey = editor
      .getEditorState()
      .read(() => $getRoot().getFirstChild()!.getKey(), { editor });

    executeAction(editor, definition, "SHOW_HIDE", { targetKey: paragraphKey });

    const summaryKey = editor
      .getEditorState()
      .read(() => $getRoot().getFirstChild()!.getKey(), { editor });

    executeAction(editor, definition, "INSET_TEXT", { targetKey: summaryKey });
    editor.getEditorState().read(
      () => {
        const blocks = $getRoot().getChildren();
        expect(blocks.map((node) => node.getType())).toEqual(["show-hide", "inset", "paragraph"]);
        expect(blocks.map($depth)).toEqual([0, 1, 1]);
        const summary = blocks[0]!;

        if (!$isShowHideNode(summary)) throw new Error("Expected disclosure");
        expect($disclosureChildren(summary)).toEqual(blocks.slice(1));
      },
      { editor },
    );
  } finally {
    editor.dispose();
  }
});
