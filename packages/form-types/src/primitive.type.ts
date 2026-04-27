import { z } from "zod";
import { behaviourSchema } from "./behavior.type";
import { validationRuleSchema } from "./validation.type";

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
  "tel",
  "email",
  "checkbox",
  "radio",
  "file",
  "select",
]);
export type HtmlTypes = z.infer<typeof htmlTypesSchema>;

export const optionSchema = z.object({
  label: z.string(),
  value: z.string(),
  disabled: z.boolean().optional(),
});
export type Option = z.infer<typeof optionSchema>;

export const primitiveUISchema = z.object({
  width: z.enum(["short", "medium", "long"]).optional(),
});

export type PrimitiveUI = z.infer<typeof primitiveUISchema>;

export const basePrimitiveSchema = z.object({
  fieldId: z.string(),
  label: z.string(),
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
  multiple: z.boolean().optional(),
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

export const primitiveSchema = z.discriminatedUnion("htmlType", [
  textPrimitiveSchema,
  textAreaPrimitiveSchema,
  datePrimitiveSchema,
  numberPrimitiveSchema,
  telPrimitiveSchema,
  emailPrimitiveSchema,
  checkboxPrimitiveSchema,
  selectPrimitiveSchema,
  radioPrimitiveSchema,
  filePrimitiveSchema,
]);
export type Primitive = z.infer<typeof primitiveSchema>;

export const fieldOverridesSchema = basePrimitiveSchema.pick({
  label: true,
  hint: true,
  placeholder: true,
  validations: true,
  defaultValue: true,
  isDisabled: true,
  isHidden: true,
  multiple: true,
  options: true,
  ui: true,
});
export type FieldOverrides = z.infer<typeof fieldOverridesSchema>;
