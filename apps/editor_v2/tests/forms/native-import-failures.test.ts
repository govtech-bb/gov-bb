import { describe, expect, test } from "vitest";
import { COMMAND_PRIORITY_EDITOR, createCommand, type LexicalEditor } from "lexical";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { installedEditorDefinition } from "../../src/editor/core/context";
import { setEditorReadOnly } from "../../src/editor/core/editability";
import { formSchemaToLexical } from "../../src/converters/formSchemaToLexical";
import { lexicalToFormSchema } from "../../src/converters/lexicalToFormSchema";
import { defineFormEditor } from "../../src/forms/definition";
import type { FormModule } from "../../src/forms/field";
import type { AnyFormDefinition } from "../../src/forms/schema";
import type { NativeFieldExportContext } from "../../src/forms/native";
import { govbbFormEditor, govbbFormModules } from "../../src/presets/govbb-form";

const form: AnyFormDefinition = {
  schemaVersion: 2,
  id: "isolated-import",
  title: "Isolated import",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "draft", hiddenAnswers: "retain" },
  blocks: [
    { id: "details", type: "page", role: "questions", title: "Details" },
    { id: "name", type: "question", kind: "text", key: "name", label: "Your name" },
  ],
};

const command = createCommand<void>("native-import-probe");

type Failure =
  | "validator"
  | "import handler"
  | "document validator"
  | "registration"
  | "normalizer"
  | "export handler"
  | "preservation";

function configuredFailure(stage?: Failure) {
  const captured: LexicalEditor[] = [];

  let registered = 0,
    cleaned = 0;

  const fail = () => {
    throw new Error(`Injected ${stage} failure`);
  };

  const modules: FormModule[] = govbbFormModules
    .filter((module) => !module.registry)
    .map((module) => ({
      ...module,
      fields: module.fields?.map((field) => {
        if (field.kind !== "text") return field;
        const native = { ...field.native! };

        if (stage === "validator") native.validate = fail;

        if (stage === "import handler") native.import = fail;

        if (stage === "export handler") native.export = fail;

        if (stage === "preservation")
          native.export = (context: NativeFieldExportContext) => ({
            ...field.native!.export(context),
            label: "Lost original label",
          });

        return { ...field, native };
      }),
      nodes:
        stage === "document validator"
          ? module.nodes?.map((node) =>
              node.type === "input" ? { ...node, validate: fail } : node,
            )
          : module.nodes,
    }));

  const probe: FormModule = {
    key: "native-import-probe",
    registrations: [
      {
        key: "native-import-probe",
        phase: "document",
        register(editor) {
          captured.push(editor);
          registered++;
          const unregister = editor.registerCommand(command, () => true, COMMAND_PRIORITY_EDITOR);

          return () => {
            cleaned++;
            unregister();
          };
        },
      },
      ...(stage === "registration"
        ? [{ key: "native-import-fault", phase: "document" as const, register: fail }]
        : []),
    ],
  };

  modules.push(stage === "normalizer" ? { ...probe, $normalizeInitial: fail } : probe);

  return {
    definition: defineFormEditor({ modules }),
    captured,
    counts: () => ({ registered, cleaned }),
  };
}

function expectReleased(probe: ReturnType<typeof configuredFailure>, allocated: number) {
  expect(probe.counts()).toEqual({ registered: allocated, cleaned: allocated });
  expect(probe.captured).toHaveLength(allocated);

  for (const editor of probe.captured) {
    expect(installedEditorDefinition(editor)).toBeUndefined();
    expect(editor.dispatchCommand(command, undefined)).toBe(false);
    expect(editor.getRootElement()).toBeNull();
    expect(() => setEditorReadOnly(editor, true)).toThrow(
      "Editor editability ownership is missing",
    );
  }
}

describe("native import failure isolation", () => {
  for (const stage of [
    "validator",
    "import handler",
    "document validator",
    "registration",
    "normalizer",
    "export handler",
  ] as const) {
    test(`${stage} failure returns the untouched original and releases temporary editor ownership`, () => {
      const probe = configuredFailure(stage),
        original = structuredClone(form),
        before = structuredClone(original);

      const result = formSchemaToLexical(original, probe.definition);
      expect(result.status).toBe("blocked");
      expect(result).not.toHaveProperty("state");

      if (result.status !== "blocked") throw new Error("Fault injection unexpectedly imported");
      expect(result.recovery.original).toBe(original);
      expect(original).toEqual(before);
      expect(result.diagnostics).toContainEqual(
        stage === "validator"
          ? {
              code: "module-validation",
              severity: "error",
              path: ["blocks", 1],
              blockId: "name",
              message: `Injected ${stage} failure`,
            }
          : {
              code: "native-import",
              severity: "error",
              path: [],
              message: `Injected ${stage} failure`,
            },
      );
      expectReleased(
        probe,
        ["registration", "normalizer", "export handler"].includes(stage) ? 1 : 0,
      );
    });
  }

  test("preservation rejection releases the temporary editor and retains the exact original", () => {
    const probe = configuredFailure("preservation"),
      original = structuredClone(form);

    const result = formSchemaToLexical(original, probe.definition);
    expect(result.status).toBe("blocked");

    if (result.status !== "blocked") throw new Error("Lossy handler unexpectedly imported");
    expect(result.recovery.original).toBe(original);
    expect(original).toEqual(form);
    expect(result.diagnostics.map((issue) => issue.code)).toContain("native-preservation");
    expectReleased(probe, 1);
  });

  test("successful preparation also releases temporary editor registrations and ownership", () => {
    const probe = configuredFailure();
    expect(formSchemaToLexical(form, probe.definition).status).toBe("ready");
    expectReleased(probe, 1);
  });

  test("wrong-owner export rejects the definition without changing either editor", () => {
    const prepared = formSchemaToLexical(form, govbbFormEditor);

    if (prepared.status !== "ready") throw new Error("Fixture import failed");

    const otherDefinition = defineFormEditor({
      modules: govbbFormModules,
      namespace: "another-owner",
    });

    const first = createHeadlessEditor(govbbFormEditor, prepared.state);
    const second = createHeadlessEditor(otherDefinition, prepared.state);

    try {
      const before = [first.getEditorState().toJSON(), second.getEditorState().toJSON()];
      expect(() => lexicalToFormSchema(first.getEditorState(), otherDefinition, first)).toThrow(
        "Form reads must use this editor's installed definition",
      );
      expect(() => lexicalToFormSchema(second.getEditorState(), govbbFormEditor, second)).toThrow(
        "Form reads must use this editor's installed definition",
      );
      expect([first.getEditorState().toJSON(), second.getEditorState().toJSON()]).toEqual(before);
      expect(lexicalToFormSchema(first.getEditorState(), govbbFormEditor, first).status).toBe(
        "ready",
      );
      expect(lexicalToFormSchema(second.getEditorState(), otherDefinition, second).status).toBe(
        "ready",
      );
    } finally {
      first.dispose();
      second.dispose();
    }
  });
});
