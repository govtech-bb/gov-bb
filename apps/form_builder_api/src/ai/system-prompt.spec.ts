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
});
