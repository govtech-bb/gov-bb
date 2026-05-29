import { primitiveSchema } from "@govtech-bb/form-types";
import { REGISTRY_COMPONENTS, REGISTRY_PRIMITIVES } from "./index";

const EXPECTED_RAW_FIELD_IDS = [
  "raw-text",
  "raw-textarea",
  "raw-number",
  "raw-date",
  "raw-tel",
  "raw-email",
  "raw-checkbox",
  "raw-radio",
  "raw-file",
  "raw-select",
] as const;

describe("raw primitives", () => {
  it("exposes exactly 10 entries via REGISTRY_PRIMITIVES", () => {
    expect(Object.keys(REGISTRY_PRIMITIVES)).toHaveLength(10);
  });

  it.each(EXPECTED_RAW_FIELD_IDS)(
    "registers components/%s in both REGISTRY_PRIMITIVES and REGISTRY_COMPONENTS",
    (fieldId) => {
      const ref = `components/${fieldId}` as const;
      expect(REGISTRY_PRIMITIVES[ref]).toBeDefined();
      expect(REGISTRY_COMPONENTS[ref]).toBeDefined();
      expect(REGISTRY_PRIMITIVES[ref]).toBe(REGISTRY_COMPONENTS[ref]);
    },
  );

  it("each raw primitive parses cleanly under the Primitive discriminated union", () => {
    for (const primitive of Object.values(REGISTRY_PRIMITIVES)) {
      const parsed = primitiveSchema.safeParse(primitive);
      expect(parsed.success).toBe(true);
    }
  });
});
