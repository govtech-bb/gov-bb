import { jsonSetting } from "../helpers/serialized-test-data";
import { legacyContentAdapter } from "../../src/forms/legacy";
import { expect, test } from "vitest";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setState,
  type LexicalNode,
} from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineFormEditor } from "../../src/forms/definition";
import { govbbFormEditor, govbbFormModules } from "../../src/presets/govbb-form";
import { createFormRuntime } from "../../src/forms/editor/runtime";
import {
  createDraftCodec,
  initialDraft,
  MARKDOWN_KEY,
  WORKING_KEY,
  type DraftStorage,
} from "../helpers/default-form";
import { lexicalToLegacySsb } from "../../src/converters/lexicalToLegacySsb";
import {
  $blockId,
  $blockKind,
  $createFormTitleNode,
  $createInputNode,
  $createPageTitleNode,
  $createQuestionNode,
  $createWidgetNode,
  $ensureBlockIds,
  $ensureQuestionFields,
  $questionKey,
  $setSettings,
  $settings,
} from "../../src/forms/editor/nodes";
import {
  $createMentionNode,
  $mentionDefault,
  $mentionField,
  $mentionsIn,
  defaultState,
} from "../../src/forms/features/mentions/node";
import { $updateMentions } from "../../src/forms/features/mentions/editor";
import { focusLogic } from "../../src/forms/features/logic/authoring";
import { conditionalLogic } from "../../src/forms/core/logic";

const runtime = createFormRuntime(govbbFormEditor),
  codec = createDraftCodec(runtime);

function fixture() {
  const editor = createHeadlessEditor(govbbFormEditor, undefined, { prepare: false });
  let page!: LexicalNode, rule!: LexicalNode;
  editor.update(
    () => {
      const input = $createInputNode();
      page = $setSettings($createWidgetNode("page-break"), { folded: true });

      const calculated = $setSettings($createWidgetNode("calculated-fields"), {
        calculatedFields: [{ id: "score", name: "Score", type: "NUMBER", value: 0 }],
      });

      rule = $createWidgetNode("conditional-logic");
      $getRoot().append(
        $setSettings($createFormTitleNode().append($createTextNode("Application")), {
          logicVersion: 2,
        }),
        $createPageTitleNode().append($createTextNode("About you")),
        $createQuestionNode().append($createTextNode("Name")),
        input,
        page,
        $createPageTitleNode().append($createTextNode("Review")),
        calculated,
        rule,
        $createParagraphNode().append(
          $setState(
            $createMentionNode("missing-answer", "Removed answer"),
            defaultState,
            "No answer yet",
          ),
        ),
      );
      $ensureBlockIds($getRoot());
      $ensureQuestionFields($getRoot());

      const field = $questionKey(input),
        score = `${$blockId(calculated)}:score`;

      $setSettings(rule, {
        logicalOperator: "AND",
        conditionals: [
          {
            id: "condition",
            type: "SINGLE",
            field,
            comparison: "IS_NOT_EMPTY",
            value: "retained literal",
          },
        ],
        actions: [
          {
            id: "calculate",
            type: "CALCULATE",
            calculate: { field: score, operator: "FORMULA", expression: "1 + 2", value: { field } },
            changeLabel: { target: field, text: "Inactive replacement" },
            jumpToPage: "missing-page",
          },
        ],
      });
      govbbFormEditor.$normalizeInitial();
    },
    { discrete: true },
  );

  return { editor, page, rule };
}

const memory = (source: string): DraftStorage => {
  const entries = new Map([
    [MARKDOWN_KEY, source],
    [WORKING_KEY, source + "\nUnapplied text\n"],
  ]);

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
};

test("logic, calculation and mention modules own their insertion, source, renderers and overlays exactly once", () => {
  const actions = govbbFormEditor.logicActions;
  expect(actions.map((action) => action.type)).toEqual([
    "JUMP_TO_PAGE",
    "CALCULATE",
    "REQUIRE_ANSWER",
    "SHOW_BLOCKS",
    "HIDE_BLOCKS",
    "CHANGE_LABEL",
    "CHANGE_PAGE_TITLE",
    "HIDE_BUTTON_TO_DISABLE_COMPLETION",
  ]);

  for (const [module, kind, insertion] of [
    ["form-logic", "conditional-logic", "CONDITIONAL_LOGIC"],
    ["form-calculations", "calculated-fields", "CALCULATED_FIELDS"],
  ]) {
    const owner = govbbFormModules.find((item) => item.key === module)!;
    expect(owner.contents).toHaveLength(1);
    expect(owner.contents![0]!.source.storage.value).toBe(kind);
    expect(legacyContentAdapter(owner.contents![0]!)).toBeTypeOf("function");
    expect(owner.renderers?.map((item) => item.key)).toEqual([`widget:${kind}`]);
    expect(govbbFormEditor.actions.filter((action) => action.id === insertion)).toHaveLength(1);
    expect(
      govbbFormEditor.renderers.filter((renderer) => renderer.key === `widget:${kind}`),
    ).toHaveLength(1);
  }

  expect(
    govbbFormModules
      .filter((module) => module.nodes?.some((node) => node.type === "mention"))
      .map((module) => module.key),
  ).toEqual(["form-mentions"]);
  expect(
    govbbFormEditor.slots
      .filter((slot) => slot.key === "form-mentions" || slot.key === "logic-rule-links")
      .map((slot) => [slot.key, slot.slot]),
  ).toEqual([
    ["logic-rule-links", "editor.overlay"],
    ["form-mentions", "editor.overlay"],
  ]);
  expect(() =>
    defineFormEditor({
      modules: [...govbbFormModules, { key: "duplicate-action", logicActions: [actions[0]!] }],
    }),
  ).toThrow("Duplicate logic action definition");
});

test("removed modules reject their documents while retaining canonical and unapplied source for reinstatement", () => {
  const { editor } = fixture();

  try {
    const state = editor.getEditorState().toJSON(),
      canonical = codec.encode(state);

    for (const key of ["form-logic", "form-calculations", "form-mentions"]) {
      const absent = defineFormEditor({
        modules: govbbFormModules.filter(
          (module) => module.key !== key && module.key !== "form-registry",
        ),
      });

      expect(() => absent.validateDocument(state)).toThrow();

      const absentRuntime = createFormRuntime(absent),
        absentCodec = createDraftCodec(absentRuntime);

      const storage = memory(canonical),
        working = storage.getItem(WORKING_KEY)!;

      const unavailable = initialDraft(
        storage,
        () => {
          throw Error("Never replace unavailable source with a demo");
        },
        absentCodec,
        absentRuntime,
      );

      expect(unavailable.snapshot.valid).toBe(false);
      expect(unavailable.state).toBeUndefined();
      expect(unavailable.snapshot.recovery?.original).toBe(canonical);
      expect(storage.getItem(MARKDOWN_KEY)).toBe(canonical);
      expect(storage.getItem(WORKING_KEY)).toBe(working);

      const restored = initialDraft(
        storage,
        () => {
          throw Error("Never overwrite a retained draft");
        },
        codec,
        runtime,
      );

      expect(restored.snapshot.valid).toBe(true);
      expect(restored.snapshot.dirty).toBe(true);
      expect(restored.snapshot.source).toBe(working);
    }
  } finally {
    editor.dispose();
  }
});

test("module codecs retain inactive action payloads, formula expressions and unresolved mention defaults", () => {
  const { editor } = fixture();

  try {
    editor.update(() => $updateMentions($getRoot(), new Set()), { discrete: true });
    const source = codec.encode(editor.getEditorState().toJSON());
    const prepared = codec.prepare(source);
    expect(codec.encode(prepared.state)).toBe(source);
    const restored = createHeadlessEditor(govbbFormEditor, prepared.state, { prepare: false });

    try {
      restored.getEditorState().read(
        () => {
          const mention = $mentionsIn($getRoot())[0]!;
          expect($mentionField(mention)).toBe("missing-answer");
          expect($mentionDefault(mention)).toBe("No answer yet");
          // Mention text is a derived label; an unresolved source reload displays its retained target.
          expect(mention.getTextContent()).toBe("@missing-answer");
        },
        { editor: restored },
      );
      const output = lexicalToLegacySsb(restored.getEditorState(), govbbFormEditor, restored);

      const rule = output
        .schema!.pages.flatMap((page) => page.blocks)
        .find((block) => block.type === "logic")!;

      expect(rule).toMatchObject({
        actions: [
          {
            type: "CALCULATE",
            calculate: { expression: "1 + 2", value: { field: expect.any(String) } },
            changeLabel: { text: "Inactive replacement" },
            jumpToPage: "missing-page",
          },
        ],
      });
    } finally {
      restored.dispose();
    }
  } finally {
    editor.dispose();
  }
});

test("logic navigation preserves folded saved state when already read-only or made read-only before its update", () => {
  const { editor, page, rule } = fixture();
  const originalRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  const update = editor.update.bind(editor);

  try {
    const before = editor.getEditorState().toJSON();
    editor.setEditable(false);
    focusLogic(editor, rule.getKey());
    expect(editor.getEditorState().toJSON()).toEqual(before);
    editor.setEditable(true);
    editor.update = (callback, options) => {
      editor.setEditable(false);
      update(callback, { ...options, discrete: true });
    };

    focusLogic(editor, rule.getKey());
    expect(editor.getEditorState().toJSON()).toEqual(before);
    editor.update = update;
    editor.setEditable(true);
    focusLogic(editor, rule.getKey());
    editor.update(() => {}, { discrete: true });
    editor.getEditorState().read(() => expect($settings(page).folded).toBeUndefined(), { editor });
  } finally {
    editor.update = update;
    globalThis.requestAnimationFrame = originalRaf;
    editor.dispose();
  }
});

test("an absent calculation capability keeps active and inactive payloads saveable and diagnoses only the active action", () => {
  const { editor, rule } = fixture();

  try {
    editor.update(
      () => {
        $getRoot()
          .getChildren()
          .find((node) => $blockKind(node) === "calculated-fields")!
          .remove();
        const active = conditionalLogic($settings(rule)).actions[0]!;
        $setSettings(rule, {
          actions: jsonSetting([
            active,
            { ...active, id: "inactive-calculation", type: "CHANGE_LABEL" },
          ]),
        });
      },
      { discrete: true },
    );
    const source = codec.encode(editor.getEditorState().toJSON());

    const definition = defineFormEditor({
      modules: govbbFormModules.filter((module) => module.key !== "form-calculations"),
    });

    const withoutCalculations = createDraftCodec(createFormRuntime(definition));
    const prepared = withoutCalculations.prepare(source);
    expect(withoutCalculations.encode(prepared.state)).toBe(source);
    const restored = createHeadlessEditor(definition, prepared.state, { prepare: false });

    try {
      const output = lexicalToLegacySsb(restored.getEditorState(), definition, restored);

      const rules = output
        .schema!.pages.flatMap((page) => page.blocks)
        .filter((block) => block.type === "logic");

      expect(rules).toHaveLength(1);
      expect(
        rules[0]!.actions.map((action) => [
          action.type,
          action.calculate?.expression,
          action.changeLabel?.text,
          action.jumpToPage,
        ]),
      ).toEqual([
        ["CALCULATE", "1 + 2", "Inactive replacement", "missing-page"],
        ["CHANGE_LABEL", "1 + 2", "Inactive replacement", "missing-page"],
      ]);
      expect(
        output.diagnostics.filter((issue) => issue.code === "unavailable-logic-action"),
      ).toEqual([
        {
          code: "unavailable-logic-action",
          where: rules[0]!.id,
          message:
            "The calculate action is unavailable in this editor. Its saved settings are retained.",
        },
      ]);
      expect(definition.logicActions.some((action) => action.type === "CALCULATE")).toBe(false);
    } finally {
      restored.dispose();
    }
  } finally {
    editor.dispose();
  }
});
