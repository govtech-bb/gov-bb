import { expect, test } from "vitest";
import { $getRoot } from "lexical";
import { executeAction } from "../../src/editor/core/actions";
import { createHeadlessEditor } from "../../src/editor/core/create-editor";
import { defineFormEditor } from "../../src/forms/definition";
import {
  defineFormRegistry,
  defineFormRegistryEntry,
  type FormRegistryFragment,
} from "../../src/forms/registry/definition";
import { content, question, rule } from "../../src/forms/registry/builders";
import { FormRegistryModule } from "../../src/forms/editor/registry-module";
import { govbbFormModules } from "../../src/presets/govbb-form";
import { lexicalToMarkdown } from "../../src/converters/lexicalToMarkdown";
import { markdownToLexical } from "../../src/converters/markdownToLexical";
import { createFormSourceDialect } from "../../src/forms/source/dialect";
import { nativeHost, nativeOutput } from "../helpers/native-form";

const base = govbbFormModules.filter((module) => !module.registry);

const entry = (blocks: FormRegistryFragment["blocks"]) =>
  defineFormRegistryEntry({
    scope: "fragment",
    key: "custom-record",
    version: 1,
    title: "Record",
    description: "Copied record",
    blocks,
  });

const definitionFor = (value: FormRegistryFragment) =>
  defineFormEditor({ modules: [...base, FormRegistryModule(defineFormRegistry([value]))] });

const field = (id = "record") => question({ id, key: id, kind: "text", label: "Original name" });

test("native registry declarations detach data and enforce catalog identity, payload scope and version", () => {
  const blocks = [question({ ...field(), config: { width: "short" } })],
    original = entry(blocks),
    registry = defineFormRegistry([original]);

  blocks[0]!.config!.width = "long";
  expect(original.blocks[0]).toMatchObject({ config: { width: "short" } });
  expect(Object.isFrozen(original.blocks[0])).toBe(true);
  expect(() => defineFormRegistry([original, original])).toThrow("Duplicate Form registry");
  expect(() => defineFormRegistryEntry({ ...original, version: 0 })).toThrow("version");
  expect(() => defineFormRegistryEntry({ ...original, scope: "page" })).toThrow(
    "begin with a page",
  );
  expect(() =>
    defineFormEditor({
      modules: [
        ...base,
        FormRegistryModule(registry),
        FormRegistryModule(registry, { key: "second-registry" }),
      ],
    }),
  ).toThrow("Duplicate Form registry");
});

test("composition rejects missing native modules, malformed config, duplicate block identities and implicit external references", () => {
  expect(() => definitionFor(entry([question({ ...field(), kind: "unknown" })]))).toThrow(
    "Unsupported native question kind: unknown",
  );
  expect(() =>
    definitionFor(entry([question({ ...field(), config: { width: "invalid" } })])),
  ).toThrow();
  expect(() =>
    definitionFor(entry([field(), content({ id: "record", kind: "paragraph" })])),
  ).toThrow();
  expect(() =>
    definitionFor(
      entry([
        field(),
        rule({
          id: "rule",
          rules: [
            {
              id: "condition",
              when: { op: "empty", value: { answer: "outside" } },
              actions: [{ type: "setRequired", target: "record", value: true }],
            },
          ],
        }),
      ]),
    ),
  ).toThrow("Unknown answer reference");
  expect(() =>
    defineFormEditor({ modules: govbbFormModules.filter((module) => module.key !== "form-logic") }),
  ).toThrow("No installed module supports logic");
});

test("saved native registry copies survive catalog changes or removal without inherited template references", () => {
  const original = entry([
      question({ ...field(), required: { value: true, message: "Enter your name" } }),
    ]),
    definition = definitionFor(original),
    editor = nativeHost(definition);

  let source: string, output: ReturnType<typeof nativeOutput>;

  try {
    expect(
      executeAction(editor, definition, original.key, {
        targetKey: editor.read(() => $getRoot().getLastChild()!.getKey()),
      }).executed,
    ).toBe(true);
    source = lexicalToMarkdown(editor.getEditorState().toJSON(), definition);
    output = nativeOutput(editor, definition);
  } finally {
    editor.dispose();
  }

  const replacement = entry([
    question({ id: "replacement", key: "replacement", kind: "number", label: "Different number" }),
  ]);

  for (const next of [definitionFor(replacement), defineFormEditor({ modules: base })]) {
    const parsed = markdownToLexical(source!, next);
    expect(parsed.state).toBeDefined();
    const restored = createHeadlessEditor(next, parsed.state!);

    try {
      expect(nativeOutput(restored, next)).toEqual(output!);
      expect(lexicalToMarkdown(restored.getEditorState().toJSON(), next)).toBe(source!);
    } finally {
      restored.dispose();
    }
  }
});

test("a newly overridden frozen preset has canonical source on its first write", () => {
  const definition = defineFormEditor({ modules: base });

  const dialect = createFormSourceDialect(
    definition.fields.map((field) => field.source),
    definition.contents.map((content) => content.source),
  );

  const parsed = dialect.readMarkdown(
    '---\nformat: govbb-form\nformatVersion: 2\ntitle: Hidden copied field\n---\n\n# Details\n\n::page{#details}\n\n::text[Name]{#name preset="name"}\n',
  );

  const field = parsed.document!.pages[0]!.blocks[0]!;

  if (field.type !== "question") throw Error("Expected a question");
  field.settings.hidden = true;
  field.settings.width = "short";
  const first = dialect.writeMarkdown(parsed.document!);
  const reloaded = dialect.readMarkdown(first);
  expect(reloaded.diagnostics).toEqual([]);
  expect(dialect.writeMarkdown(reloaded.document!)).toBe(first);
  expect(reloaded.document!.pages[0]!.blocks[0]).toMatchObject({
    settings: { hidden: true, width: "short" },
  });
});
