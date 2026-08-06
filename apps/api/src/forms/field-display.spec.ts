import { describe, expect, it } from "vitest";
import { isOptionField, resolveOptionDisplay } from "./field-display";
import type { Primitive } from "@govtech-bb/form-types";

const field = (over: Partial<Primitive>): Primitive =>
  ({ fieldId: "f", htmlType: "text", ...over }) as Primitive;

const PARISH = field({
  htmlType: "radio",
  options: [
    { label: "Christ Church", value: "christ-church" },
    { label: "St. Michael", value: "st-michael" },
  ],
});

describe("isOptionField", () => {
  it("is true for option fields, false for free-text/date/file", () => {
    for (const t of ["radio", "select", "checkbox", "checkbox-accordion"]) {
      expect(isOptionField(field({ htmlType: t as never }))).toBe(true);
    }
    for (const t of ["text", "textarea", "date", "file", "tel"]) {
      expect(isOptionField(field({ htmlType: t as never }))).toBe(false);
    }
  });
});

describe("resolveOptionDisplay", () => {
  it("radio → the selected option's label", () => {
    expect(resolveOptionDisplay(PARISH, "christ-church")).toBe("Christ Church");
  });

  it("single select → label", () => {
    const f = field({
      htmlType: "select",
      options: [{ label: "Barbadian citizen", value: "citizen" }],
    });
    expect(resolveOptionDisplay(f, "citizen")).toBe("Barbadian citizen");
  });

  it("checkbox / multi-select → an array of labels", () => {
    const f = field({
      htmlType: "checkbox",
      options: [
        { label: "Food allergy", value: "food-allergy" },
        { label: "Vegetarian", value: "vegetarian" },
      ],
    });
    expect(resolveOptionDisplay(f, ["food-allergy", "vegetarian"])).toEqual([
      "Food allergy",
      "Vegetarian",
    ]);
  });

  it("checkbox-accordion → labels resolved across flattened groups", () => {
    const f = field({
      htmlType: "checkbox-accordion",
      groups: [
        { options: [{ label: "Abuse", value: "abuse" }] },
        { options: [{ label: "Neglect", value: "neglect" }] },
      ] as never,
    });
    expect(resolveOptionDisplay(f, ["abuse", "neglect"])).toEqual([
      "Abuse",
      "Neglect",
    ]);
  });

  it("unmatched value falls back to the raw value", () => {
    expect(resolveOptionDisplay(PARISH, "st-lucy")).toBe("st-lucy");
  });

  it("non-option field returns the raw value unchanged", () => {
    expect(resolveOptionDisplay(field({ htmlType: "text" }), "free text")).toBe(
      "free text",
    );
    const dateVal = { day: "1", month: "1", year: "2020" };
    expect(resolveOptionDisplay(field({ htmlType: "date" }), dateVal)).toBe(
      dateVal,
    );
  });
});
