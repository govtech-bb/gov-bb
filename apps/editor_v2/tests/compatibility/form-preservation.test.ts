import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { $legacyDemo as $demo } from "../helpers/legacy-demo";
import { prepareSource, draftCodec } from "../helpers/default-form";
import { govbbFormRuntime } from "../../src/presets/govbb-form";
import { inspectFormSource, normalizeMigrationRowIds } from "../helpers/form-editor";

const fixture = (name: string) =>
  readFile(new URL(`../fixtures/forms/${name}`, import.meta.url), "utf8");

const browserFixture = (name: string) =>
  readFile(new URL(`../../scripts/browser/fixtures/${name}`, import.meta.url), "utf8");

for (const name of ["demo", "legacy-v1", "legacy-step9", "field-logic-draft"]) {
  test(`${name}: canonical source and SSB projection match the recorded baseline`, async () => {
    const expectedSource = await fixture(`${name}.canonical.md`);

    let source: string;

    if (name === "field-logic-draft") {
      source = prepareSource(await fixture("field-logic-draft.md")).source;
    } else {
      const original =
        name === "demo"
          ? undefined
          : await browserFixture(
              name === "legacy-v1" ? "legacy-markdown-v1.md" : "legacy-step9.json",
            );

      const input =
        name === "demo"
          ? draftCodec.encode(govbbFormRuntime.prepare(undefined, $demo, "legacy"))
          : name === "legacy-v1"
            ? original!
            : draftCodec.encode(draftCodec.prepareLegacy(JSON.parse(original!)));

      source = normalizeMigrationRowIds(prepareSource(input).source);
    }

    expect(source).toBe(expectedSource);
    const inspected = inspectFormSource(source);
    expect(inspected.source).toBe(expectedSource);
    expect(inspected.legacySsb).toEqual(JSON.parse(await fixture(`${name}.legacy-ssb.json`)));
    // A second preparation cannot add rules, change values or rename references.
    expect(inspectFormSource(inspected.source)).toEqual(inspected);
  });
}

test("golden comparisons detect changed submitted values and changed logic targets", async () => {
  const source = await fixture("field-logic-draft.canonical.md");
  const baseline = JSON.parse(await fixture("field-logic-draft.legacy-ssb.json"));

  const changedValue = source.replace(
    'optionValue="registered-business"',
    'optionValue="different-submitted-value"',
  );

  expect(changedValue).not.toBe(source);
  expect(inspectFormSource(changedValue).legacySsb).not.toEqual(baseline);
  const changedTarget = source.replace('"target": "trading-name"', '"target": "email"');
  expect(changedTarget).not.toBe(source);
  expect(inspectFormSource(changedTarget).legacySsb).not.toEqual(baseline);
});

test("normalizing generated logic row IDs preserves target relationships and literal values", () => {
  const id = "12345678-1234-1234-1234-123456789abc";

  const source = `:::logic{#rule}\n\`\`\`json\n${JSON.stringify(
    {
      conditionals: [{ id, type: "SINGLE", field: id, value: id, valueIsLiteral: true }],
      actions: [{ id, type: "CHANGE_LABEL", changeLabel: { target: id, text: id } }],
      optionValue: id,
    },
    null,
    2,
  )}\n\`\`\`\n:::`;

  const normalized = normalizeMigrationRowIds(source);
  expect(normalized).toContain('"id": "migration-condition-1"');
  expect(normalized).toContain('"id": "migration-action-1"');

  for (const key of ["field", "value", "target", "text", "optionValue"])
    expect(normalized).toContain(`"${key}": "${id}"`);
});
