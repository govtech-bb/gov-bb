import { jsonSettings, serializedNodes, settingsObject } from "../helpers/serialized-test-data";
import { defineLegacyField, type LegacyFieldDefinition } from "../../src/forms/legacy";
import { expect, test } from "vitest";
import { InputNode } from "../../src/forms/editor/answer-nodes";
import { defineField } from "../../src/forms/field";
import { defineFormEditor } from "../../src/forms/definition";
import type { FieldStorage } from "../../src/forms/core/fields";
import type { Settings } from "../../src/forms/core/settings";
import type { SourceQuestion } from "../../src/forms/source/model";
import { createFormSourceDialect } from "../../src/forms/source/dialect";

type CodeSettings = { code: string; destination?: string };

const read = (raw: Settings): CodeSettings => {
  const value: CodeSettings = { code: String(raw.code ?? "") };

  if (typeof raw.destination === "string") value.destination = raw.destination;

  return value;
};

const capabilities = { hideLabel: true, repeat: false, formula: false, comparisons: [] };

const field = (
  kind: string,
  storage: FieldStorage = { type: "input", property: "kind", value: kind },
) =>
  defineField({
    kind,
    label: "Account code",
    untitled: "Untitled account code",
    gutterOffset: 11,
    settings: { read, defaults: {} },
    source: { storage },
    capabilities,
  });

const rawDocument = (kind: string) => ({
  root: { type: "root", version: 1, children: [{ type: "input", kind, version: 1, children: [] }] },
});

test("field declarations snapshot callbacks and deeply detach mutable defaults and source metadata", () => {
  const drawn = Error("Original draw");
  const attributes = { code: "string" } satisfies Record<string, "string" | "number">;
  const defaults = { nested: { values: ["original"] } };

  const declaration = {
    kind: "account-code",
    label: "Account code",
    untitled: "Untitled account code",
    gutterOffset: 11,
    settings: { read, defaults },
    source: {
      storage: { type: "input", property: "kind", value: "account-code" },
      attributes,
      properties: ["ledger"],
      fromNode: (
        _node: Parameters<
          NonNullable<LegacyFieldDefinition<CodeSettings>["source"]["fromNode"]>
        >[0],
        question: SourceQuestion,
      ): SourceQuestion => ({
        ...question,
        label: "Original source",
      }),
    },
    capabilities: { ...capabilities, comparisons: ["IS" as const] },
    draw: (settings: CodeSettings): HTMLElement => {
      expect(settings.code).toBe("007");

      throw drawn;
    },
    redraw: (before: CodeSettings, after: CodeSettings): boolean => before.code !== after.code,
    validate: (settings: CodeSettings, _raw: Settings, where: string) => [
      { code: "original", message: settings.code, where },
    ],
    legacySsb: {
      ref: "components/account-code",
      settings: (settings: CodeSettings, _raw: Settings): Settings => ({
        submitted: settings.code,
      }),
      rules: (settings: CodeSettings, _raw: Settings) => [
        { rule: "pattern" as const, label: "Original rule", value: settings.code },
      ],
    },
  } satisfies LegacyFieldDefinition<CodeSettings>;

  const resolved = defineLegacyField(declaration);
  defaults.nested.values[0] = "changed";
  declaration.settings.read = () => ({ code: "changed" });
  declaration.source.storage.value = "changed";
  Object.assign(declaration.source.attributes, { code: "number" });
  declaration.source.properties[0] = "changed";
  declaration.source.fromNode = (_node, question) => ({ ...question, label: "Changed source" });
  declaration.capabilities.comparisons.length = 0;
  declaration.draw = () => {
    throw Error("Changed draw");
  };

  declaration.redraw = () => false;
  declaration.validate = () => [];
  declaration.legacySsb.settings = () => ({ changed: true });
  declaration.legacySsb.rules = () => [];
  expect(resolved.defaults).toEqual({ nested: { values: ["original"] } });
  expect(Object.isFrozen(settingsObject(resolved.defaults.nested).values)).toBe(true);
  expect(resolved.source.storage.value).toBe("account-code");
  expect(Object.isFrozen(resolved.source.storage)).toBe(true);
  expect(resolved.source.attributes).toEqual({ code: "string" });
  expect(resolved.source.properties).toEqual(["ledger"]);
  expect(Object.isFrozen(resolved.source.properties)).toBe(true);
  expect(resolved.capabilities.comparisons).toEqual(["IS"]);
  expect(() => resolved.draw!({ code: "007" })).toThrow(drawn);
  expect(resolved.redraw!({ code: "006" }, { code: "007" })).toBe(true);
  expect(resolved.validate({ code: "007" }, "Account")).toEqual([
    { code: "original", message: "007", where: "Account" },
  ]);
  expect(resolved.legacySsb!.settings({ code: "007" })).toEqual({ submitted: "007" });
  expect(resolved.legacySsb!.rules({ code: "007" })).toEqual([
    { rule: "pattern", label: "Original rule", value: "007" },
  ]);
  expect(
    resolved.source.fromNode!(
      { type: "input" },
      { type: "question", key: "code", kind: "account-code", hints: [], settings: {} },
    ).label,
  ).toBe("Original source");
});

test("typed reference handlers change only declared references and keep unknown authored settings", () => {
  const resolved = defineField<CodeSettings>({
    kind: "account-code",
    label: "Account code",
    untitled: "Untitled account code",
    gutterOffset: 11,
    settings: { read, defaults: {} },
    source: { storage: { type: "input", property: "kind", value: "account-code" } },
    capabilities,
    references: (settings, visit) => ({
      destination:
        settings.destination &&
        visit({ kind: "field", value: settings.destination, path: ["destination"] }),
    }),
  });

  const raw = {
    code: "source-id",
    destination: "source-id",
    unknown: { value: "source-id" },
    unfinished: "-",
  };

  const original = JSON.stringify(raw),
    visited: unknown[] = [];

  const mapped = resolved.source.mapReferences!(raw, (reference) => {
    visited.push(reference);

    return "copied-id";
  });

  expect(mapped).toEqual({ ...raw, destination: "copied-id" });
  expect(visited).toEqual([{ kind: "field", value: "source-id", path: ["destination"] }]);
  expect(JSON.stringify(raw)).toBe(original);
  expect(mapped.unknown).not.toBe(raw.unknown);
  expect(resolved.source.mapReferences!({ code: "007" }, () => "unused")).toEqual({ code: "007" });
});

test("form composition rejects duplicate field identities and semantically identical storage declarations", () => {
  const first = field("account-code");
  expect(() =>
    defineFormEditor({
      modules: [
        { key: "first", fields: [first] },
        { key: "second", fields: [first] },
      ],
    }),
  ).toThrow("Duplicate field definition: account-code");

  const sameStorage = field("alternate-code", {
    value: "account-code",
    property: "kind",
    type: "input",
  });

  expect(() =>
    defineFormEditor({
      modules: [
        { key: "first", fields: [first] },
        { key: "second", fields: [sameStorage] },
      ],
    }),
  ).toThrow("Duplicate field definition: alternate-code");
});

test("ambiguous wildcard and competing discriminator claims cannot depend on module order", () => {
  const pairs = [
    [field("any-input", { type: "input" }), field("text")],
    [
      field("by-kind", { type: "account-input", property: "kind", value: "code" }),
      field("by-flavor", { type: "account-input", property: "flavor", value: "code" }),
    ],
  ];

  for (const pair of pairs)
    for (const order of [pair, [...pair].reverse()]) {
      expect(() =>
        defineFormEditor({ modules: order.map((entry) => ({ key: entry.kind, fields: [entry] })) }),
      ).toThrow();
    }

  expect(
    defineFormEditor({
      modules: [
        {
          key: "distinct",
          nodes: [{ type: "input", node: InputNode }],
          fields: [field("first"), field("second")],
        },
      ],
    }).fields,
  ).toHaveLength(2);
});

test("form discriminator validation retains shared node identity and snapshots the original validator", () => {
  const declaration = {
    type: "input",
    node: InputNode,
    validate: (): string | undefined => "Original input validation",
  };

  const definition = defineFormEditor({
    modules: [
      { key: "first", nodes: [declaration], fields: [field("account-code")] },
      { key: "second", nodes: [declaration] },
    ],
  });

  expect(definition.nodes).toHaveLength(1);
  declaration.validate = () => undefined;
  expect(() => definition.validateDocument(rawDocument("account-code"))).toThrow(
    "Original input validation",
  );
  expect(() => definition.validateDocument(rawDocument("uninstalled"))).toThrow("uninstalled");
});

test("a third field owns typed source attributes and payload conversion without changing the shared dialect", () => {
  const calls: string[] = [];

  const resolved = defineField<CodeSettings>({
    kind: "account-code",
    label: "Account code",
    untitled: "Untitled account code",
    gutterOffset: 11,
    settings: { read, defaults: {} },
    capabilities,
    source: {
      storage: { type: "input", property: "kind", value: "account-code" },
      attributes: { code: "string" },
      toNode: (question, node) => {
        calls.push("to-node");

        const state = jsonSettings(node.$),
          settings = jsonSettings(state.settings);

        settings.ledger = { code: question.settings.code! };
        delete settings.code;

        return { ...node, $: { ...state, settings } };
      },
      fromNode: (node, question) => {
        calls.push("from-node");

        const raw = jsonSettings(jsonSettings(node.$).settings),
          settings = { ...question.settings };

        settings.code = jsonSettings(raw.ledger).code!;
        delete settings.ledger;

        return { ...question, settings };
      },
    },
  });

  const dialect = createFormSourceDialect([resolved.source]);

  const source =
    '---\nformat: govbb-form\nformatVersion: 2\ntitle: Accounts\n---\n\n# Account\n\n::page{#accounts}\n\n::account-code[Account code]{#account code="007"}\n';

  const parsed = dialect.readMarkdown(source);
  expect(parsed.diagnostics).toEqual([]);
  calls.length = 0;
  const state = dialect.toEditor(parsed.document!);

  const answer = serializedNodes(state).find((node) => node.type === "input");
  expect(answer?.$?.settings?.ledger).toEqual({ code: "007" });
  expect(answer?.$?.settings?.code).toBeUndefined();

  const returned = dialect.fromEditor(state);
  expect(calls).toEqual(["to-node", "from-node"]);
  expect(dialect.semanticFingerprint(returned)).toBe(dialect.semanticFingerprint(parsed.document!));
  expect(dialect.writeMarkdown(returned)).toContain('code="007"');
  const absent = createFormSourceDialect([]).readMarkdown(source);
  expect(absent.document).toBeUndefined();
  expect(absent.diagnostics.some((issue) => issue.severity === "fatal")).toBe(true);
});

test("source handlers own field kinds independently of their Lexical node type", () => {
  const resolved = field("account-code", { type: "account-input" });
  const dialect = createFormSourceDialect([resolved.source]);

  const source =
    "---\nformat: govbb-form\nformatVersion: 2\ntitle: Accounts\n---\n\n# Account\n\n::page{#accounts}\n\n::account-code[Code]{#account}\n";

  const parsed = dialect.readMarkdown(source);
  expect(parsed.diagnostics).toEqual([]);
  const state = dialect.toEditor(parsed.document!);
  expect(state.root.children.some((node) => node.type === "account-input")).toBe(true);
  const returned = dialect.fromEditor(state);
  expect(returned.pages[0]!.blocks[0]).toMatchObject({ type: "question", kind: "account-code" });
  const rewritten = dialect.writeMarkdown(returned);
  expect(rewritten).toContain("::account-code[Code]");
  expect(dialect.readMarkdown(rewritten).diagnostics).toEqual([]);
});

test("custom attributes are typed by the owning field, independently of module order", () => {
  const makeField = (kind: string, type: "string" | "number" | "boolean") =>
    defineField<CodeSettings>({
      kind,
      label: kind,
      untitled: kind,
      gutterOffset: 11,
      settings: { read, defaults: {} },
      capabilities,
      source: {
        storage: { type: "input", property: "kind", value: kind },
        attributes: { value: type, min: type },
      },
    });

  const fields = [
    makeField("code", "string"),
    makeField("count", "number"),
    makeField("enabled", "boolean"),
  ];

  const source =
    '---\nformat: govbb-form\nformatVersion: 2\ntitle: Settings\n---\n\n# Settings\n\n::page{#settings}\n\n::code[Code]{#code value="007" min="001"}\n\n::count[Count]{#count value="7" min="1"}\n\n::enabled[Enabled]{#enabled value="false" min="false"}\n';

  for (const order of [fields, [...fields].reverse()]) {
    const dialect = createFormSourceDialect(order.map((entry) => entry.source));
    const parsed = dialect.readMarkdown(source);
    expect(parsed.diagnostics).toEqual([]);
    expect(
      parsed.document!.pages[0]!.blocks.map(
        (block) => block.type === "question" && block.settings.value,
      ),
    ).toEqual(["007", 7, false]);
    expect(
      parsed.document!.pages[0]!.blocks.map(
        (block) => block.type === "question" && block.settings.min,
      ),
    ).toEqual(["001", 1, false]);

    const returned = dialect.readMarkdown(
      dialect.writeMarkdown(dialect.fromEditor(dialect.toEditor(parsed.document!))),
    );

    expect(returned.diagnostics).toEqual([]);
    expect(
      returned.document!.pages[0]!.blocks.map(
        (block) => block.type === "question" && block.settings.value,
      ),
    ).toEqual(["007", 7, false]);
    expect(
      returned.document!.pages[0]!.blocks.map(
        (block) => block.type === "question" && block.settings.min,
      ),
    ).toEqual(["001", 1, false]);
  }
});

test("owned raw node properties survive source hooks while unclaimed properties stay recoverable", () => {
  let restored = 0,
    saved = 0;

  const resolved = defineField<CodeSettings>({
    kind: "account-code",
    label: "Account code",
    untitled: "Untitled account code",
    gutterOffset: 11,
    settings: { read, defaults: {} },
    capabilities,
    source: {
      storage: { type: "account-input" },
      properties: ["ledger"],
      toNode: (_question, node) => {
        expect(node.ledger).toEqual({ code: "007", active: false });
        restored++;

        return node;
      },
      fromNode: (node, question) => {
        expect(node.ledger).toEqual({ code: "007", active: false });
        saved++;

        return question;
      },
    },
  });

  const source =
    '---\nformat: govbb-form\nformatVersion: 2\ntitle: Accounts\n---\n\n# Account\n\n::page{#accounts}\n\n::account-code[Code]{#account}\n\n:::source-state\n```json\n{"questions":{"account":{"answer":{"properties":{"ledger":{"code":"007","active":false}}}}}}\n```\n:::\n';

  const dialect = createFormSourceDialect([resolved.source]);
  const parsed = dialect.readMarkdown(source);
  expect(parsed.diagnostics).toEqual([]);
  const state = dialect.toEditor(parsed.document!);
  expect(state.root.children.find((node) => node.type === "account-input")).toMatchObject({
    ledger: { code: "007", active: false },
  });
  const returned = dialect.readMarkdown(dialect.writeMarkdown(dialect.fromEditor(state)));
  expect(returned.diagnostics).toEqual([]);
  expect(dialect.toEditor(returned.document!)).toEqual(state);
  expect(saved).toBeGreaterThan(0);
  expect(restored).toBeGreaterThan(0);

  const unclaimed = createFormSourceDialect([{ ...resolved.source, properties: [] }]).readMarkdown(
    source,
  );

  expect(unclaimed.document).toBeUndefined();
  expect(unclaimed.original).toBe(source);
  expect(unclaimed.diagnostics.some((issue) => issue.severity === "fatal")).toBe(true);
});

test("field readiness diagnostics retain invalid raw widths without making the draft unloadable", async () => {
  const { shortAnswerField } = await import("../../src/forms/features/short-answer/definition");

  for (const width of [42, null, ["short"], { draft: "unfinished" }, "wide"]) {
    const raw = { width };
    expect(shortAnswerField.validate(raw, "question")).toContainEqual({
      code: "field-width",
      message: "Field width must be short, medium or long",
      where: "question",
    });
    expect(raw.width).toEqual(width);
  }
});

test("field composition rejects missing nodes, conflicting discriminators and ambiguous storage defaults", () => {
  const node = { type: "input", node: InputNode };
  expect(() =>
    defineFormEditor({ modules: [{ key: "missing", fields: [field("code")] }] }),
  ).toThrow("requires node input");

  const first = field("first", {
    type: "input",
    property: "kind",
    value: "first",
    defaultValue: "first",
  });

  const second = field("second", {
    type: "input",
    property: "kind",
    value: "second",
    defaultValue: "second",
  });

  for (const fields of [
    [first, second],
    [second, first],
  ])
    expect(() =>
      defineFormEditor({ modules: [{ key: "ambiguous", nodes: [node], fields }] }),
    ).toThrow("Conflicting defaults");
  expect(() =>
    defineFormEditor({
      modules: [
        {
          key: "mismatch",
          nodes: [node],
          fields: [first],
          storageFamilies: [{ type: "input", property: "flavor", defaultValue: "first" }],
        },
      ],
    }),
  ).toThrow("conflicts with storage family");
  expect(() =>
    defineFormEditor({
      modules: [
        {
          key: "mismatch",
          nodes: [node],
          fields: [first],
          storageFamilies: [{ type: "input", property: "kind", defaultValue: "second" }],
        },
      ],
    }),
  ).toThrow("conflicts with storage family");

  const configured = defineFormEditor({
    modules: [{ key: "valid", nodes: [node], fields: [field("second"), first] }],
  });

  expect(() =>
    configured.validateDocument({
      root: { type: "root", version: 1, children: [{ type: "input", version: 1, children: [] }] },
    }),
  ).not.toThrow();
});
