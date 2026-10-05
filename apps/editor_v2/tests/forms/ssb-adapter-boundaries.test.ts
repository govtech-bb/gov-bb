import { legacyFieldAdapter } from "../../src/forms/legacy";
import type { Settings } from "../../src/forms/core/settings";
import { expect, test } from "vitest";
import { $createLinkNode } from "@lexical/link";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineFormEditor } from "../../src/forms/definition";
import { govbbFormModules } from "../../src/presets/govbb-form";
import { compileForm } from "../../src/forms/editor/compile";
import { preflight } from "../../src/forms/adapters/ssb/validation";
import { capabilityWarnings, logicIssues } from "../../src/forms/adapters/ssb/capabilities";
import {
  capabilityWarnings as editorWarnings,
  logicIssues as editorIssues,
} from "../../src/forms/editor/capabilities";
import { lexicalToLegacySsb } from "../../src/converters/lexicalToLegacySsb";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import {
  $createFormTitleNode,
  $createPageTitleNode,
  $createQuestionNode,
  $createInputNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
  $setSettings,
} from "../../src/forms/editor/nodes";
import { $createMentionNode } from "../../src/forms/features/mentions/node";

function configured(target: string, mapped = true) {
  return defineFormEditor({
    modules: govbbFormModules
      .filter((module) => !module.registry)
      .map((module) => ({
        ...module,
        fields: module.fields?.map((field) =>
          field.kind === "text"
            ? {
                ...field,
                validate: (_settings, where) => [
                  { code: `${target}-readiness`, where, message: `Checked by ${target}` },
                ],
                legacySsb: mapped
                  ? {
                      ...legacyFieldAdapter(field)!,
                      ref: `components/${target}`,
                      settings: (raw: Settings) => ({
                        ...legacyFieldAdapter(field)!.settings(raw),
                        adapter: target,
                      }),
                    }
                  : undefined,
              }
            : field,
        ),
      })),
  });
}

function fixture(definition: ReturnType<typeof configured>) {
  const editor = createHeadlessEditor(definition, undefined, { prepare: false });
  let question = "";
  editor.update(
    () => {
      const answer = $createInputNode();
      $getRoot().append(
        $setSettings($createFormTitleNode().append($createTextNode("Service")), {
          logicVersion: 2,
        }),
        $createPageTitleNode().append($createTextNode("About you")),
        $createQuestionNode().append(
          $createTextNode("Your "),
          $createTextNode("name").toggleFormat("bold"),
        ),
        answer,
        $createParagraphNode().append(
          $createTextNode("Read "),
          $createLinkNode("https://example.test/a(b)").append($createTextNode("this")),
          $createTextNode(". "),
          $createMentionNode("missing-field", "Retained label"),
        ),
      );
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());
      question = $questionKey(answer);
      definition.$normalizeInitial();
    },
    { discrete: true },
  );

  return { editor, question };
}

test("the explicit SSB adapter diagnoses native result pages instead of assigning an SSB page order", () => {
  const definition = configured("results"),
    { editor } = fixture(definition);

  try {
    const schema = lexicalToLegacySsb(editor.getEditorState(), definition, editor).schema!;
    schema.pages[0]!.pageType = "result";
    expect(preflight(schema, definition)).toContainEqual({
      code: "unsupported-result-page",
      message: "SSB cannot represent a calculator result page",
      where: schema.pages[0]!.id,
    });
  } finally {
    editor.dispose();
  }
});

test("legacy conversion uses each explicit editor definition without replacing nodes or changing state", () => {
  const alpha = configured("alpha"),
    beta = configured("beta");

  const a = fixture(alpha),
    b = fixture(beta);

  try {
    const original = a.editor.getEditorState(),
      bytes = JSON.stringify(original.toJSON());

    const keys = original.read(
      () =>
        $getRoot()
          .getChildren()
          .map((node) => node.getKey()),
      { editor: a.editor },
    );

    const first = compileForm(original, alpha, a.editor),
      second = compileForm(b.editor.getEditorState(), beta, b.editor);

    expect(first.pages[0]!.blocks[0]).toMatchObject({
      id: a.question,
      ref: "components/alpha",
      settings: { adapter: "alpha" },
      title: "Your **name**",
    });
    expect(second.pages[0]!.blocks[0]).toMatchObject({
      id: b.question,
      ref: "components/beta",
      settings: { adapter: "beta" },
    });
    expect(compileForm(original, alpha)).toEqual(first);
    expect(compileForm(original, alpha, a.editor)).toEqual(first);
    expect(first.pages[0]!.blocks[1]).toMatchObject({
      type: "text",
      markdown: "Read [this](https://example.test/a%28b%29). {{missing-field}}",
    });
    expect(Object.keys(first)).toEqual(["formId", "title", "processors", "meta", "pages"]);
    expect(
      original.read(
        () =>
          $getRoot()
            .getChildren()
            .map((node) => node.getKey()),
        { editor: a.editor },
      ),
    ).toEqual(keys);
    expect(a.editor.getEditorState()).toBe(original);
    expect(JSON.stringify(original.toJSON())).toBe(bytes);
    expect(() => compileForm(original, alpha, b.editor)).toThrow(
      "this editor's installed definition",
    );
  } finally {
    a.editor.dispose();
    b.editor.dispose();
  }
});

test("pure output validation consumes only installed validators and retains readiness failures separately from saved source", () => {
  const definition = configured("custom"),
    { editor, question } = fixture(definition);

  try {
    const state = editor.getEditorState(),
      before = state.toJSON();

    const output = lexicalToLegacySsb(state, definition, editor);
    expect(output.schema).not.toBeNull();
    expect(output.diagnostics).toContainEqual({
      code: "custom-readiness",
      where: question,
      message: "Checked by custom",
    });

    const contributions = {
      fields: definition.fields.map((field) => ({
        kind: field.kind,
        capabilities: { repeat: field.capabilities.repeat },
        validate: field.validate,
        legacySsb: legacyFieldAdapter(field) && {
          validateOutput: legacyFieldAdapter(field)!.validateOutput,
        },
      })),
      logicActions: definition.logicActions.map((action) => ({ type: action.type })),
    };

    expect(preflight(output.schema!, contributions)).toEqual(output.diagnostics);
    expect(lexicalToMarkdown(before, definition)).toContain("::text[Your **name**]");
    expect(logicIssues(output.schema!, before)).toEqual(editorIssues(output.schema!, state));
    expect(capabilityWarnings(output.schema!, before)).toEqual(
      editorWarnings(output.schema!, state),
    );
    expect(logicIssues(output.schema!, before)).toContainEqual(
      expect.objectContaining({ code: "missing-reference" }),
    );
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    editor.dispose();
  }
});

test("a saved field without a legacy mapping produces a located unsupported-output diagnostic without selecting a default", () => {
  const definition = configured("unmapped", false),
    { editor, question } = fixture(definition);

  try {
    const state = editor.getEditorState(),
      before = state.toJSON();

    expect(lexicalToMarkdown(before, definition)).toContain("::text[Your **name**]");
    expect(lexicalToLegacySsb(state, definition, editor)).toEqual({
      schema: null,
      diagnostics: [
        {
          code: "unsupported-field-output",
          where: question,
          message: "Text input has no SSB compatibility mapping",
        },
      ],
    });
    expect(editor.getEditorState().toJSON()).toEqual(before);
  } finally {
    editor.dispose();
  }
});
