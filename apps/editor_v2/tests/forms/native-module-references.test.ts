import { jsonSettings, settingText } from "../helpers/serialized-test-data";
import { expect, test } from "vitest";
import {
  validateFormDefinition,
  type AnyFormDefinition,
  type NativeSchemaCapabilities,
} from "../../src/forms/schema";

const form: AnyFormDefinition = {
  schemaVersion: 2,
  id: "custom-reference-validation",
  title: "Custom reference validation",
  mode: "application",
  locale: "en-BB",
  timeZone: "America/Barbados",
  settings: { visibility: "draft", hiddenAnswers: "retain" },
  blocks: [
    { id: "page", type: "page", role: "questions", title: "Details" },
    { id: "person", type: "question", kind: "text", key: "person", label: "Person" },
    {
      id: "reference",
      type: "question",
      kind: "external",
      key: "reference",
      label: "Reference",
      config: { peer: "person", literal: "not-a-reference" },
    },
  ],
};

const capabilities: NativeSchemaCapabilities = {
  fields: [
    { kind: "text", valueType: "string" },
    {
      kind: "external",
      valueType: "string",
      validate: () => [],
      references: (block, visit) => {
        const config = jsonSettings(block.config);

        const peer = settingText(config.peer),
          scope = config.scope;

        if (scope !== undefined && scope !== "form" && scope !== "current")
          throw Error("Invalid reference scope");
        visit({
          kind: "answer",
          id: peer,
          path: ["config", "peer"],
          ...(scope && { scope }),
        });

        return block;
      },
    },
  ],
  contents: [{ kind: "paragraph" }],
};

test("custom module references receive native existence, kind and repeat-scope checks without scanning literals", () => {
  expect(validateFormDefinition(form, capabilities).status).toBe("ready");

  for (const [peer, code] of [
    ["missing", "reference-missing"],
    ["page", "reference-kind"],
  ]) {
    const next = structuredClone(form),
      field = next.blocks[2]!;

    if (field.type !== "question") throw Error();
    field.config = { peer };
    expect(validateFormDefinition(next, capabilities).diagnostics).toContainEqual(
      expect.objectContaining({
        code,
        blockId: "reference",
        path: ["blocks", 2, "config", "peer"],
      }),
    );
  }

  const scoped = structuredClone(form);
  scoped.blocks.splice(2, 0, {
    id: "repeat",
    type: "page",
    role: "questions",
    title: "Entries",
    repeat: { key: "entries", min: 0, addLabel: "Add entry" },
  });
  expect(
    validateFormDefinition(scoped, capabilities).diagnostics.some(
      (issue) => issue.code === "reference-scope",
    ),
  ).toBe(true);
  const field = scoped.blocks[3]!;

  if (field.type !== "question") throw Error();
  field.config = { peer: "person", scope: "form" };
  expect(validateFormDefinition(scoped, capabilities).status).toBe("ready");
});

test("context display formats require the right value type and an installed format capability", () => {
  const next = structuredClone(form);
  next.blocks.push({
    id: "message",
    type: "content",
    kind: "paragraph",
    content: [{ context: "today", format: { type: "currency", currency: "BBD" } }],
  });
  expect(
    validateFormDefinition(next, capabilities).diagnostics.some(
      (issue) => issue.code === "format-type",
    ),
  ).toBe(true);
  const message = next.blocks.at(-1)!;

  if (message.type !== "content") throw Error();
  message.content = [{ context: "today", format: { type: "date" } }];
  expect(
    validateFormDefinition(next, { ...capabilities, formats: [] }).diagnostics.some(
      (issue) => issue.code === "missing-module",
    ),
  ).toBe(true);
  expect(validateFormDefinition(next, { ...capabilities, formats: ["date"] }).status).toBe("ready");
});

test("invalid custom configuration skips its reference hook while other broken references remain visible", () => {
  const invalid = structuredClone(form);
  invalid.blocks.push({
    id: "broken-copy",
    type: "content",
    kind: "paragraph",
    content: [{ answer: "missing-answer" }],
  });
  let visited = false;

  const configured: NativeSchemaCapabilities = {
    ...capabilities,
    fields: [
      capabilities.fields[0]!,
      {
        kind: "external",
        valueType: "string",
        validate: (_block, path) => [
          { code: "custom-config", severity: "error", message: "Add a peer", path },
        ],
        references: () => {
          visited = true;
          throw Error("Invalid configuration cannot be read");
        },
      },
    ],
  };

  const result = validateFormDefinition(invalid, configured);
  expect(result.status).toBe("blocked");
  expect(visited).toBe(false);
  expect(result.diagnostics.map((issue) => issue.code)).toContain("custom-config");
  expect(result.diagnostics.map((issue) => issue.code)).toContain("reference-missing");
});

test("custom callback failures return located errors and preserve the input", () => {
  for (const callback of ["validate", "references"] as const) {
    const configured: NativeSchemaCapabilities = {
      ...capabilities,
      fields: [
        capabilities.fields[0]!,
        {
          kind: "external",
          valueType: "string",
          validate: () => [],
          [callback]: () => {
            throw Error("Custom module failure");
          },
        },
      ],
    };

    const before = structuredClone(form),
      result = validateFormDefinition(form, configured);

    expect(result.status).toBe("blocked");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: callback === "validate" ? "module-validation" : "module-references",
        blockId: "reference",
        path: ["blocks", 2],
        message: "Custom module failure",
      }),
    );
    expect(form).toEqual(before);
  }
});
