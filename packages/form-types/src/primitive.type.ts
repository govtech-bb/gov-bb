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

export const primitiveUISchema = z.object({
  width: z.enum(["short", "medium", "long"]).optional(),
  /** When true, the field's visible label is hidden but kept in the DOM
   * (via `.govbb-visually-hidden`) so the accessible name is preserved. */
  hideLabel: z.boolean().optional(),
});

export type PrimitiveUI = z.infer<typeof primitiveUISchema>;

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
  ui: primitiveUISchema.optional(),
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
    ui: true,
  })
  .partial();
export type FieldOverrides = z.infer<typeof fieldOverridesSchema>;
