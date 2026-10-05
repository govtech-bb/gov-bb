import { expect, test } from "vitest";
import { defineFormEditor } from "../../src/forms/definition";
import { defineField } from "../../src/forms/field";
import {
  defineNativeField,
  nativeField,
  resolveNativeContent,
  resolveNativeField,
  type NativeContentBlock,
} from "../../src/forms/native";
import type { NativeQuestion, QuestionBase } from "../../src/forms/schema";
import { govbbFormEditor, govbbFormModules } from "../../src/presets/govbb-form";

const choice = (
  selection: "single" | "multiple",
  presentation?: "radio" | "checkboxes" | "dropdown" | "accordion",
): QuestionBase => ({
  type: "question",
  kind: "choice",
  id: "choice",
  key: "choice",
  label: "Choose",
  config: presentation ? { selection, presentation } : { selection },
});

test("each installed field and content module declares a native conversion owner", () => {
  expect(govbbFormEditor.nativeFields).toHaveLength(govbbFormEditor.fields.length);
  expect(govbbFormEditor.nativeContents).toHaveLength(govbbFormEditor.contents.length);
  expect(govbbFormEditor.nativeCapabilities.structural).toEqual(["logic", "calculated"]);
  expect(govbbFormEditor.nativeFeatures.pageRoles).toEqual([
    "questions",
    "review",
    "declaration",
    "confirmation",
    "result",
  ]);
});

test("choice dispatch preserves omitted presentation and never substitutes an absent control", () => {
  for (const [block, expected] of [
    [choice("single"), "multiple-choice"],
    [choice("multiple"), "checkboxes"],
    [choice("single", "dropdown"), "dropdown"],
    [choice("multiple", "accordion"), "checkbox-accordion"],
  ] as const) {
    const before = structuredClone(block);
    expect(resolveNativeField(block, govbbFormEditor)?.kind).toBe(expected);
    expect(block).toEqual(before);
  }

  const withoutRadio = defineFormEditor({
    modules: govbbFormModules
      .filter((module) => !module.registry)
      .map((module) => ({
        ...module,
        fields: module.fields?.filter((field) => field.kind !== "multiple-choice"),
      })),
  });

  expect(resolveNativeField(choice("single"), withoutRadio)).toBeUndefined();
  expect(resolveNativeField(choice("single", "dropdown"), withoutRadio)?.kind).toBe("dropdown");
  expect(resolveNativeField(choice("multiple", "radio"), govbbFormEditor)).toBeUndefined();
});

test("content and structural dispatch select their configured storage owners", () => {
  const cases: [NativeContentBlock, string][] = [
    [{ type: "content", id: "a", kind: "heading", content: "Title", config: { level: 2 } }, "h2"],
    [{ type: "content", id: "b", kind: "callout", content: "Note" }, "inset"],
    [{ type: "content", id: "c", kind: "list", content: "", config: { items: [] } }, "bullet"],
    [{ type: "logic", id: "d", rules: [] }, "logic"],
    [{ type: "calculated", id: "e", valueType: "number" }, "calculated-fields"],
  ];

  for (const [block, owner] of cases) {
    expect(resolveNativeContent(block, govbbFormEditor)?.kind).toBe(owner);
  }
});

test("built-in conversion handlers delegate through their installed kind", () => {
  const block = choice("single", "dropdown");
  const handler = resolveNativeField(block, govbbFormEditor)!.native!;
  const calls: string[] = [];
  expect(
    handler.import(block, {
      importQuestion: (value, kind) => {
        calls.push(kind);
        expect(value).toBe(block);

        return [];
      },
    }),
  ).toEqual([]);
  expect(
    handler.export({
      nodes: [],
      exportQuestion: (kind) => {
        calls.push(kind);

        return block;
      },
    }),
  ).toBe(block);
  expect(calls).toEqual(["dropdown", "dropdown"]);
});

function customField(native = nativeField("external", { kind: "external", valueType: "string" })) {
  return defineField({
    kind: "external",
    label: "External",
    untitled: "External",
    gutterOffset: 0,
    settings: { read: () => ({}), defaults: {} },
    source: { storage: { type: "input", property: "kind", value: "external" } },
    capabilities: { hideLabel: false, repeat: false, formula: false, comparisons: [] },
    native,
  });
}

test("overlapping native claims and feature contributions fail at composition", () => {
  expect(() =>
    defineFormEditor({
      modules: [
        ...govbbFormModules,
        {
          key: "duplicate-native",
          fields: [customField(nativeField("external", { kind: "text", valueType: "string" }))],
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    defineFormEditor({
      modules: [
        ...govbbFormModules,
        { key: "duplicate-feature", nativeCapabilities: { formats: ["number"] } },
      ],
    }),
  ).toThrow("Duplicate native formats");
});

test("typed external native modules validate and rewrite only their declared configuration references", () => {
  type Config = { prefix: string; peer?: string };

  const handler = defineNativeField<"external", Config>({
    kind: "external",
    valueType: "string",
    validate: (block, path) =>
      typeof block.config?.prefix === "string"
        ? []
        : [
            {
              code: "external-prefix",
              severity: "error",
              message: "A prefix is required",
              path: [...path, "config", "prefix"],
              blockId: block.id,
            },
          ],
    references: (block, visit) => {
      const config = { ...block.config! };

      if (config.peer)
        config.peer = visit({
          kind: "answer",
          id: config.peer,
          path: ["config", "peer"],
          blockId: block.id,
        });

      return { ...block, config };
    },
    import: (block, context) => context.importQuestion(block, "external"),
    export: (context) => {
      const { default: _default, ...block } = context.exportQuestion("external");

      return { ...block, kind: "external", config: { prefix: "APP" } };
    },
  });

  const definition = defineFormEditor({
    modules: [...govbbFormModules, { key: "external", fields: [customField(handler)] }],
  });

  const block: NativeQuestion<"external", Config> = {
    type: "question",
    id: "external",
    kind: "external",
    key: "external",
    label: "Reference",
    config: { prefix: "APP", peer: "name" },
  };

  const resolved = resolveNativeField(block, definition)!;
  expect("legacySsb" in resolved).toBe(false);
  expect(resolved.native!.validate!(block, ["blocks", 2])).toEqual([]);
  expect(
    resolved.native!.references!(block, (reference) =>
      reference.id === "name" ? "copied-name" : reference.id,
    ),
  ).toMatchObject({ config: { prefix: "APP", peer: "copied-name" } });
  expect(block.config!.peer).toBe("name");
  expect(resolved.native!.validate!({ ...block, config: {} }, ["blocks", 2])[0]?.path).toEqual([
    "blocks",
    2,
    "config",
    "prefix",
  ]);
});

test("native capability declarations are immutable copies", () => {
  const config = { selection: "single", presentation: "radio" } as const;
  const handler = nativeField("external", { kind: "choice", valueType: "string", config });
  expect(handler.config).not.toBe(config);
  expect(Object.isFrozen(handler.config)).toBe(true);
  expect(Object.isFrozen(govbbFormEditor.nativeCapabilities.fields)).toBe(true);
  expect(Object.isFrozen(govbbFormEditor.nativeFeatures.actions)).toBe(true);
});

// Compile-time examples belong to the production API, not the proposal's fixture-local types.
function typedConfigExample(block: NativeQuestion<"external", { prefix: string }>) {
  const prefix: string | undefined = block.config?.prefix;
  // @ts-expect-error External configuration does not acquire an untyped property bag.
  const unsupported = block.config?.unknownProperty;

  const invalid: NativeQuestion<"external", { prefix: string }> = {
    ...block,
    // @ts-expect-error Configuration properties retain their declared types.
    config: { prefix: 12 },
  };

  return { prefix, unsupported, invalid };
}

test("custom configuration compile-time examples retain declared property types", () => {
  const result = typedConfigExample({
    id: "external",
    type: "question",
    kind: "external",
    key: "external",
    label: "External",
    config: { prefix: "BB" },
  });

  expect(result.prefix).toBe("BB");
  expect(result.unsupported).toBeUndefined();
  expect(result.invalid.config).toMatchObject({ prefix: 12 });
});
