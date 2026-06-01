import type {
  RecipeFieldDraft,
  ComponentDefinition,
  BlockDefinition,
} from "@govtech-bb/form-builder";
import type { Primitive } from "@govtech-bb/form-types";
import { resolveFieldLabel } from "./-field-label";

// ── Fixture helpers ──────────────────────────────────────────────────────────

const field = (
  ref: string,
  overrides: RecipeFieldDraft["overrides"] = {},
): RecipeFieldDraft => ({
  id: `id-${ref}`,
  kind: "component",
  ref,
  overrides,
});

const component = (
  displayName: string,
  primitiveLabel: string | undefined,
): ComponentDefinition => ({
  ref: "components/example",
  displayName,
  // Cast a partial primitive — only `label` is load-bearing here.
  primitive: { label: primitiveLabel } as unknown as Primitive,
});

const block = (displayName: string): BlockDefinition => ({
  ref: "blocks/example",
  displayName,
  // The helper only checks for the presence of `primitive`, so an empty
  // block object is sufficient for these tests.
  block: {} as BlockDefinition["block"],
});

// ── resolveFieldLabel ────────────────────────────────────────────────────────

describe("resolveFieldLabel", () => {
  it("override label wins even when a component primitive label is present", () => {
    const item = component("Text Field", "Primitive Label");
    expect(
      resolveFieldLabel(field("components/text", { label: "Your name" }), item),
    ).toBe("Your name");
  });

  it("component (no override): returns the primitive label", () => {
    const item = component("Text Field", "Primitive Label");
    expect(resolveFieldLabel(field("components/text"), item)).toBe(
      "Primitive Label",
    );
  });

  it("block (no override): no primitive → returns displayName", () => {
    const item = block("Name Block");
    expect(resolveFieldLabel(field("blocks/name"), item)).toBe("Name Block");
  });

  it("custom-shaped item whose primitive has no label → falls through to displayName", () => {
    const item = component("Custom Widget", undefined);
    expect(resolveFieldLabel(field("custom/widget"), item)).toBe(
      "Custom Widget",
    );
  });

  it("item undefined → returns field.ref", () => {
    expect(resolveFieldLabel(field("components/missing"), undefined)).toBe(
      "components/missing",
    );
  });

  it("empty-string override label is treated as not-set → falls through to primitive label", () => {
    const item = component("Text Field", "Primitive Label");
    expect(
      resolveFieldLabel(field("components/text", { label: "" }), item),
    ).toBe("Primitive Label");
  });

  it("empty-string override label falls through to displayName when no primitive label", () => {
    const item = component("Custom Widget", undefined);
    expect(resolveFieldLabel(field("custom/widget", { label: "" }), item)).toBe(
      "Custom Widget",
    );
  });

  it("everything absent (empty override + undefined item) → returns field.ref", () => {
    expect(
      resolveFieldLabel(field("components/text", { label: "" }), undefined),
    ).toBe("components/text");
  });
});
