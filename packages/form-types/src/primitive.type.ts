import { z } from "zod";
import { behaviourSchema } from "./behavior.type";
import { validationRuleSchema } from "./validation.type";
import { kebabIdSchema } from "./id-pattern";

export const primitiveMetadataSchema = z.object({
  pii: z.boolean(),
  sensitive: z.boolean(),
});
export type PrimitiveMetadata = z.infer<typeof primitiveMetadataSchema>;

export const htmlTypesSchema = z.enum([
  "text",
  "textarea",
  "number",
  "date",
  "time",
  "tel",
  "email",
  "checkbox",
  "checkbox-accordion",
  "radio",
  "file",
  "select",
  "show-hide",
  "address-lookup",
  "content",
]);
export type HtmlTypes = z.infer<typeof htmlTypesSchema>;

export const optionSchema = z.object({
  label: z.string(),
  value: z.string(),
  disabled: z.boolean().optional(),
});
export type Option = z.infer<typeof optionSchema>;

// A collapsible category within a `checkbox-accordion` field: a labelled group
// of item checkboxes that expands/collapses as a unit. `higherRisk` flags the
// category for a visible badge in the renderer and drives the derived
// higher-risk signal in the reviewer payload.
export const optionGroupSchema = z.object({
  label: z.string(),
  higherRisk: z.boolean().optional(),
  options: z.array(optionSchema),
});
export type OptionGroup = z.infer<typeof optionGroupSchema>;

export const contentVariantSchema = z.enum(["inset", "text", "details"]);
export type ContentVariant = z.infer<typeof contentVariantSchema>;

export const primitiveUISchema = z.object({
  width: z.enum(["short", "medium", "long"]).optional(),
  /** When true, the field's visible label is hidden but kept in the DOM
   * (via `.govbb-visually-hidden`) so the accessible name is preserved. */
  hideLabel: z.boolean().optional(),
  /** When true, the field renders as `<input type="hidden">` — no visible UI,
   * omitted from check-your-answers — but stays in the submitted payload (unlike
   * `isHidden`, which strips the field). For values computed by another field,
   * e.g. geocoded coordinates written by an `address-lookup` field. */
  hidden: z.boolean().optional(),
});

export type PrimitiveUI = z.infer<typeof primitiveUISchema>;

// Sibling fields an `address-lookup` field populates when a suggestion is
// picked. Field ids are the recipe `fieldId`s within the same step (the
// renderer resolves them to full step-scoped ids).
export const geocodeTargetsSchema = z.object({
  /** Field id to receive the locality / secondary address line. */
  line2FieldId: z.string().optional(),
  /** Field id of the parish select to set from the geocoded parish. */
  parishFieldId: z.string().optional(),
  /** Field id of a hidden field to receive `"lat,lon"`. */
  coordinatesFieldId: z.string().optional(),
});
export type GeocodeTargets = z.infer<typeof geocodeTargetsSchema>;

export const basePrimitiveSchema = z.object({
  fieldId: kebabIdSchema,
  label: z.string(),
  name: z.string().optional(),
  htmlType: htmlTypesSchema,
  placeholder: z.string().optional(),
  hint: z.string().optional(),
  defaultValue: z.any().optional(),
  value: z.any().optional(),
  isDisabled: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  behaviours: z.array(behaviourSchema).optional(),
  validations: validationRuleSchema.optional(),
  metadata: primitiveMetadataSchema.partial().optional(),
  options: z.array(optionSchema).optional(),
  groups: z.array(optionGroupSchema).optional(),
  multiple: z.boolean().optional(),
  mask: z.string().optional(),
  // HTML `step` attribute for `time`/`number` inputs. For a time field it is in
  // seconds (e.g. 1800 = 30-minute increments): the native picker steps by this
  // amount, while a value typed off the step is still accepted (validation reads
  // the string value, not native step-validity).
  step: z.number().optional(),
  ui: primitiveUISchema.optional(),
  geocodeTargets: geocodeTargetsSchema.optional(),
  // Content element (htmlType "content"): a non-field static guidance block.
  // `content` is the markdown body; `variant` selects the presentation; the
  // `details` variant uses `summary` as the disclosure's clickable text.
  content: z.string().optional(),
  variant: contentVariantSchema.optional(),
  summary: z.string().optional(),
});
export type BasePrimitive = z.infer<typeof basePrimitiveSchema>;

export const textPrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("text"),
});
export type TextPrimitive = z.infer<typeof textPrimitiveSchema>;

export const textAreaPrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("textarea"),
});
export type TextAreaPrimitive = z.infer<typeof textAreaPrimitiveSchema>;

export const datePrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("date"),
});
export type DatePrimitive = z.infer<typeof datePrimitiveSchema>;

export const numberPrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("number"),
});
export type NumberPrimitive = z.infer<typeof numberPrimitiveSchema>;

export const timePrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("time"),
});
export type TimePrimitive = z.infer<typeof timePrimitiveSchema>;

export const telPrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("tel"),
});
export type TelPrimitive = z.infer<typeof telPrimitiveSchema>;

export const emailPrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("email"),
});
export type EmailPrimitive = z.infer<typeof emailPrimitiveSchema>;

export const checkboxPrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("checkbox"),
  options: z.array(optionSchema),
});
export type CheckboxPrimitive = z.infer<typeof checkboxPrimitiveSchema>;

// A multi-select checkbox field whose options are split into collapsible,
// individually-labelled categories (`groups`). The submitted value is a flat
// string[] of selected option values across all groups — identical to a plain
// checkbox field — so array validation and payload rendering are unchanged; the
// grouping is presentational plus the per-group `higherRisk` flag.
export const checkboxAccordionPrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("checkbox-accordion"),
  groups: z.array(optionGroupSchema),
});
export type CheckboxAccordionPrimitive = z.infer<
  typeof checkboxAccordionPrimitiveSchema
>;

export const selectPrimitiveSchema = basePrimitiveSchema.extend({
  options: z.array(optionSchema),
  htmlType: z.literal("select"),
  multiple: z.boolean(),
});
export type SelectPrimitive = z.infer<typeof selectPrimitiveSchema>;

export const radioPrimitiveSchema = basePrimitiveSchema.extend({
  options: z.array(optionSchema),
  htmlType: z.literal("radio"),
});
export type RadioPrimitive = z.infer<typeof radioPrimitiveSchema>;

export const filePrimitiveSchema = basePrimitiveSchema.extend({
  multiple: z.boolean(),
  htmlType: z.literal("file"),
});
export type FilePrimitive = z.infer<typeof filePrimitiveSchema>;

export const showHidePrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("show-hide"),
});
export type ShowHidePrimitive = z.infer<typeof showHidePrimitiveSchema>;

// A single-line address field backed by a Barbados-locked geocoder lookup. The
// submitted value is the same string a `text` field stores — the geocoder is
// only a richer input widget — so validation, review and payload rendering are
// unchanged.
export const addressLookupPrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("address-lookup"),
});
export type AddressLookupPrimitive = z.infer<
  typeof addressLookupPrimitiveSchema
>;

// A non-field static content block: renders markdown guidance (inset callout,
// plain paragraph, or a collapsible details disclosure). Carries no submitted
// value — the renderer draws it outside the form-field wrapper, so it is never
// validated, summarised, or submitted.
export const contentPrimitiveSchema = basePrimitiveSchema.extend({
  htmlType: z.literal("content"),
  content: z.string(),
  variant: contentVariantSchema,
});
export type ContentPrimitive = z.infer<typeof contentPrimitiveSchema>;

export const primitiveSchema = z.discriminatedUnion("htmlType", [
  textPrimitiveSchema,
  textAreaPrimitiveSchema,
  datePrimitiveSchema,
  numberPrimitiveSchema,
  timePrimitiveSchema,
  telPrimitiveSchema,
  emailPrimitiveSchema,
  checkboxPrimitiveSchema,
  checkboxAccordionPrimitiveSchema,
  selectPrimitiveSchema,
  radioPrimitiveSchema,
  filePrimitiveSchema,
  showHidePrimitiveSchema,
  addressLookupPrimitiveSchema,
  contentPrimitiveSchema,
]);
export type Primitive = z.infer<typeof primitiveSchema>;

export const fieldOverridesSchema = basePrimitiveSchema
  .pick({
    fieldId: true,
    label: true,
    hint: true,
    placeholder: true,
    validations: true,
    defaultValue: true,
    isDisabled: true,
    isHidden: true,
    behaviours: true,
    multiple: true,
    options: true,
    groups: true,
    mask: true,
    step: true,
    ui: true,
    geocodeTargets: true,
    content: true,
    variant: true,
    summary: true,
  })
  .partial();
export type FieldOverrides = z.infer<typeof fieldOverridesSchema>;
