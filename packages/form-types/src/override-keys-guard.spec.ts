import { checkOverrideKeys } from "./override-keys-guard";

const msg = (step: string, field: string, key: string) =>
  `step "${step}" › field "${field}" › unknown override key "${key}" — dropped at parse, it has no effect`;

describe("checkOverrideKeys", () => {
  it("flags a typo'd key on a component, naming the overridden fieldId", () => {
    const recipe = {
      steps: [
        {
          stepId: "about-you",
          elements: [
            {
              ref: "components/generic-text",
              overrides: {
                fieldId: "first-name",
                label: "First name",
                hnit: "x",
              },
            },
          ],
        },
      ],
    };
    expect(checkOverrideKeys(recipe)).toEqual([
      msg("about-you", "first-name", "hnit"),
    ]);
  });

  it("falls back to the ref when the overrides carry no fieldId", () => {
    const recipe = {
      steps: [
        {
          stepId: "contact",
          elements: [{ ref: "components/email", overrides: { type: "email" } }],
        },
      ],
    };
    expect(checkOverrideKeys(recipe)).toEqual([
      msg("contact", "components/email", "type"),
    ]);
  });

  it("flags a key inside a block's per-field override record", () => {
    const recipe = {
      steps: [
        {
          stepId: "address",
          elements: [
            {
              ref: "blocks/address",
              overrides: {
                "address-line-1": { label: "Line 1", readonly: true },
                parish: { hint: "Pick one" },
              },
            },
          ],
        },
      ],
    };
    expect(checkOverrideKeys(recipe)).toEqual([
      msg("address", "address-line-1", "readonly"),
    ]);
  });

  it("returns [] for a clean recipe", () => {
    const recipe = {
      steps: [
        {
          stepId: "s",
          elements: [
            {
              ref: "components/generic-text",
              overrides: { fieldId: "a", label: "A" },
            },
            { ref: "blocks/name", overrides: { first: { label: "First" } } },
            { ref: "components/email" },
          ],
        },
      ],
    };
    expect(checkOverrideKeys(recipe)).toEqual([]);
  });

  it("tolerates malformed shapes without throwing", () => {
    for (const recipe of [
      null,
      undefined,
      "x",
      {},
      { steps: "nope" },
      { steps: [null, {}, { stepId: "s", elements: "nope" }] },
      {
        steps: [
          {
            stepId: "s",
            elements: [
              null,
              {},
              { ref: "components/x", overrides: null },
              { ref: "components/x", overrides: [] },
              { ref: "blocks/x", overrides: { a: null, b: "str" } },
            ],
          },
        ],
      },
    ]) {
      expect(checkOverrideKeys(recipe)).toEqual([]);
    }
  });
});
