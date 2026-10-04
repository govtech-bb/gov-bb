import { contentVariantSchema } from "@govtech-bb/form-types";
import type { FieldOverrides, HtmlTypes } from "@govtech-bb/form-types";

// The override keys an author may set through a type-specific control.
// `Pick` constrains each member to `keyof FieldOverrides`, so a key outside
// `fieldOverridesSchema`'s pick list fails to compile here — the parse would
// strip it silently before it reached a hydrator (#2713). Session 2 (#2873)
// widens this with `step` and `multiple`.
export type CustomAttributeKey = keyof Pick<
  FieldOverrides,
  "content" | "variant" | "summary"
>;

interface CustomAttributeDescriptorBase {
  key: CustomAttributeKey;
  label: string;
  // Guidance under the control.
  hint?: string;
  // Render the control only while the *effective* value (override ?? base
  // primitive) of a sibling key equals this — e.g. Summary only when Style is
  // `details`. A stored value is left alone while hidden: it is data the
  // author may come back to.
  showWhen?: { key: CustomAttributeKey; equals: string };
}

export type CustomAttributeDescriptor =
  | (CustomAttributeDescriptorBase & {
      kind: "enum";
      options: readonly string[];
    })
  | (CustomAttributeDescriptorBase & {
      // `text` is a single line; `markdown` is a multi-line body the forms
      // renderer passes through remark-gfm.
      kind: "text" | "markdown";
      // The primitive key the renderer falls back to when this one is unset.
      // Its effective value is shown as the placeholder so the fallback is
      // visible (the `details` summary falls back to `label`).
      fallbackKey?: "label";
    });

// Which override keys each htmlType's renderer honours beyond Label/Hint, and
// the control that edits each. Keyed by htmlType, not registry ref, because
// the forms renderer switches on htmlType (ADR 0067) — so DB custom components
// and block children are covered too. Defaults are not recorded here: the
// panel reads them off the base primitive at runtime (#789 pattern). An
// htmlType with nothing type-specific gets `[]` and the reason.
export const CUSTOM_ATTRIBUTE_DESCRIPTORS: Record<
  HtmlTypes,
  CustomAttributeDescriptor[]
> = {
  text: [], // `mask` is read but a wrong mask silently blocks input — hand-edit only
  textarea: [], // nothing beyond Label/Hint
  number: [], // Session 2: `step`
  date: [], // nothing beyond Label/Hint
  time: [], // Session 2: `step` (seconds between picker values)
  tel: [], // nothing beyond Label/Hint
  email: [], // nothing beyond Label/Hint
  checkbox: [], // options have their own editor
  "checkbox-accordion": [], // `groups` needs a nested groups→options editor — follow-up
  radio: [], // options have their own editor
  file: [], // Session 2: `multiple`
  select: [], // options have their own editor; `multiple` is fixed false
  "show-hide": [], // summary is Label, body is Hint — nothing type-specific
  "address-lookup": [], // `geocodeTargets` needs step-scoped field pickers — follow-up
  "opening-hours": [], // Session 2: `step` (must be a multiple of 60)
  content: [
    {
      key: "variant",
      label: "Style",
      kind: "enum",
      // Read from the schema so a variant added later cannot drift.
      options: contentVariantSchema.options,
    },
    {
      key: "content",
      label: "Content",
      kind: "markdown",
      hint: "Markdown. Bold, links and lists are supported; raw HTML is not.",
    },
    {
      key: "summary",
      label: "Summary",
      kind: "text",
      hint: "The clickable line that opens the details.",
      fallbackKey: "label",
      showWhen: { key: "variant", equals: "details" },
    },
  ],
};
