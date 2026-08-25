import { canonicalizeRecipe, serializeRecipe } from "./canonical-json";

/** A minimal but structurally complete recipe, deliberately mis-ordered. */
const misordered = {
  updatedAt: "2026-08-25T00:00:00.000Z",
  title: "Apply for a thing",
  formId: "apply-for-a-thing",
  createdAt: "2026-08-24T00:00:00.000Z",
  steps: [
    {
      elements: [
        {
          overrides: {
            validations: { required: { value: true, error: "Enter a name." } },
            label: "Your name",
            fieldId: "your-name",
          },
          ref: "components/generic-text",
        },
      ],
      title: "Your details",
      stepId: "your-details",
    },
  ],
};

describe("canonicalizeRecipe", () => {
  it("orders keys by schema declaration order", () => {
    const out = canonicalizeRecipe(misordered);

    expect(Object.keys(out)).toEqual([
      "formId",
      "title",
      "steps",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("orders nested step, element and override keys", () => {
    const out = canonicalizeRecipe(misordered) as typeof misordered;
    const step = out.steps[0];
    const element = step.elements[0];

    expect(Object.keys(step)).toEqual(["stepId", "title", "elements"]);
    expect(Object.keys(element)).toEqual(["ref", "overrides"]);
    expect(Object.keys(element.overrides)).toEqual([
      "fieldId",
      "label",
      "validations",
    ]);
  });

  it("orders keys inside a validation rule", () => {
    const out = canonicalizeRecipe(misordered) as typeof misordered;
    const required = out.steps[0].elements[0].overrides.validations.required;

    // `error` is declared before `value` in requiredRuleSchema.
    expect(Object.keys(required)).toEqual(["error", "value"]);
  });

  it("is value-preserving — nothing dropped, added or changed", () => {
    // Deep equality ignores key order, so this asserts canonicalization only
    // ever reorders.
    expect(canonicalizeRecipe(misordered)).toEqual(misordered);
  });

  it("is idempotent", () => {
    const once = canonicalizeRecipe(misordered);

    expect(canonicalizeRecipe(once)).toEqual(once);
    expect(JSON.stringify(canonicalizeRecipe(once))).toBe(JSON.stringify(once));
  });

  it("keeps unenumerated top-level fields instead of stripping them", () => {
    // The #2397 guarantee: `carryUnauthoredFields` re-attaches recipe fields the
    // builder never authored, so canonicalization must not drop what the schema
    // does not enumerate. This is why it cannot be `schema.parse(recipe)`.
    const withUnknown = {
      ...misordered,
      catchmentRouting: { parishField: "your-details.parish" },
      futureFieldNobodyHasAddedYet: { nested: "value" },
    };

    const out = canonicalizeRecipe(withUnknown);

    expect(out).toEqual(withUnknown);
    expect(Object.keys(out)).toEqual([
      "formId",
      "title",
      "steps",
      "createdAt",
      "updatedAt",
      "catchmentRouting",
      "futureFieldNobodyHasAddedYet",
    ]);
  });

  it("appends unknown nested keys after the schema-ordered ones", () => {
    const out = canonicalizeRecipe({
      ...misordered,
      steps: [
        {
          somethingNew: true,
          title: "Your details",
          stepId: "your-details",
          elements: [],
        },
      ],
    }) as { steps: Record<string, unknown>[] };

    expect(Object.keys(out.steps[0])).toEqual([
      "stepId",
      "title",
      "elements",
      "somethingNew",
    ]);
  });

  it("preserves the relative order of several unknown keys", () => {
    const out = canonicalizeRecipe({ ...misordered, zeta: 1, alpha: 2 });

    expect(Object.keys(out).slice(-2)).toEqual(["zeta", "alpha"]);
  });

  it("orders validation rule names by the ValidationType enum order", () => {
    // `validations` is a z.partialRecord keyed by the validationTypeSchema
    // enum, so its rule names DO have a declared order even though a record's
    // keys usually do not. Without this, a recipe writing `maxSize` before
    // `required` still diffed against one writing it after (#2487).
    const out = canonicalizeRecipe({
      ...misordered,
      steps: [
        {
          stepId: "s",
          title: "S",
          elements: [
            {
              ref: "components/generic-file",
              overrides: {
                validations: {
                  maxSize: { value: 20971520, error: "Too big" },
                  fileTypes: { value: ["application/pdf"] },
                  required: { value: true, error: "Attach a file." },
                },
              },
            },
          ],
        },
      ],
    }) as { steps: { elements: { overrides: { validations: object } }[] }[] };

    expect(Object.keys(out.steps[0].elements[0].overrides.validations)).toEqual(
      ["required", "fileTypes", "maxSize"],
    );
  });

  it("preserves key order in a record with an open key type", () => {
    // A block element's overrides are keyed by fieldId (z.record(string, …)):
    // arbitrary ids with no declared order, so they must be left alone.
    const out = canonicalizeRecipe({
      ...misordered,
      steps: [
        {
          stepId: "s",
          title: "S",
          elements: [
            {
              ref: "blocks/address",
              overrides: {
                "line-2": { label: "Line 2" },
                "line-1": { label: "Line 1" },
              },
            },
          ],
        },
      ],
    }) as { steps: { elements: { overrides: object }[] }[] };

    expect(Object.keys(out.steps[0].elements[0].overrides)).toEqual([
      "line-2",
      "line-1",
    ]);
  });

  it("leaves an element untouched when no union member validates it", () => {
    // Union members are resolved by safeParse, so an element carrying anything
    // schema-invalid (here an unknown validation rule name) matches neither
    // member and keeps its existing order. That is the deliberate safe
    // direction — no reorder beats a wrong reorder — and such a recipe cannot
    // reach the repo anyway: `pnpm validate-recipes` rejects it.
    const element = {
      overrides: { validations: { someFutureRule: { value: 1 } } },
      ref: "components/generic-text",
    };
    const out = canonicalizeRecipe({
      ...misordered,
      steps: [{ stepId: "s", title: "S", elements: [element] }],
    }) as { steps: { elements: object[] }[] };

    expect(Object.keys(out.steps[0].elements[0])).toEqual(["overrides", "ref"]);
  });

  it("picks the union member that matches the data", () => {
    // The `elements` union is NOT discriminated: both members are shaped
    // `{ ref, overrides }` and differ only in whether `overrides` is a single
    // FieldOverrides (components/) or a fieldId -> FieldOverrides map (blocks/).
    const out = canonicalizeRecipe({
      ...misordered,
      steps: [
        {
          stepId: "your-details",
          title: "Your details",
          elements: [
            {
              overrides: {
                "line-1": { label: "Line 1", fieldId: "line-1" },
              },
              ref: "blocks/address",
            },
          ],
        },
      ],
    }) as { steps: { elements: { overrides: Record<string, object> }[] }[] };

    const element = out.steps[0].elements[0];
    expect(Object.keys(element)).toEqual(["ref", "overrides"]);
    // Record values are canonicalized through the record's value schema.
    expect(Object.keys(element.overrides["line-1"])).toEqual([
      "fieldId",
      "label",
    ]);
  });

  it("orders processor config keys", () => {
    const out = canonicalizeRecipe({
      ...misordered,
      processors: [
        {
          config: {
            subject: "Application received",
            recipientField: "your-details.email",
          },
          type: "email",
        },
      ],
    }) as { processors: { config: object; type: string }[] };

    expect(Object.keys(out.processors[0])).toEqual(["type", "config"]);
    expect(Object.keys(out.processors[0].config)).toEqual([
      "recipientField",
      "subject",
    ]);
  });

  it("leaves arrays and their element order untouched", () => {
    const options = [
      { value: "b", label: "B" },
      { value: "a", label: "A" },
    ];
    const out = canonicalizeRecipe({
      ...misordered,
      steps: [
        {
          stepId: "s",
          title: "S",
          elements: [
            { ref: "components/generic-radio", overrides: { options } },
          ],
        },
      ],
    }) as { steps: { elements: { overrides: { options: object[] } }[] }[] };

    const out0 = out.steps[0].elements[0].overrides.options;
    // Element order is authoring-significant, so it must survive; only the keys
    // inside each option are reordered.
    expect(out0.map((o) => (o as { value: string }).value)).toEqual(["b", "a"]);
    expect(Object.keys(out0[0])).toEqual(["label", "value"]);
  });

  it("passes primitives, nulls and empty objects through unchanged", () => {
    expect(
      canonicalizeRecipe({ ...misordered, description: undefined }),
    ).toEqual({ ...misordered, description: undefined });
    const out = canonicalizeRecipe({
      ...misordered,
      contactDetails: null,
      meta: {},
    });
    expect(out).toEqual({ ...misordered, contactDetails: null, meta: {} });
  });
});

it("treats a dangerous key as inert data, never as a prototype write", () => {
  // Recipes are authored JSON from the builder, an AI draft or a hand edit, so
  // a `__proto__` key is reachable input. JSON.parse makes it an ordinary own
  // property, and rebuilding through Object.fromEntries keeps it one — this
  // pins that, because switching orderKeys to sequential `obj[key] = …`
  // assignment would silently turn it into a real prototype write.
  const hostile = JSON.parse(
    String.raw`{"formId":"a-form","title":"T","steps":[],"createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","__proto__":{"polluted":true}}`,
  );

  const out = canonicalizeRecipe(hostile) as Record<string, unknown>;

  expect(Object.keys(out)).toContain("__proto__");
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(serializeRecipe(hostile)).toContain('"__proto__"');
});

describe("serializeRecipe", () => {
  it("emits 2-space-indented JSON with a trailing newline", () => {
    const text = serializeRecipe(misordered);

    expect(text.startsWith('{\n  "formId": "apply-for-a-thing",\n')).toBe(true);
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("is a fixed point — serializing its own output changes nothing", () => {
    const once = serializeRecipe(misordered);

    expect(serializeRecipe(JSON.parse(once))).toBe(once);
  });
});
