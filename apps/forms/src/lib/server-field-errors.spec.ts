import type { ClientFormStep } from "@forms/types";
import {
  findStaleDefinitionStep,
  resolveServerFieldErrors,
} from "./server-field-errors";

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

describe("findStaleDefinitionStep (#3901)", () => {
  // #3886: the browser's old definition had no `regulations-acknowledged`.
  it("names the bundle's first step when a field is not in its step", () => {
    expect(
      findStaleDefinitionStep(
        { declaration: { "regulations-acknowledged": ["Confirm this"] } },
        STEPS,
      ),
    ).toBe("declaration");
  });

  it("names the bundle's first step when a step is not in the form", () => {
    expect(
      findStaleDefinitionStep({ "new-step": { name: ["Enter it"] } }, STEPS),
    ).toBe("new-step");
  });

  // The applicant cannot correct a field that they cannot see, so one unknown
  // field makes all of the bundle stale. The reload goes to the first step.
  it("treats the whole bundle as stale when one field is unknown", () => {
    expect(
      findStaleDefinitionStep(
        {
          "about-restaurant": { "restaurant-name": ["Enter the name"] },
          declaration: { "regulations-acknowledged": ["Confirm this"] },
        },
        STEPS,
      ),
    ).toBe("about-restaurant");
  });

  it("finds nothing when the form has every step and field in the bundle", () => {
    expect(
      findStaleDefinitionStep(
        {
          "about-restaurant": { "restaurant-name": ["Enter the name"] },
          declaration: { "declaration-confirmed": ["Confirm"] },
        },
        STEPS,
      ),
    ).toBeUndefined();
  });

  it("does not take a step's own errors (`_step`) for a field", () => {
    expect(
      findStaleDefinitionStep(
        { "about-restaurant": { _step: ["Answer one of these"] } },
        STEPS,
      ),
    ).toBeUndefined();
  });

  // A repeatable step's bundle keeps the general failure panel.
  it("does not examine a repeatable step's per-instance bundle", () => {
    expect(
      findStaleDefinitionStep(
        {
          "about-restaurant": {
            _step: ["Provide at least 1 entry"],
            instances: [{ "field-that-moved": ["stale"] }],
          },
        },
        STEPS,
      ),
    ).toBeUndefined();
  });

  it("finds nothing in a body that carries no bundle", () => {
    for (const bundle of [undefined, null, "boom", [], ["Bad payload"], {}]) {
      expect(findStaleDefinitionStep(bundle, STEPS)).toBeUndefined();
    }
  });

  // `instances` holds a list of field maps only in a repeatable step's bundle.
  // On an ordinary step it can be a field ID with its messages.
  it("takes a field named `instances` with messages for a field", () => {
    expect(
      findStaleDefinitionStep(
        { declaration: { instances: ["Required"] } },
        STEPS,
      ),
    ).toBe("declaration");
  });

  // A key is a step only when its value has the shape of step errors. Any
  // other body is not a stale form, so it must not offer a reload.
  it("finds nothing when an entry does not have the shape of step errors", () => {
    for (const bundle of [
      { message: "Invalid input" },
      { "new-step": "Invalid input" },
      { "new-step": ["Required"] },
      { "new-step": { name: "Required" } },
      { "new-step": { name: [] } },
      { "new-step": { instances: [["Required"]] } },
      {
        "new-step": { name: ["Required"] },
        message: "Invalid input",
      },
    ]) {
      expect(findStaleDefinitionStep(bundle, STEPS)).toBeUndefined();
    }
  });
});
