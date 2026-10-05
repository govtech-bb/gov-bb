import { CUSTOM_ATTRIBUTE_DESCRIPTORS } from "./custom-attributes";
import {
  contentVariantSchema,
  fieldOverridesSchema,
  geocodeTargetsSchema,
  htmlTypesSchema,
} from "@govtech-bb/form-types";

describe("CUSTOM_ATTRIBUTE_DESCRIPTORS (#2873)", () => {
  const entries = Object.entries(CUSTOM_ATTRIBUTE_DESCRIPTORS);
  const all = entries.flatMap(([, descriptors]) => descriptors);

  it("has an entry for every htmlType (TS enforces it; this records it)", () => {
    expect(entries.map(([htmlType]) => htmlType).sort()).toEqual(
      [...htmlTypesSchema.options].sort(),
    );
  });

  it("only names keys fieldOverridesSchema carries — the parse strips anything else (#2713)", () => {
    const allowed = Object.keys(fieldOverridesSchema.shape);
    for (const descriptor of all) {
      expect(allowed).toContain(descriptor.key);
      if (descriptor.showWhen)
        expect(allowed).toContain(descriptor.showWhen.key);
    }
  });

  it("every showWhen names a sibling descriptor in the same list", () => {
    for (const [, descriptors] of entries) {
      const keys = descriptors.map((d) => d.key);
      for (const descriptor of descriptors) {
        if (descriptor.showWhen)
          expect(keys).toContain(descriptor.showWhen.key);
      }
    }
  });

  it("offers Style, Content and Summary for a content block", () => {
    expect(CUSTOM_ATTRIBUTE_DESCRIPTORS.content.map((d) => d.key)).toEqual([
      "variant",
      "content",
      "summary",
    ]);
  });

  it("sources the Style options from contentVariantSchema so a new variant cannot drift", () => {
    const style = CUSTOM_ATTRIBUTE_DESCRIPTORS.content.find(
      (d) => d.key === "variant",
    );
    expect(style).toMatchObject({
      kind: "enum",
      options: contentVariantSchema.options,
    });
    expect(contentVariantSchema.options).toContain("warning");
  });

  it("shows Summary only for the details variant and falls back to the label", () => {
    const summary = CUSTOM_ATTRIBUTE_DESCRIPTORS.content.find(
      (d) => d.key === "summary",
    );
    expect(summary).toMatchObject({
      kind: "text",
      fallbackKey: "label",
      showWhen: { key: "variant", equals: "details" },
    });
  });

  it("edits the body as markdown", () => {
    const content = CUSTOM_ATTRIBUTE_DESCRIPTORS.content.find(
      (d) => d.key === "content",
    );
    expect(content?.kind).toBe("markdown");
  });

  it("records no type-specific settings for a plain text field", () => {
    expect(CUSTOM_ATTRIBUTE_DESCRIPTORS.text).toEqual([]);
  });

  it("offers one field picker per geocode target for an address lookup (#2886)", () => {
    expect(CUSTOM_ATTRIBUTE_DESCRIPTORS["address-lookup"]).toEqual([
      expect.objectContaining({
        key: "geocodeTargets",
        kind: "fieldRef",
        fields: [
          expect.objectContaining({ key: "line2FieldId" }),
          expect.objectContaining({ key: "parishFieldId" }),
          expect.objectContaining({ key: "coordinatesFieldId" }),
        ],
      }),
    ]);
  });

  it("offers a categories editor for a checkbox accordion's groups (#2887)", () => {
    expect(CUSTOM_ATTRIBUTE_DESCRIPTORS["checkbox-accordion"]).toEqual([
      expect.objectContaining({ key: "groups", kind: "optionGroups" }),
    ]);
  });

  it("names only geocodeTargets sub-keys the schema carries", () => {
    const allowed = Object.keys(geocodeTargetsSchema.shape);
    for (const descriptor of all) {
      if (descriptor.kind !== "fieldRef") continue;
      for (const target of descriptor.fields)
        expect(allowed).toContain(target.key);
    }
  });
});
