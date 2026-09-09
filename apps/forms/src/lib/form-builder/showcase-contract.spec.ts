import { describe, expect, it } from "vitest";
import {
  behaviourSchema,
  contentVariantSchema,
  htmlTypesSchema,
  serviceContractSchema,
} from "@govtech-bb/form-types";
import contract from "../../../contracts/showcase-contract.json";
import { buildForm } from "./build-form";
import { mapContractToLocale } from "./field-mapper";

describe("showcase contract", () => {
  it("builds every supported field, content variant and behaviour without enabling multiple selects", () => {
    const parsed = serviceContractSchema.parse(contract);
    const fields = parsed.steps.flatMap((step) => step.elements);
    const behaviours = [
      ...parsed.steps.flatMap((step) => step.behaviours ?? []),
      ...fields.flatMap((field) => field.behaviours ?? []),
    ];
    expect(new Set(fields.map((field) => field.htmlType))).toEqual(
      new Set(htmlTypesSchema.options),
    );
    expect(
      new Set(
        fields
          .filter((field) => field.htmlType === "content")
          .map((field) => field.variant),
      ),
    ).toEqual(new Set(contentVariantSchema.options));
    expect(new Set(behaviours.map((behaviour) => behaviour.type))).toEqual(
      new Set(behaviourSchema.options.map((option) => option.shape.type.value)),
    );
    for (const field of fields) {
      if (field.htmlType === "select") expect(field.multiple).not.toBe(true);
    }
    for (const step of parsed.steps) {
      expect(new Set(step.elements.map((field) => field.fieldId)).size).toBe(
        step.elements.length,
      );
    }
    const form = buildForm(mapContractToLocale(parsed));
    expect(
      form.steps.filter((step) => step.stepId === "check-your-answers"),
    ).toHaveLength(1);
    expect(form.steps.some((step) => step.stepId === "volunteers~1")).toBe(
      true,
    );
    expect(parsed.processors).toEqual([]);
  });
});
