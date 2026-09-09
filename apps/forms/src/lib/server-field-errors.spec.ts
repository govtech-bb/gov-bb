import type { ClientFormStep } from "@forms/types";
import { resolveServerFieldErrors } from "./server-field-errors";

function step(stepId: string, fieldIds: string[]): ClientFormStep {
  return {
    stepId,
    title: stepId,
    fields: fieldIds.map((fieldId) => ({
      id: `${stepId}.${fieldId}`,
      fieldId,
      stepId,
      name: fieldId,
      label: fieldId,
      htmlType: "text",
      disabled: false,
      hidden: false,
      conditionallyHidden: false,
      behaviours: [],
    })),
  } as unknown as ClientFormStep;
}

const STEPS = [
  step("about-restaurant", ["restaurant-name", "restaurant-parish"]),
  step("declaration", ["declaration-confirmed"]),
];

describe("resolveServerFieldErrors", () => {
  it("maps a step/field bundle onto client field ids", () => {
    const result = resolveServerFieldErrors(
      { "about-restaurant": { "restaurant-parish": ["Select the parish"] } },
      STEPS,
    );

    expect(result.byFieldId).toEqual({
      "about-restaurant.restaurant-parish": ["Select the parish"],
    });
  });

  it("names the first step in form order that holds an error", () => {
    const result = resolveServerFieldErrors(
      {
        declaration: { "declaration-confirmed": ["Confirm the declaration"] },
        "about-restaurant": { "restaurant-name": ["Enter the name"] },
      },
      STEPS,
    );

    expect(result.stepId).toBe("about-restaurant");
  });

  it("ignores fields the form does not have", () => {
    const result = resolveServerFieldErrors(
      {
        "about-restaurant": {
          "restaurant-name": ["Enter the name"],
          "field-that-moved": ["stale"],
        },
        "step-that-moved": { whatever: ["stale"] },
      },
      STEPS,
    );

    expect(result.byFieldId).toEqual({
      "about-restaurant.restaurant-name": ["Enter the name"],
    });
  });

  // A repeatable step's bundle is `{ _step: [...], instances: [{...}] }` — the
  // instance index maps to an expanded client step (`step~2`), which this does
  // not attempt. Nothing maps, so the caller falls back to the failure panel
  // rather than silently swallowing the errors.
  it("maps nothing for a repeatable step's per-instance bundle", () => {
    const result = resolveServerFieldErrors(
      {
        "about-restaurant": {
          _step: ["Provide at least 1 entry"],
          instances: [{ "restaurant-name": ["Enter the name"] }],
        },
      },
      STEPS,
    );

    expect(result.byFieldId).toEqual({});
    expect(result.stepId).toBeUndefined();
  });

  it("returns nothing for a body that carries no usable bundle", () => {
    for (const bundle of [undefined, null, "boom", [], { step: "nope" }]) {
      const result = resolveServerFieldErrors(bundle, STEPS);
      expect(result.byFieldId).toEqual({});
      expect(result.stepId).toBeUndefined();
    }
  });

  it("drops an entry whose messages are not a non-empty string list", () => {
    const result = resolveServerFieldErrors(
      {
        "about-restaurant": {
          "restaurant-name": [],
          "restaurant-parish": [42],
        },
      },
      STEPS,
    );

    expect(result.byFieldId).toEqual({});
  });
});
