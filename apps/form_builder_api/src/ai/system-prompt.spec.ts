import { getSystemPrompt } from "./system-prompt.js";
import { getCatalog, getRegistryItem } from "@govtech-bb/form-builder";

// Guards the embedded AI system prompt against drift from the registry.
// Every component/block ref the prompt tells the model to emit must resolve
// against the registry (getRegistryItem's registry fallback), or the AI will
// generate recipes that fail ref resolution at publish time. See plan
// docs/plans/427-ai-prompt-embed-and-fix.md.

const prompt = getSystemPrompt();
const catalog = getCatalog();

// All `components/<kebab>` and `blocks/<kebab>` tokens the prompt mentions.
// `[a-z0-9-]+` stops at a slash, so a migrated `components/generic/radio` ref
// surfaces here as the non-resolving `components/generic` — caught by the
// resolution assertion below as well as the explicit banned-list check.
function extractRefs(prefix: "components" | "blocks"): string[] {
  const matches = prompt.match(new RegExp(`${prefix}/[a-z0-9-]+`, "g")) ?? [];
  return [...new Set(matches)];
}

// Migrated #416 slash refs — must never reappear. Mirrors the banned list in
// apps/api/src/forms/form-definitions/recipe-registry-refs.spec.ts.
const MIGRATED_SLASH_REFS = [
  "components/generic/radio",
  "components/generic/number",
  "components/generic/checkbox",
  "components/generic/textarea",
  "components/generic/text",
  "components/generic/text-input",
  "components/generic/text-field",
  "components/generic/date",
  "components/generic/date-input",
  "components/generic/file-upload",
  "components/generic/show-hide",
];

const GENERIC_PRIMITIVES = [
  "components/generic-text",
  "components/generic-textarea",
  "components/generic-date",
  "components/generic-email",
  "components/generic-tel",
  "components/generic-checkbox",
  "components/generic-file",
  "components/generic-select",
  "components/generic-radio",
  "components/generic-number",
];

// The 8 composite blocks the registry exposes (the UI block palette). Since
// the vestigial builtin catalog was retired (#515), getCatalog().blocks is
// empty and getRegistryItem resolves these straight from the registry.
const REGISTRY_BLOCKS = [
  "blocks/personal-information",
  "blocks/contact-information",
  "blocks/physical-address",
  "blocks/emergency-contact-details",
  "blocks/proving-your-identity",
  "blocks/applicant-declaration",
  "blocks/supporting-documents",
  "blocks/additional-information",
];

describe("AI system prompt", () => {
  it("is the full embedded prompt, not the minimal fallback", () => {
    expect(prompt.length).toBeGreaterThan(5000);
  });

  it("only references component refs that resolve against the registry", () => {
    const unresolved = extractRefs("components").filter(
      (ref) => !getRegistryItem(ref, catalog),
    );
    expect(unresolved).toEqual([]);
  });

  it("only references block refs that resolve against the registry", () => {
    const unresolved = extractRefs("blocks").filter(
      (ref) => !getRegistryItem(ref, catalog),
    );
    expect(unresolved).toEqual([]);
  });

  it("contains no migrated generic slash refs", () => {
    const present = MIGRATED_SLASH_REFS.filter((ref) => prompt.includes(ref));
    expect(present).toEqual([]);
  });

  it("surfaces every generic primitive plus show-hide", () => {
    const missing = [...GENERIC_PRIMITIVES, "components/show-hide"].filter(
      (ref) => !prompt.includes(ref),
    );
    expect(missing).toEqual([]);
  });

  it("surfaces every registry block", () => {
    const missing = REGISTRY_BLOCKS.filter((ref) => !prompt.includes(ref));
    expect(missing).toEqual([]);
  });

  it("uses the resolving contact-telephone ref, not contact-number", () => {
    expect(prompt).not.toContain("components/contact-number");
    expect(prompt).toContain("components/contact-telephone");
  });

  it("instructs a distinct fieldId override when the same component is reused across steps", () => {
    expect(prompt).toContain("same component across different steps");
  });

  it("requires every stepId to be unique across the form", () => {
    expect(prompt).toContain("EVERY stepId MUST be unique");
  });

  it("teaches the kebab-case id rule and that snake_case/camelCase are rejected", () => {
    expect(prompt).toContain("EVERY id MUST be kebab-case");
    expect(prompt).toContain("^[a-z][a-z0-9]*(-[a-z0-9]+)*$");
    expect(prompt).toContain("snake_case");
    expect(prompt).toContain("camelCase");
  });

  it("documents the optionalIf behaviour", () => {
    expect(prompt).toContain('"type": "optionalIf"');
    expect(prompt).toContain("stays VISIBLE but becomes optional");
  });

  it("guards the alternative-identity pattern (reveal toggle + optionalIf)", () => {
    expect(prompt).toContain(
      "Never leave the primary field unconditionally required next to a reveal toggle",
    );
  });

  it("explains step-level behaviours live in a behaviours array on the step", () => {
    // The lead-in must distinguish step-level from field-level placement.
    expect(prompt).toContain("STEP-level");
    expect(prompt).toContain("as a sibling of");
  });

  it("documents the stepConditionalOn behaviour with a required targetStepId", () => {
    expect(prompt).toContain('"type": "stepConditionalOn"');
    // targetStepId is optional on field-level conditionals but required here.
    expect(prompt).toContain("targetStepId is REQUIRED here");
  });

  it("documents the repeatable behaviour as a step-level Add another? behaviour", () => {
    expect(prompt).toContain('"type": "repeatable"');
    expect(prompt).toContain("Add another?");
  });

  it("mentions sharedFields only as an adjunct to a repeatable step", () => {
    expect(prompt).toContain('"type": "sharedFields"');
    expect(prompt).toContain("only meaningful alongside");
  });

  it("never mentions the deliberately-excluded fieldArray behaviour", () => {
    // fieldArray is intentionally withheld (overlaps a repeatable step and
    // invites misuse). Pin its absence so an edit can't quietly reintroduce it.
    expect(prompt).not.toContain("fieldArray");
  });

  it("directs relationship fields to components/relationship, not a text input", () => {
    expect(prompt).toContain("Relationship fields use components/relationship");
    // The component reference must surface it as a select with baked-in options.
    expect(prompt).toContain("components/relationship — select (HAS options");
    // The old guidance steered relationship fields to generic-text — must not return.
    expect(prompt).not.toContain("free-text relationship fields");
  });

  it("makes address line 2 and similar continuation lines optional by default", () => {
    // Explicit never-infer-required rule for continuation lines.
    expect(prompt).toContain('"address line 2"');
    expect(prompt).toContain("optional by default");
    // The inferred-required list must name line 1 specifically, not bare
    // "address" (which would sweep line 2 into required-by-default).
    expect(prompt).toMatch(
      /common required fields \([^)]*\baddress line 1\b[^)]*\)/,
    );
    expect(prompt).not.toMatch(
      /common required fields \([^)]*\baddress\b(?! line 1)[^)]*\)/,
    );
  });

  it("documents the numeric bound validations with literal or cross-field reference", () => {
    // min/max are the or-equal forms, gt/lt the strict forms — all four listed.
    for (const rule of ["min", "max", "gt", "lt"]) {
      expect(prompt).toMatch(new RegExp(`^- ${rule}: `, "m"));
    }
    // The literal-or-reference shape and the kebab-case reference id.
    expect(prompt).toContain('"referenceFieldId": "start-year"');
    // No gte/lte exists — or-equal comparisons must route through min/max.
    expect(prompt).toContain("There is NO gte/lte");
    // The worked start-year/end-year range example.
    expect(prompt).toContain('"fieldId": "end-year"');
  });

  it("pins the declaration step to exactly one element: the declaration-confirmed checkbox", () => {
    // Rule 17 + the Declaration Checkbox Pattern: one confirmation checkbox,
    // fixed fieldId/label, required — and nothing else in the step.
    expect(prompt).toContain(
      "The declaration step contains EXACTLY ONE element",
    );
    expect(prompt).toContain('"fieldId": "declaration-confirmed"');
    expect(prompt).toContain('"label": "Declaration"');
    // No worked example may place an extra field inside the declaration step.
    expect(prompt).not.toContain('"fieldId": "declaration-date"');
  });

  it("documents minYear/maxYear with literal value or currentYear, never a reference", () => {
    expect(prompt).toMatch(/^- minYear: /m);
    expect(prompt).toMatch(/^- maxYear: /m);
    expect(prompt).toContain('"currentYear": true');
    expect(prompt).toContain("do NOT accept referenceFieldId");
  });
});
