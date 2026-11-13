import { validateField } from "@govtech-bb/form-validation";
import type { FieldOverrides, Primitive } from "@govtech-bb/form-types";
import { getCatalog } from "./catalog";
import { hydrateForm } from "./resolution";

// components/money-bds (#3638) as a recipe would serve it: hydrated through
// the shared resolver, then validated with the same rules the forms app and
// the api run.
function hydrateMoney(overrides?: FieldOverrides): Primitive {
  const contract = hydrateForm(
    {
      formId: "form-001",
      title: "Test Form",
      version: "1.0.0",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      steps: [
        {
          stepId: "step-1",
          title: "Step 1",
          elements: [{ ref: "components/money-bds", overrides }],
        },
      ],
    },
    getCatalog(),
  );
  return contract.steps[0].elements[0];
}

describe("components/money-bds", () => {
  it("keeps the BDS $ prefix when a recipe overrides other ui keys", () => {
    const field = hydrateMoney({
      fieldId: "monthly-rent",
      label: "Monthly rent",
      ui: { width: "medium" },
    });
    expect(field.ui).toEqual({ prefix: "BDS $", width: "medium" });
  });

  it.each(["1250.50", "1250", "0", "0.5", " 99.99 "])("accepts %j", (value) => {
    expect(validateField(hydrateMoney(), value, {})).toEqual([]);
  });

  it.each(["-1", "abc", "1,250", "12.345", "$12", "1e3"])(
    "rejects %j",
    (value) => {
      expect(validateField(hydrateMoney(), value, {})).not.toEqual([]);
    },
  );

  it("names the rule a wrong amount breaks", () => {
    const first = (value: string) =>
      validateField(hydrateMoney(), value, {})[0];
    expect(first("-1")).toBe("The amount must be 0 or more");
    expect(first("abc")).toBe(
      "Enter the amount as a number, like 1250 or 1250.50",
    );
  });

  it("names the field when the amount is missing", () => {
    expect(validateField(hydrateMoney(), "", {})).toEqual(["Enter the amount"]);
  });
});
