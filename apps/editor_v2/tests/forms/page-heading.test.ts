import { createEditor } from "../helpers/default-form";
import { $createLinkNode, LinkNode } from "@lexical/link";
import { $createHeadingNode, HeadingNode } from "@lexical/rich-text";
import { expect, test, vi } from "vitest";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isNodeSelection,
  $isTextNode,
  RootNode,
  UNDO_COMMAND,
  REDO_COMMAND,
  type ElementNode,
} from "lexical";
import {
  $blockZone,
  $dropBlocks,
  $duplicateQuestion,
  $moveBlocks,
  $removeBlocks,
} from "../../src/forms/editor/structure/blocks";
import { $enter } from "../../src/forms/editor/structure/editing";
import { shortcuts } from "../../src/forms/editor/structure/keyboard";
import { registerEditorHistory } from "../../src/editor/core/history";
import { $insertBlocks } from "../../src/forms/editor/insertion";
import { pageEntries } from "../../src/forms/features/pages/insertion";
import { compileForm, preflight } from "../helpers/default-form";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { $pageButtons } from "../../src/forms/features/pages/buttons";
import { $fields } from "../../src/forms/features/logic/queries";
import { MentionNode } from "../../src/forms/features/mentions/node";
import { $normalizeDepths } from "../../src/forms/editor/nesting";
import {
  $autoPageTitle,
  $blockGroup,
  $createFormTitleNode,
  $createPageDescriptionNode,
  $createPageTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $headEnd,
  $headStart,
  $isPageBreak,
  $isPageDescriptionNode,
  $isPageTitleNode,
  $isQuestionNode,
  $normalizePages,
  $pageBlocks,
  $pageDescription,
  $pageHead,
  $pageTitle,
  $shareQuestionSettings,
  $typedPageTitle,
  CHECK_ANSWERS_DESCRIPTION,
} from "../../src/forms/editor/nodes";
import { $createInputNode, $createWidgetNode } from "../../src/forms/editor/answer-nodes";
import { $setSettings, $settings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";
import { $deleteAtHead, $normalizePageHeads } from "../../src/forms/features/pages/headings";
import { $ssbIds } from "../../src/forms/editor/ssb";
import { $pagePreview } from "../../src/forms/features/pages/queries";

const newEditor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (error) => {
      throw error;
    },
  });

const $settle = () => {
  const root = $getRoot();
  $normalizePageHeads(root);
  $normalizeDepths(root);
  $shareQuestionSettings(root);
  $ensureBlockIds(root);
  $ensureQuestionFields(root);
  $normalizePages(root);
};

const run = (editor: ReturnType<typeof newEditor>, fn: () => void, settle = true) =>
  editor.update(
    () => {
      fn();

      if (settle) $settle();
    },
    { discrete: true },
  );

const text = (value: string) => $createTextNode(value);

const line = (value = "") => $createParagraphNode().append(text(value));

const title = (value = "") => $createPageTitleNode().append(text(value));

const description = (value = "") => $createPageDescriptionNode().append(text(value));

const page = () => $createWidgetNode("page-break");

const $starts = () =>
  $getRoot()
    .getChildren()
    .filter((node, i) => i === 0 || $isPageBreak(node));

const entry = (id: string) => pageEntries.find((entry) => entry.id === id)!;

const $caretAt = (block: ElementNode, offset = 0) => {
  const selection = $getSelection();
  expect($isRangeSelection(selection)).toBe(true);

  if (!$isRangeSelection(selection)) return;
  expect(selection.anchor.getNode().getTopLevelElement()?.getKey()).toBe(block.getKey());
  expect(selection.anchor.offset).toBe(offset);
};

const $pressEnter = () => {
  if ($enter()) return;
  const selection = $getSelection();

  if ($isRangeSelection(selection)) selection.insertParagraph();
};

test("page heads migrate names and lone titles, omit reserved heads, and settle idempotently", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      line("Intro"),
      $setSettings(page(), { name: " Road closure " }),
      $createQuestionNode().append(text("Which road?")),
      $createInputNode(),
      $setSettings(page(), { pageType: "check-answers" }),
      ...entry("DECLARATION_PAGE").create(),
      $setSettings(page(), { confirmation: true }),
      $createQuestionNode().append(text("Application sent")),
      line("Next steps"),
    ),
  );
  editor.getEditorState().read(
    () => {
      const starts = $starts();
      expect($pageHead(starts[0]!)[0]?.getTextContent()).toBe("");
      expect($pageHead(starts[1]!)[0]?.getTextContent()).toBe("Road closure");
      expect($settings(starts[1]!).name).toBeUndefined();
      expect($pageHead(starts[2]!)).toEqual([]);
      expect($pageHead(starts[3]!)).toEqual([]);
      expect($pageHead(starts[4]!)[0]?.getTextContent()).toBe("Application sent");
      expect($pageBlocks(starts[4]!).some($isQuestionNode)).toBe(false);
    },
    { editor: editor },
  );
  const before = editor.getEditorState().toJSON();
  run(editor, () => {});
  expect(editor.getEditorState().toJSON()).toEqual(before);
});

test("normalizing repairs displaced heads and preserves extra head text as ordinary content", () => {
  const editor = newEditor();
  run(editor, () => {
    const start = page(),
      heading = title("Contact"),
      intro = description("Why we ask"),
      body = line("Body");

    const extra = title("Keep this"),
      stray = description();

    const review = $setSettings(page(), { pageType: "check-answers" });
    $getRoot().append(
      $createFormTitleNode(),
      start,
      body,
      heading,
      intro,
      extra,
      line("Between"),
      stray,
      review,
      title("Misplaced"),
    );
    $settle();
    expect($pageHead(start).map((node) => node.getTextContent())).toEqual([
      "Contact",
      "Why we ask",
    ]);
    expect(intro.getNextSibling()?.getKey()).toBe(body.getKey());
    expect($pageBlocks(start).map((node) => [node.getType(), node.getTextContent()])).toEqual([
      ["paragraph", "Body"],
      ["paragraph", "Keep this"],
      ["paragraph", "Between"],
    ]);
    expect(stray.isAttached()).toBe(false);
    expect($pageBlocks(review).map((node) => node.getType())).toEqual(["paragraph"]);
  });
});

test("loaded drafts run the registered migration and keep authored titles after serialization", () => {
  const editor = newEditor();
  run(
    editor,
    () =>
      $getRoot().append(
        $createFormTitleNode(),
        line(),
        $setSettings(page(), { name: "Contact" }),
        line(),
      ),
    false,
  );
  const draft = editor.getEditorState().toJSON();
  const loaded = newEditor();
  loaded.registerNodeTransform(RootNode, $normalizePageHeads);
  loaded.setEditorState(loaded.parseEditorState(draft));
  loaded.getEditorState().read(
    () => {
      expect($starts().map($typedPageTitle)).toEqual(["", "Contact"]);
      expect($settings($starts()[1]!).name).toBeUndefined();
    },
    { editor: loaded },
  );
});

test("page groups include the head, content readers exclude it, and helpers resolve its owner", () => {
  const editor = newEditor();
  run(editor, () => {
    const start = page(),
      heading = title("About you"),
      intro = description("Intro"),
      body = line("Body");

    $getRoot().append($createFormTitleNode(), start, heading, intro, body);
    expect($pageBlocks(start)).toEqual([body]);
    expect($blockGroup(start)).toEqual([start, heading, intro]);
    expect($headStart(intro)).toBe(start);
    expect($headEnd(start)).toBe(intro);
    expect($headEnd(heading)).toBe(intro);
    expect($headEnd(body)).toBe(body);
    $setSettings(start, { folded: true });
    expect($blockGroup(start)).toEqual([start, heading, intro, body]);
  });
});

test("removing and duplicating a page break carries its title and description", () => {
  const editor = newEditor();
  run(editor, () => {
    const start = page(),
      heading = title("Contact"),
      intro = description("Intro"),
      body = line("Body");

    $getRoot().append($createFormTitleNode(), start, heading, intro, body);
    $duplicateQuestion(start);
    const copy = intro.getNextSibling()!;
    expect($isPageBreak(copy)).toBe(true);
    expect($pageHead(copy).map((node) => node.getTextContent())).toEqual(["Contact", "Intro"]);
    expect($headEnd(copy).getNextSibling()).toBe(body);
    $removeBlocks([start]);
    expect([start, heading, intro].every((node) => !node.isAttached())).toBe(true);
    expect(copy.isAttached()).toBe(true);
  });
});

test("page titles and descriptions use typed, automatic, and reserved fallbacks", () => {
  const editor = newEditor();
  run(editor, () => {
    const first = $createFormTitleNode(),
      second = $setSettings(page(), { name: "Old name" }),
      third = page();

    const thanks = $setSettings(page(), { confirmation: true });
    const review = $setSettings(page(), { pageType: "check-answers", name: "Wrong" });
    const declaration = $setSettings(page(), { pageType: "declaration", name: "Wrong" });
    $getRoot().append(
      first,
      title(),
      $createQuestionNode().append(text("Your name")),
      $createInputNode(),
      second,
      title(" Typed name "),
      description(" Why we ask "),
      $createHeadingNode("h2").append(text("First heading")),
      $createQuestionNode().append(text("Later question")),
      $createInputNode(),
      third,
      title(),
      thanks,
      title(),
      line("Confirmation"),
      review,
      declaration,
    );
    expect($typedPageTitle(second)).toBe("Typed name");
    expect($autoPageTitle(first)).toBe("Your name");
    expect($autoPageTitle(second)).toBe("First heading");
    expect($autoPageTitle(third)).toBe("Page 3");
    expect($autoPageTitle(thanks)).toBe("Application submitted");
    expect([first, second, third, thanks, review, declaration].map($pageTitle)).toEqual([
      "Your name",
      "Typed name",
      "Page 3",
      "Application submitted",
      "Check your answers",
      "Declaration",
    ]);
    expect([first, second, review].map($pageDescription)).toEqual([
      "",
      "Why we ask",
      CHECK_ANSWERS_DESCRIPTION,
    ]);
  });
});

test("Enter in the service name moves to page one's title without splitting it", () => {
  const editor = newEditor();
  run(editor, () => {
    const service = $createFormTitleNode().append(text("Permit service")),
      heading = title("Your details");

    $getRoot().append(service, heading);
    service.selectEnd();
    $pressEnter();
    expect(service.getTextContent()).toBe("Permit service");
    expect($getRoot().getChildrenSize()).toBe(2);
    $caretAt(heading);
  });
});

test("Enter at a title's end creates a description, and in its middle splits into the description", () => {
  for (const offset of [23, 7]) {
    const editor = newEditor();
    run(editor, () => {
      const content = text("Tell us about the event"),
        heading = $createPageTitleNode().append(content);

      $getRoot().append($createFormTitleNode(), heading);
      content.select(offset, offset);
      $pressEnter();
      const intro = heading.getNextSibling();
      expect($isPageDescriptionNode(intro)).toBe(true);
      expect(heading.getTextContent()).toBe(offset === 23 ? "Tell us about the event" : "Tell us");
      expect(intro?.getTextContent().trim()).toBe(offset === 23 ? "" : "about the event");

      if ($isPageDescriptionNode(intro)) $caretAt(intro);
    });
  }
});

test("Enter keeps nonempty head starts in place, uses an existing description, and exits an empty one", () => {
  const editor = newEditor();
  run(editor, () => {
    const heading = title("Contact"),
      intro = description("Explain");

    $getRoot().append($createFormTitleNode(), heading, intro);
    heading.selectStart();
    $pressEnter();
    $caretAt(heading);
    intro.selectStart();
    $pressEnter();
    $caretAt(intro);
    expect($getRoot().getChildrenSize()).toBe(3);
    heading.selectEnd();
    $pressEnter();
    $caretAt(intro);
    intro.clear().selectStart();
    $pressEnter();
    expect($isParagraphNode(heading.getNextSibling())).toBe(true);
    expect($pageHead($getRoot().getFirstChild()!)).toEqual([heading]);
  });
});

test("Backspace at a page title selects its break; Delete cannot join across page boundaries", () => {
  const editor = newEditor();
  run(editor, () => {
    const first = title(),
      body = line("Body"),
      start = page(),
      heading = title("Second"),
      intro = description("Intro");

    $getRoot().append($createFormTitleNode(), first, body, start, heading, intro);
    first.selectStart();
    expect($deleteAtHead(first, true, null)).toBe(true);
    $caretAt(first);
    expect($deleteAtHead(heading, true, body)).toBe(true);
    const selection = $getSelection();
    expect($isNodeSelection(selection) && selection.getNodes()).toEqual([start]);
    expect($deleteAtHead(body, false, heading)).toBe(true);
    expect($deleteAtHead(heading, false, intro)).toBe(false);
    expect($deleteAtHead(heading, false, body)).toBe(true);
    expect($deleteAtHead(intro, true, heading)).toBe(false);
    heading.clear();
    expect($deleteAtHead(heading, false, intro)).toBe(true);
  });
});

test("head nodes flatten links and line breaks and remove inline formatting", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $createPageTitleNode().append(
        text("Bold").toggleFormat("bold").setStyle("color:red"),
        $createLineBreakNode(),
        $createLinkNode("https://example.gov.bb").append(text("link")),
      ),
    ),
  );
  editor.getEditorState().read(
    () => {
      const heading = $pageHead($getRoot().getFirstChild()!)[0]!;
      expect(heading.getTextContent()).toBe("Bold link");
      expect(
        heading
          .getChildren()
          .every((node) => $isTextNode(node) && node.getFormat() === 0 && node.getStyle() === ""),
      ).toBe(true);
    },
    { editor: editor },
  );
});

test("drops and moves keep page heads together and land outside them", () => {
  const editor = newEditor();
  run(editor, () => {
    const first = $createFormTitleNode(),
      last = line("End of first"),
      start = page(),
      heading = title("Second"),
      intro = description("Intro"),
      body = line("Body");

    $getRoot().append(first, title("First"), last, start, heading, intro, body);
    $dropBlocks(last, $blockZone(start));
    expect(intro.getNextSibling()).toBe(last);
    $moveBlocks([last], false);
    expect(last.getNextSibling()).toBe(start);
    $moveBlocks([last], true);
    expect(intro.getNextSibling()).toBe(last);
    expect($pageHead(start)).toEqual([heading, intro]);
  });
});

test("page one gets a button only when it has content beyond its heading", () => {
  const editor = newEditor();
  run(editor, () => {
    $getRoot().append($createFormTitleNode(), title("About you"), description("Intro"));
    $settle();
    expect($pageButtons()).toEqual([]);
    $getRoot().append($createInputNode());
    $settle();
    expect($pageButtons()).toHaveLength(1);
  });
});

test("Hide label compiles only for titled fields that support it", () => {
  const editor = newEditor();
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      $createQuestionNode().append(text("Name")),
      $setSettings($createInputNode(), { hideLabel: true }),
      $createQuestionNode().append(text("Evidence")),
      $setSettings($createWidgetNode("file-upload"), { hideLabel: true }),
      $setSettings($createInputNode(), { hideLabel: true }),
    ),
  );

  const questions = compileForm(editor.getEditorState()).pages[0]!.blocks.filter(
    (block) => block.type === "question",
  );

  expect(questions.map((question) => question.settings.hideLabel)).toEqual([
    true,
    undefined,
    undefined,
  ]);
});

test("page catalog entries and the shortcut create an editable title with the caret inside it", () => {
  for (const make of [
    () => entry("PAGE_BREAK").create(),
    () => entry("REPEATING_PAGE").create(),
    () => entry("CONFIRMATION_PAGE").create(),
    shortcuts["---"]!,
  ]) {
    const editor = newEditor();
    run(editor, () => {
      const first = $createFormTitleNode(),
        heading = title("First"),
        intro = description("Intro");

      $getRoot().append(first, heading, intro, line("Body"));
      const nodes = make();
      expect(nodes.map((node) => node.getType())).toEqual(["widget", "page-title"]);
      $insertBlocks(nodes, first);
      expect($pageHead(nodes[0]!).map((node) => node.getKey())).toEqual([nodes[1]!.getKey()]);
      expect($isPageTitleNode(nodes[1])).toBe(true);

      if (!$isPageTitleNode(nodes[1])) throw Error("Expected page title");
      $caretAt(nodes[1]);

      if (!$settings(nodes[0]!).confirmation) expect(intro.getNextSibling()).toBe(nodes[0]!);
      else expect($getRoot().getLastChild()).toBe(nodes[1]!);
    });
  }
});

test("page titles drive check-answer sections, reserved-safe IDs, and logic page labels", () => {
  const editor = newEditor();
  run(editor, () => {
    const first = $createFormTitleNode(),
      second = page(),
      third = page(),
      review = $setSettings(page(), { pageType: "check-answers" });

    $getRoot().append(
      first,
      title("About you"),
      $createQuestionNode().append(text("Name")),
      $createInputNode(),
      second,
      title("Contact details"),
      $createQuestionNode().append(text("Email")),
      $createInputNode("email"),
      third,
      title("Declaration"),
      review,
    );
    $settle();
    expect($pagePreview(review).sections.map((section) => section.title)).toEqual([
      "About you",
      "Contact details",
      "Declaration",
    ]);
    expect($ssbIds().pages.get(second.getKey())?.id).toBe("contact-details");
    expect($ssbIds().pages.get(third.getKey())?.id).toBe("declaration-2");
    expect($fields().map((field) => field.page)).toEqual([
      "Page 1 · About you",
      "Page 2 · Contact details",
    ]);
  });
});

test("the demo exports page titles and descriptions with no duplicate heading blocks or preflight errors", () => {
  for (const normalize of [true, false]) {
    const editor = newEditor();
    run(
      editor,
      () => {
        $demo();

        if (!normalize) {
          $shareQuestionSettings($getRoot());
          $ensureBlockIds($getRoot());
          $ensureQuestionFields($getRoot());
        }
      },
      normalize,
    );
    const schema = compileForm(editor.getEditorState());
    expect(schema.pages.map((page) => page.title)).toEqual([
      "Tell us about the event",
      "Road closure",
      "Sound systems",
      "Check your answers",
      "Declaration",
      "Application sent",
    ]);
    expect(schema.pages.map((page) => page.description)).toEqual([
      "We use this to check that amplified music is allowed where and when you plan it.",
      undefined,
      undefined,
      CHECK_ANSWERS_DESCRIPTION,
      undefined,
      undefined,
    ]);

    if (normalize)
      expect(
        schema.pages
          .flatMap((page) => page.blocks)
          .some((block) => block.type === "text" && block.markdown === "Application sent"),
      ).toBe(false);
    expect(preflight(schema)).toEqual([]);
  }
});

test("undo and redo restore page heads with a duplicated or removed page", async () => {
  const editor = newEditor();
  editor.registerNodeTransform(RootNode, $normalizePageHeads);
  run(editor, () =>
    $getRoot().append(
      $createFormTitleNode(),
      title("First"),
      page(),
      title("Second"),
      description("Intro"),
      line("Body"),
    ),
  );
  const unregister = registerEditorHistory(editor);
  let now = 0;

  const step = async (fn: () => void) => {
    vi.setSystemTime(new Date((now += 1000)));
    editor.update(fn);
    await Promise.resolve();
  };

  const command = async (type: typeof UNDO_COMMAND) => {
    editor.dispatchCommand(type, undefined);
    await Promise.resolve();
  };

  const titles = () =>
    editor
      .getEditorState()
      .read(() => $starts().map((start) => $pageHead(start).map((node) => node.getTextContent())), {
        editor: editor,
      });

  try {
    await step(() => $duplicateQuestion($starts()[1]!));
    expect(titles()).toEqual([["First"], ["Second", "Intro"], ["Second", "Intro"]]);
    await step(() => $removeBlocks([$starts()[1]!]));
    expect(titles()).toEqual([["First"], ["Second", "Intro"]]);
    await command(UNDO_COMMAND);
    expect(titles()).toHaveLength(3);
    await command(UNDO_COMMAND);
    expect(titles()).toHaveLength(2);
    await command(REDO_COMMAND);
    expect(titles()).toHaveLength(3);
  } finally {
    unregister();
    vi.useRealTimers();
  }
});
