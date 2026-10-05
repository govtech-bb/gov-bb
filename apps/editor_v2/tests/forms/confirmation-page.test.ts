import { createEditor } from "../helpers/default-form";
import { LinkNode } from "@lexical/link";
import { HeadingNode } from "@lexical/rich-text";
import { expect, test } from "vitest";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { $insertionGroups } from "../helpers/insertion";
import { matchesAction as matches } from "../../src/editor/core/actions";
import { govbbFormEditor } from "../../src/presets/govbb-form";
import { compileForm, preflight } from "../helpers/default-form";
import { fromEditor, readMarkdown, toEditor, writeMarkdown } from "../helpers/default-form";
import { MentionNode } from "../../src/forms/features/mentions/node";
import {
  $createFormTitleNode,
  $createPageTitleNode,
  $createQuestionNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $normalizePages,
  $pageType,
  $shareQuestionSettings,
} from "../../src/forms/editor/nodes";
import { $createInputNode, $createWidgetNode } from "../../src/forms/editor/answer-nodes";
import { $createWarningNode } from "../../src/editor/modules/callouts/nodes";
import { $setSettings, $settings } from "../../src/editor/core/document-state";
import { formNodes } from "../helpers/default-form";
import { $normalizePageHeads } from "../../src/forms/features/pages/headings";
import { $pagePreview } from "../../src/forms/features/pages/queries";

const editor = () =>
  createEditor({
    nodes: [...formNodes, HeadingNode, LinkNode, MentionNode],
    onError: (error) => {
      throw error;
    },
  });

const normalize = () => {
  const root = $getRoot();
  $ensureBlockIds(root);
  $shareQuestionSettings(root);
  $ensureQuestionFields(root);
  $normalizePages(root);
  $normalizePageHeads(root);
};

const message =
  "Keep only text, headings and lists on the confirmation page. Move other blocks to an earlier page.";

test("unsupported content preserves confirmation purpose and offers explicit conversion", () => {
  for (const make of [
    () => $createInputNode(),
    () => $createWidgetNode("conditional-logic"),
    $createWarningNode,
  ]) {
    const e = editor();
    let pageKey = "";
    e.update(
      () => {
        const page = $setSettings($createWidgetNode("page-break"), { confirmation: true });
        pageKey = page.getKey();
        $getRoot().append(
          $createFormTitleNode(),
          page,
          $createPageTitleNode().append($createTextNode("Application submitted")),
          make(),
        );
        normalize();
        expect($settings(page).confirmation).toBe(true);
        expect($pageType(page)).toBe("confirmation");
        expect($pagePreview(page)).toMatchObject({
          type: "confirmation",
          qualified: true,
          warnings: [message],
        });
      },
      { discrete: true },
    );
    const schema = compileForm(e.getEditorState());
    expect(schema.pages.at(-1)).toMatchObject({
      pageType: "confirmation",
      confirmation: true,
      stepId: "submission-confirmation",
      title: "Application submitted",
    });
    expect(
      preflight(schema)
        .filter((issue) => issue.code === "confirmation-content")
        .map((issue) => issue.message),
    ).toEqual([message]);
    expect(preflight(schema).some((issue) => issue.code === "no-confirmation")).toBe(false);
    e.update(
      () => {
        const page = $getRoot()
          .getChildren()
          .find((node) => node.getKey() === pageKey)!;

        $setSettings(page, { confirmation: false });
        normalize();
        expect($pageType(page)).toBe("questions");
      },
      { discrete: true },
    );
    expect(
      preflight(compileForm(e.getEditorState())).some(
        (issue) => issue.code === "confirmation-content",
      ),
    ).toBe(false);
  }
});

test("confirmation insertion offers supported content without answer or logic entries", () => {
  const e = editor();
  e.update(
    () => {
      const ordinary = $createParagraphNode();
      const page = $setSettings($createWidgetNode("page-break"), { confirmation: true });
      const title = $createPageTitleNode();
      const line = $createParagraphNode();
      const question = $createQuestionNode();
      $getRoot().append($createFormTitleNode(), ordinary, page, title, line, question);
      expect($insertionGroups(ordinary).map(([name]) => name)).toContain("Questions");

      for (const anchor of [page, title, line, question]) {
        const choices = $insertionGroups(anchor);
        expect(choices.map(([name]) => name)).toEqual(["Layout blocks"]);
        const ids = choices.flatMap(([, entries]) => entries.map((entry) => entry.id));

        for (const id of [
          "TEXT",
          "HEADING_1",
          "HEADING_2",
          "HEADING_3",
          "BULLETED_LIST",
          "NUMBERED_LIST",
        ])
          expect(ids).toContain(id);

        for (const id of [
          "question_INPUT_TEXT",
          "INPUT_TEXT",
          "question_INPUT_NUMBER",
          "INPUT_NUMBER",
          "CONDITIONAL_LOGIC",
          "CALCULATED_FIELDS",
          "SHOW_HIDE",
          "WARNING_TEXT",
          "GOVBB_NAME",
        ])
          expect(ids).not.toContain(id);
      }
    },
    { discrete: true },
  );
  const entry = govbbFormEditor.actions.find((entry) => entry.id === "CONFIRMATION_PAGE")!;
  expect(entry.title).toBe("Confirmation page");
  expect(matches(entry, "confirmation")).toBe(true);
});

test("confirmation Markdown keeps its page purpose and invalid content through reload", () => {
  const source =
    '---\nformat: govbb-form\nformatVersion: 2\ntitle: "Test form"\n---\n\n# About you\n\n---\n\n# Application submitted\n\n::page{type="confirmation"}\n\n::text[Extra answer]{#extra-answer}\n';

  const parsed = readMarkdown(source);
  expect(parsed.document).toBeDefined();
  const e = editor();
  e.setEditorState(e.parseEditorState(toEditor(parsed.document!)));
  e.update(normalize, { discrete: true });
  const saved = writeMarkdown(fromEditor(e.getEditorState().toJSON()));
  expect(saved).toContain('type="confirmation"');
  expect(saved).toContain("::text[Extra answer]");
  const restored = editor();
  restored.setEditorState(restored.parseEditorState(toEditor(readMarkdown(saved).document!)));
  restored.update(normalize, { discrete: true });
  const schema = compileForm(restored.getEditorState());
  expect(schema.pages.at(-1)).toMatchObject({
    pageType: "confirmation",
    confirmation: true,
    title: "Application submitted",
  });
  expect(schema.pages.at(-1)?.blocks[0]).toMatchObject({ type: "question", title: "Extra answer" });
  expect(
    preflight(schema)
      .filter((issue) => issue.code === "confirmation-content")
      .map((issue) => issue.message),
  ).toEqual([message]);
});
