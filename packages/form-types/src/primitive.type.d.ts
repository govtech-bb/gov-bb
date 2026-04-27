import { z } from "zod";
export declare const primitiveMetadataSchema: z.ZodObject<
  {
    pii: z.ZodBoolean;
    sensitive: z.ZodBoolean;
  },
  z.core.$strip
>;
export type PrimitiveMetadata = z.infer<typeof primitiveMetadataSchema>;
export declare const htmlTypesSchema: z.ZodEnum<{
  number: "number";
  file: "file";
  text: "text";
  date: "date";
  radio: "radio";
  email: "email";
  textarea: "textarea";
  tel: "tel";
  checkbox: "checkbox";
  select: "select";
}>;
export type HtmlTypes = z.infer<typeof htmlTypesSchema>;
export declare const optionSchema: z.ZodObject<
  {
    label: z.ZodString;
    value: z.ZodString;
    disabled: z.ZodOptional<z.ZodBoolean>;
  },
  z.core.$strip
>;
export type Option = z.infer<typeof optionSchema>;
export declare const primitiveUISchema: z.ZodObject<
  {
    width: z.ZodOptional<
      z.ZodEnum<{
        long: "long";
        short: "short";
        medium: "medium";
      }>
    >;
  },
  z.core.$strip
>;
export type PrimitiveUI = z.infer<typeof primitiveUISchema>;
export declare const basePrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    htmlType: z.ZodEnum<{
      number: "number";
      file: "file";
      text: "text";
      date: "date";
      radio: "radio";
      email: "email";
      textarea: "textarea";
      tel: "tel";
      checkbox: "checkbox";
      select: "select";
    }>;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    options: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            label: z.ZodString;
            value: z.ZodString;
            disabled: z.ZodOptional<z.ZodBoolean>;
          },
          z.core.$strip
        >
      >
    >;
    multiple: z.ZodOptional<z.ZodBoolean>;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
  },
  z.core.$strip
>;
export type BasePrimitive = z.infer<typeof basePrimitiveSchema>;
export declare const textPrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    options: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            label: z.ZodString;
            value: z.ZodString;
            disabled: z.ZodOptional<z.ZodBoolean>;
          },
          z.core.$strip
        >
      >
    >;
    multiple: z.ZodOptional<z.ZodBoolean>;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
    htmlType: z.ZodLiteral<"text">;
  },
  z.core.$strip
>;
export type TextPrimitive = z.infer<typeof textPrimitiveSchema>;
export declare const textAreaPrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    options: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            label: z.ZodString;
            value: z.ZodString;
            disabled: z.ZodOptional<z.ZodBoolean>;
          },
          z.core.$strip
        >
      >
    >;
    multiple: z.ZodOptional<z.ZodBoolean>;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
    htmlType: z.ZodLiteral<"textarea">;
  },
  z.core.$strip
>;
export type TextAreaPrimitive = z.infer<typeof textAreaPrimitiveSchema>;
export declare const datePrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    options: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            label: z.ZodString;
            value: z.ZodString;
            disabled: z.ZodOptional<z.ZodBoolean>;
          },
          z.core.$strip
        >
      >
    >;
    multiple: z.ZodOptional<z.ZodBoolean>;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
    htmlType: z.ZodLiteral<"date">;
  },
  z.core.$strip
>;
export type DatePrimitive = z.infer<typeof datePrimitiveSchema>;
export declare const numberPrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    options: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            label: z.ZodString;
            value: z.ZodString;
            disabled: z.ZodOptional<z.ZodBoolean>;
          },
          z.core.$strip
        >
      >
    >;
    multiple: z.ZodOptional<z.ZodBoolean>;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
    htmlType: z.ZodLiteral<"number">;
  },
  z.core.$strip
>;
export type NumberPrimitive = z.infer<typeof numberPrimitiveSchema>;
export declare const telPrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    options: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            label: z.ZodString;
            value: z.ZodString;
            disabled: z.ZodOptional<z.ZodBoolean>;
          },
          z.core.$strip
        >
      >
    >;
    multiple: z.ZodOptional<z.ZodBoolean>;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
    htmlType: z.ZodLiteral<"tel">;
  },
  z.core.$strip
>;
export type TelPrimitive = z.infer<typeof telPrimitiveSchema>;
export declare const emailPrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    options: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            label: z.ZodString;
            value: z.ZodString;
            disabled: z.ZodOptional<z.ZodBoolean>;
          },
          z.core.$strip
        >
      >
    >;
    multiple: z.ZodOptional<z.ZodBoolean>;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
    htmlType: z.ZodLiteral<"email">;
  },
  z.core.$strip
>;
export type EmailPrimitive = z.infer<typeof emailPrimitiveSchema>;
export declare const checkboxPrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    multiple: z.ZodOptional<z.ZodBoolean>;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
    htmlType: z.ZodLiteral<"checkbox">;
    options: z.ZodArray<
      z.ZodObject<
        {
          label: z.ZodString;
          value: z.ZodString;
          disabled: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
  },
  z.core.$strip
>;
export type CheckboxPrimitive = z.infer<typeof checkboxPrimitiveSchema>;
export declare const selectPrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
    options: z.ZodArray<
      z.ZodObject<
        {
          label: z.ZodString;
          value: z.ZodString;
          disabled: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    htmlType: z.ZodLiteral<"select">;
    multiple: z.ZodBoolean;
  },
  z.core.$strip
>;
export type SelectPrimitive = z.infer<typeof selectPrimitiveSchema>;
export declare const radioPrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    multiple: z.ZodOptional<z.ZodBoolean>;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
    options: z.ZodArray<
      z.ZodObject<
        {
          label: z.ZodString;
          value: z.ZodString;
          disabled: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    htmlType: z.ZodLiteral<"radio">;
  },
  z.core.$strip
>;
export type RadioPrimitive = z.infer<typeof radioPrimitiveSchema>;
export declare const filePrimitiveSchema: z.ZodObject<
  {
    fieldId: z.ZodString;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    value: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    behaviours: z.ZodOptional<
      z.ZodArray<
        z.ZodDiscriminatedUnion<
          [
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"stepConditionalOn">;
                targetFieldId: z.ZodString;
                targetStepId: z.ZodOptional<z.ZodString>;
                operator: z.ZodEnum<{
                  equal: "equal";
                  notEqual: "notEqual";
                  in: "in";
                  exists: "exists";
                }>;
                value: z.ZodUnion<
                  readonly [
                    z.ZodString,
                    z.ZodNumber,
                    z.ZodBoolean,
                    z.ZodArray<z.ZodString>,
                    z.ZodArray<z.ZodNumber>,
                  ]
                >;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"repeatable">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"fieldArray">;
                min: z.ZodNumber;
                max: z.ZodNumber;
              },
              z.core.$strip
            >,
            z.ZodObject<
              {
                type: z.ZodLiteral<"sharedFields">;
                fieldIds: z.ZodArray<z.ZodString>;
              },
              z.core.$strip
            >,
          ],
          "type"
        >
      >
    >;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    metadata: z.ZodOptional<
      z.ZodObject<
        {
          pii: z.ZodOptional<z.ZodBoolean>;
          sensitive: z.ZodOptional<z.ZodBoolean>;
        },
        z.core.$strip
      >
    >;
    options: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            label: z.ZodString;
            value: z.ZodString;
            disabled: z.ZodOptional<z.ZodBoolean>;
          },
          z.core.$strip
        >
      >
    >;
    ui: z.ZodOptional<
      z.ZodObject<
        {
          width: z.ZodOptional<
            z.ZodEnum<{
              long: "long";
              short: "short";
              medium: "medium";
            }>
          >;
        },
        z.core.$strip
      >
    >;
    multiple: z.ZodBoolean;
    htmlType: z.ZodLiteral<"file">;
  },
  z.core.$strip
>;
export type FilePrimitive = z.infer<typeof filePrimitiveSchema>;
export declare const primitiveSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<
      {
        fieldId: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
        value: z.ZodOptional<z.ZodAny>;
        isDisabled: z.ZodOptional<z.ZodBoolean>;
        isHidden: z.ZodOptional<z.ZodBoolean>;
        behaviours: z.ZodOptional<
          z.ZodArray<
            z.ZodDiscriminatedUnion<
              [
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"stepConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"repeatable">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldArray">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"sharedFields">;
                    fieldIds: z.ZodArray<z.ZodString>;
                  },
                  z.core.$strip
                >,
              ],
              "type"
            >
          >
        >;
        validations: z.ZodOptional<
          z.ZodRecord<
            z.ZodEnum<{
              required: "required";
              pattern: "pattern";
              maxLength: "maxLength";
              minLength: "minLength";
              maxItems: "maxItems";
              minItems: "minItems";
              equal: "equal";
              notEqual: "notEqual";
              min: "min";
              max: "max";
              conditionalOn: "conditionalOn";
              past: "past";
              pastOrToday: "pastOrToday";
              future: "future";
              futureOrToday: "futureOrToday";
              after: "after";
              before: "before";
              onOrAfter: "onOrAfter";
              onOrBefore: "onOrBefore";
              minYear: "minYear";
              maxYear: "maxYear";
              radio: "radio";
              minSelection: "minSelection";
              maxSelection: "maxSelection";
              email: "email";
              fileTypes: "fileTypes";
              itemMaxSize: "itemMaxSize";
              maxSize: "maxSize";
              gt: "gt";
              lt: "lt";
              contains: "contains";
              strictEquality: "strictEquality";
            }> &
              z.core.$partial,
            z.ZodObject<
              {
                error: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodAny>;
                reference: z.ZodOptional<z.ZodString>;
                targetStepId: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >
          >
        >;
        metadata: z.ZodOptional<
          z.ZodObject<
            {
              pii: z.ZodOptional<z.ZodBoolean>;
              sensitive: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        options: z.ZodOptional<
          z.ZodArray<
            z.ZodObject<
              {
                label: z.ZodString;
                value: z.ZodString;
                disabled: z.ZodOptional<z.ZodBoolean>;
              },
              z.core.$strip
            >
          >
        >;
        multiple: z.ZodOptional<z.ZodBoolean>;
        ui: z.ZodOptional<
          z.ZodObject<
            {
              width: z.ZodOptional<
                z.ZodEnum<{
                  long: "long";
                  short: "short";
                  medium: "medium";
                }>
              >;
            },
            z.core.$strip
          >
        >;
        htmlType: z.ZodLiteral<"text">;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        fieldId: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
        value: z.ZodOptional<z.ZodAny>;
        isDisabled: z.ZodOptional<z.ZodBoolean>;
        isHidden: z.ZodOptional<z.ZodBoolean>;
        behaviours: z.ZodOptional<
          z.ZodArray<
            z.ZodDiscriminatedUnion<
              [
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"stepConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"repeatable">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldArray">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"sharedFields">;
                    fieldIds: z.ZodArray<z.ZodString>;
                  },
                  z.core.$strip
                >,
              ],
              "type"
            >
          >
        >;
        validations: z.ZodOptional<
          z.ZodRecord<
            z.ZodEnum<{
              required: "required";
              pattern: "pattern";
              maxLength: "maxLength";
              minLength: "minLength";
              maxItems: "maxItems";
              minItems: "minItems";
              equal: "equal";
              notEqual: "notEqual";
              min: "min";
              max: "max";
              conditionalOn: "conditionalOn";
              past: "past";
              pastOrToday: "pastOrToday";
              future: "future";
              futureOrToday: "futureOrToday";
              after: "after";
              before: "before";
              onOrAfter: "onOrAfter";
              onOrBefore: "onOrBefore";
              minYear: "minYear";
              maxYear: "maxYear";
              radio: "radio";
              minSelection: "minSelection";
              maxSelection: "maxSelection";
              email: "email";
              fileTypes: "fileTypes";
              itemMaxSize: "itemMaxSize";
              maxSize: "maxSize";
              gt: "gt";
              lt: "lt";
              contains: "contains";
              strictEquality: "strictEquality";
            }> &
              z.core.$partial,
            z.ZodObject<
              {
                error: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodAny>;
                reference: z.ZodOptional<z.ZodString>;
                targetStepId: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >
          >
        >;
        metadata: z.ZodOptional<
          z.ZodObject<
            {
              pii: z.ZodOptional<z.ZodBoolean>;
              sensitive: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        options: z.ZodOptional<
          z.ZodArray<
            z.ZodObject<
              {
                label: z.ZodString;
                value: z.ZodString;
                disabled: z.ZodOptional<z.ZodBoolean>;
              },
              z.core.$strip
            >
          >
        >;
        multiple: z.ZodOptional<z.ZodBoolean>;
        ui: z.ZodOptional<
          z.ZodObject<
            {
              width: z.ZodOptional<
                z.ZodEnum<{
                  long: "long";
                  short: "short";
                  medium: "medium";
                }>
              >;
            },
            z.core.$strip
          >
        >;
        htmlType: z.ZodLiteral<"textarea">;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        fieldId: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
        value: z.ZodOptional<z.ZodAny>;
        isDisabled: z.ZodOptional<z.ZodBoolean>;
        isHidden: z.ZodOptional<z.ZodBoolean>;
        behaviours: z.ZodOptional<
          z.ZodArray<
            z.ZodDiscriminatedUnion<
              [
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"stepConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"repeatable">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldArray">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"sharedFields">;
                    fieldIds: z.ZodArray<z.ZodString>;
                  },
                  z.core.$strip
                >,
              ],
              "type"
            >
          >
        >;
        validations: z.ZodOptional<
          z.ZodRecord<
            z.ZodEnum<{
              required: "required";
              pattern: "pattern";
              maxLength: "maxLength";
              minLength: "minLength";
              maxItems: "maxItems";
              minItems: "minItems";
              equal: "equal";
              notEqual: "notEqual";
              min: "min";
              max: "max";
              conditionalOn: "conditionalOn";
              past: "past";
              pastOrToday: "pastOrToday";
              future: "future";
              futureOrToday: "futureOrToday";
              after: "after";
              before: "before";
              onOrAfter: "onOrAfter";
              onOrBefore: "onOrBefore";
              minYear: "minYear";
              maxYear: "maxYear";
              radio: "radio";
              minSelection: "minSelection";
              maxSelection: "maxSelection";
              email: "email";
              fileTypes: "fileTypes";
              itemMaxSize: "itemMaxSize";
              maxSize: "maxSize";
              gt: "gt";
              lt: "lt";
              contains: "contains";
              strictEquality: "strictEquality";
            }> &
              z.core.$partial,
            z.ZodObject<
              {
                error: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodAny>;
                reference: z.ZodOptional<z.ZodString>;
                targetStepId: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >
          >
        >;
        metadata: z.ZodOptional<
          z.ZodObject<
            {
              pii: z.ZodOptional<z.ZodBoolean>;
              sensitive: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        options: z.ZodOptional<
          z.ZodArray<
            z.ZodObject<
              {
                label: z.ZodString;
                value: z.ZodString;
                disabled: z.ZodOptional<z.ZodBoolean>;
              },
              z.core.$strip
            >
          >
        >;
        multiple: z.ZodOptional<z.ZodBoolean>;
        ui: z.ZodOptional<
          z.ZodObject<
            {
              width: z.ZodOptional<
                z.ZodEnum<{
                  long: "long";
                  short: "short";
                  medium: "medium";
                }>
              >;
            },
            z.core.$strip
          >
        >;
        htmlType: z.ZodLiteral<"date">;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        fieldId: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
        value: z.ZodOptional<z.ZodAny>;
        isDisabled: z.ZodOptional<z.ZodBoolean>;
        isHidden: z.ZodOptional<z.ZodBoolean>;
        behaviours: z.ZodOptional<
          z.ZodArray<
            z.ZodDiscriminatedUnion<
              [
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"stepConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"repeatable">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldArray">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"sharedFields">;
                    fieldIds: z.ZodArray<z.ZodString>;
                  },
                  z.core.$strip
                >,
              ],
              "type"
            >
          >
        >;
        validations: z.ZodOptional<
          z.ZodRecord<
            z.ZodEnum<{
              required: "required";
              pattern: "pattern";
              maxLength: "maxLength";
              minLength: "minLength";
              maxItems: "maxItems";
              minItems: "minItems";
              equal: "equal";
              notEqual: "notEqual";
              min: "min";
              max: "max";
              conditionalOn: "conditionalOn";
              past: "past";
              pastOrToday: "pastOrToday";
              future: "future";
              futureOrToday: "futureOrToday";
              after: "after";
              before: "before";
              onOrAfter: "onOrAfter";
              onOrBefore: "onOrBefore";
              minYear: "minYear";
              maxYear: "maxYear";
              radio: "radio";
              minSelection: "minSelection";
              maxSelection: "maxSelection";
              email: "email";
              fileTypes: "fileTypes";
              itemMaxSize: "itemMaxSize";
              maxSize: "maxSize";
              gt: "gt";
              lt: "lt";
              contains: "contains";
              strictEquality: "strictEquality";
            }> &
              z.core.$partial,
            z.ZodObject<
              {
                error: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodAny>;
                reference: z.ZodOptional<z.ZodString>;
                targetStepId: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >
          >
        >;
        metadata: z.ZodOptional<
          z.ZodObject<
            {
              pii: z.ZodOptional<z.ZodBoolean>;
              sensitive: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        options: z.ZodOptional<
          z.ZodArray<
            z.ZodObject<
              {
                label: z.ZodString;
                value: z.ZodString;
                disabled: z.ZodOptional<z.ZodBoolean>;
              },
              z.core.$strip
            >
          >
        >;
        multiple: z.ZodOptional<z.ZodBoolean>;
        ui: z.ZodOptional<
          z.ZodObject<
            {
              width: z.ZodOptional<
                z.ZodEnum<{
                  long: "long";
                  short: "short";
                  medium: "medium";
                }>
              >;
            },
            z.core.$strip
          >
        >;
        htmlType: z.ZodLiteral<"number">;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        fieldId: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
        value: z.ZodOptional<z.ZodAny>;
        isDisabled: z.ZodOptional<z.ZodBoolean>;
        isHidden: z.ZodOptional<z.ZodBoolean>;
        behaviours: z.ZodOptional<
          z.ZodArray<
            z.ZodDiscriminatedUnion<
              [
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"stepConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"repeatable">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldArray">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"sharedFields">;
                    fieldIds: z.ZodArray<z.ZodString>;
                  },
                  z.core.$strip
                >,
              ],
              "type"
            >
          >
        >;
        validations: z.ZodOptional<
          z.ZodRecord<
            z.ZodEnum<{
              required: "required";
              pattern: "pattern";
              maxLength: "maxLength";
              minLength: "minLength";
              maxItems: "maxItems";
              minItems: "minItems";
              equal: "equal";
              notEqual: "notEqual";
              min: "min";
              max: "max";
              conditionalOn: "conditionalOn";
              past: "past";
              pastOrToday: "pastOrToday";
              future: "future";
              futureOrToday: "futureOrToday";
              after: "after";
              before: "before";
              onOrAfter: "onOrAfter";
              onOrBefore: "onOrBefore";
              minYear: "minYear";
              maxYear: "maxYear";
              radio: "radio";
              minSelection: "minSelection";
              maxSelection: "maxSelection";
              email: "email";
              fileTypes: "fileTypes";
              itemMaxSize: "itemMaxSize";
              maxSize: "maxSize";
              gt: "gt";
              lt: "lt";
              contains: "contains";
              strictEquality: "strictEquality";
            }> &
              z.core.$partial,
            z.ZodObject<
              {
                error: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodAny>;
                reference: z.ZodOptional<z.ZodString>;
                targetStepId: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >
          >
        >;
        metadata: z.ZodOptional<
          z.ZodObject<
            {
              pii: z.ZodOptional<z.ZodBoolean>;
              sensitive: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        options: z.ZodOptional<
          z.ZodArray<
            z.ZodObject<
              {
                label: z.ZodString;
                value: z.ZodString;
                disabled: z.ZodOptional<z.ZodBoolean>;
              },
              z.core.$strip
            >
          >
        >;
        multiple: z.ZodOptional<z.ZodBoolean>;
        ui: z.ZodOptional<
          z.ZodObject<
            {
              width: z.ZodOptional<
                z.ZodEnum<{
                  long: "long";
                  short: "short";
                  medium: "medium";
                }>
              >;
            },
            z.core.$strip
          >
        >;
        htmlType: z.ZodLiteral<"tel">;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        fieldId: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
        value: z.ZodOptional<z.ZodAny>;
        isDisabled: z.ZodOptional<z.ZodBoolean>;
        isHidden: z.ZodOptional<z.ZodBoolean>;
        behaviours: z.ZodOptional<
          z.ZodArray<
            z.ZodDiscriminatedUnion<
              [
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"stepConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"repeatable">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldArray">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"sharedFields">;
                    fieldIds: z.ZodArray<z.ZodString>;
                  },
                  z.core.$strip
                >,
              ],
              "type"
            >
          >
        >;
        validations: z.ZodOptional<
          z.ZodRecord<
            z.ZodEnum<{
              required: "required";
              pattern: "pattern";
              maxLength: "maxLength";
              minLength: "minLength";
              maxItems: "maxItems";
              minItems: "minItems";
              equal: "equal";
              notEqual: "notEqual";
              min: "min";
              max: "max";
              conditionalOn: "conditionalOn";
              past: "past";
              pastOrToday: "pastOrToday";
              future: "future";
              futureOrToday: "futureOrToday";
              after: "after";
              before: "before";
              onOrAfter: "onOrAfter";
              onOrBefore: "onOrBefore";
              minYear: "minYear";
              maxYear: "maxYear";
              radio: "radio";
              minSelection: "minSelection";
              maxSelection: "maxSelection";
              email: "email";
              fileTypes: "fileTypes";
              itemMaxSize: "itemMaxSize";
              maxSize: "maxSize";
              gt: "gt";
              lt: "lt";
              contains: "contains";
              strictEquality: "strictEquality";
            }> &
              z.core.$partial,
            z.ZodObject<
              {
                error: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodAny>;
                reference: z.ZodOptional<z.ZodString>;
                targetStepId: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >
          >
        >;
        metadata: z.ZodOptional<
          z.ZodObject<
            {
              pii: z.ZodOptional<z.ZodBoolean>;
              sensitive: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        options: z.ZodOptional<
          z.ZodArray<
            z.ZodObject<
              {
                label: z.ZodString;
                value: z.ZodString;
                disabled: z.ZodOptional<z.ZodBoolean>;
              },
              z.core.$strip
            >
          >
        >;
        multiple: z.ZodOptional<z.ZodBoolean>;
        ui: z.ZodOptional<
          z.ZodObject<
            {
              width: z.ZodOptional<
                z.ZodEnum<{
                  long: "long";
                  short: "short";
                  medium: "medium";
                }>
              >;
            },
            z.core.$strip
          >
        >;
        htmlType: z.ZodLiteral<"email">;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        fieldId: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
        value: z.ZodOptional<z.ZodAny>;
        isDisabled: z.ZodOptional<z.ZodBoolean>;
        isHidden: z.ZodOptional<z.ZodBoolean>;
        behaviours: z.ZodOptional<
          z.ZodArray<
            z.ZodDiscriminatedUnion<
              [
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"stepConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"repeatable">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldArray">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"sharedFields">;
                    fieldIds: z.ZodArray<z.ZodString>;
                  },
                  z.core.$strip
                >,
              ],
              "type"
            >
          >
        >;
        validations: z.ZodOptional<
          z.ZodRecord<
            z.ZodEnum<{
              required: "required";
              pattern: "pattern";
              maxLength: "maxLength";
              minLength: "minLength";
              maxItems: "maxItems";
              minItems: "minItems";
              equal: "equal";
              notEqual: "notEqual";
              min: "min";
              max: "max";
              conditionalOn: "conditionalOn";
              past: "past";
              pastOrToday: "pastOrToday";
              future: "future";
              futureOrToday: "futureOrToday";
              after: "after";
              before: "before";
              onOrAfter: "onOrAfter";
              onOrBefore: "onOrBefore";
              minYear: "minYear";
              maxYear: "maxYear";
              radio: "radio";
              minSelection: "minSelection";
              maxSelection: "maxSelection";
              email: "email";
              fileTypes: "fileTypes";
              itemMaxSize: "itemMaxSize";
              maxSize: "maxSize";
              gt: "gt";
              lt: "lt";
              contains: "contains";
              strictEquality: "strictEquality";
            }> &
              z.core.$partial,
            z.ZodObject<
              {
                error: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodAny>;
                reference: z.ZodOptional<z.ZodString>;
                targetStepId: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >
          >
        >;
        metadata: z.ZodOptional<
          z.ZodObject<
            {
              pii: z.ZodOptional<z.ZodBoolean>;
              sensitive: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        multiple: z.ZodOptional<z.ZodBoolean>;
        ui: z.ZodOptional<
          z.ZodObject<
            {
              width: z.ZodOptional<
                z.ZodEnum<{
                  long: "long";
                  short: "short";
                  medium: "medium";
                }>
              >;
            },
            z.core.$strip
          >
        >;
        htmlType: z.ZodLiteral<"checkbox">;
        options: z.ZodArray<
          z.ZodObject<
            {
              label: z.ZodString;
              value: z.ZodString;
              disabled: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        fieldId: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
        value: z.ZodOptional<z.ZodAny>;
        isDisabled: z.ZodOptional<z.ZodBoolean>;
        isHidden: z.ZodOptional<z.ZodBoolean>;
        behaviours: z.ZodOptional<
          z.ZodArray<
            z.ZodDiscriminatedUnion<
              [
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"stepConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"repeatable">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldArray">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"sharedFields">;
                    fieldIds: z.ZodArray<z.ZodString>;
                  },
                  z.core.$strip
                >,
              ],
              "type"
            >
          >
        >;
        validations: z.ZodOptional<
          z.ZodRecord<
            z.ZodEnum<{
              required: "required";
              pattern: "pattern";
              maxLength: "maxLength";
              minLength: "minLength";
              maxItems: "maxItems";
              minItems: "minItems";
              equal: "equal";
              notEqual: "notEqual";
              min: "min";
              max: "max";
              conditionalOn: "conditionalOn";
              past: "past";
              pastOrToday: "pastOrToday";
              future: "future";
              futureOrToday: "futureOrToday";
              after: "after";
              before: "before";
              onOrAfter: "onOrAfter";
              onOrBefore: "onOrBefore";
              minYear: "minYear";
              maxYear: "maxYear";
              radio: "radio";
              minSelection: "minSelection";
              maxSelection: "maxSelection";
              email: "email";
              fileTypes: "fileTypes";
              itemMaxSize: "itemMaxSize";
              maxSize: "maxSize";
              gt: "gt";
              lt: "lt";
              contains: "contains";
              strictEquality: "strictEquality";
            }> &
              z.core.$partial,
            z.ZodObject<
              {
                error: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodAny>;
                reference: z.ZodOptional<z.ZodString>;
                targetStepId: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >
          >
        >;
        metadata: z.ZodOptional<
          z.ZodObject<
            {
              pii: z.ZodOptional<z.ZodBoolean>;
              sensitive: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        ui: z.ZodOptional<
          z.ZodObject<
            {
              width: z.ZodOptional<
                z.ZodEnum<{
                  long: "long";
                  short: "short";
                  medium: "medium";
                }>
              >;
            },
            z.core.$strip
          >
        >;
        options: z.ZodArray<
          z.ZodObject<
            {
              label: z.ZodString;
              value: z.ZodString;
              disabled: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        htmlType: z.ZodLiteral<"select">;
        multiple: z.ZodBoolean;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        fieldId: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
        value: z.ZodOptional<z.ZodAny>;
        isDisabled: z.ZodOptional<z.ZodBoolean>;
        isHidden: z.ZodOptional<z.ZodBoolean>;
        behaviours: z.ZodOptional<
          z.ZodArray<
            z.ZodDiscriminatedUnion<
              [
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"stepConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"repeatable">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldArray">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"sharedFields">;
                    fieldIds: z.ZodArray<z.ZodString>;
                  },
                  z.core.$strip
                >,
              ],
              "type"
            >
          >
        >;
        validations: z.ZodOptional<
          z.ZodRecord<
            z.ZodEnum<{
              required: "required";
              pattern: "pattern";
              maxLength: "maxLength";
              minLength: "minLength";
              maxItems: "maxItems";
              minItems: "minItems";
              equal: "equal";
              notEqual: "notEqual";
              min: "min";
              max: "max";
              conditionalOn: "conditionalOn";
              past: "past";
              pastOrToday: "pastOrToday";
              future: "future";
              futureOrToday: "futureOrToday";
              after: "after";
              before: "before";
              onOrAfter: "onOrAfter";
              onOrBefore: "onOrBefore";
              minYear: "minYear";
              maxYear: "maxYear";
              radio: "radio";
              minSelection: "minSelection";
              maxSelection: "maxSelection";
              email: "email";
              fileTypes: "fileTypes";
              itemMaxSize: "itemMaxSize";
              maxSize: "maxSize";
              gt: "gt";
              lt: "lt";
              contains: "contains";
              strictEquality: "strictEquality";
            }> &
              z.core.$partial,
            z.ZodObject<
              {
                error: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodAny>;
                reference: z.ZodOptional<z.ZodString>;
                targetStepId: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >
          >
        >;
        metadata: z.ZodOptional<
          z.ZodObject<
            {
              pii: z.ZodOptional<z.ZodBoolean>;
              sensitive: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        multiple: z.ZodOptional<z.ZodBoolean>;
        ui: z.ZodOptional<
          z.ZodObject<
            {
              width: z.ZodOptional<
                z.ZodEnum<{
                  long: "long";
                  short: "short";
                  medium: "medium";
                }>
              >;
            },
            z.core.$strip
          >
        >;
        options: z.ZodArray<
          z.ZodObject<
            {
              label: z.ZodString;
              value: z.ZodString;
              disabled: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        htmlType: z.ZodLiteral<"radio">;
      },
      z.core.$strip
    >,
    z.ZodObject<
      {
        fieldId: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        defaultValue: z.ZodOptional<z.ZodAny>;
        value: z.ZodOptional<z.ZodAny>;
        isDisabled: z.ZodOptional<z.ZodBoolean>;
        isHidden: z.ZodOptional<z.ZodBoolean>;
        behaviours: z.ZodOptional<
          z.ZodArray<
            z.ZodDiscriminatedUnion<
              [
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"stepConditionalOn">;
                    targetFieldId: z.ZodString;
                    targetStepId: z.ZodOptional<z.ZodString>;
                    operator: z.ZodEnum<{
                      equal: "equal";
                      notEqual: "notEqual";
                      in: "in";
                      exists: "exists";
                    }>;
                    value: z.ZodUnion<
                      readonly [
                        z.ZodString,
                        z.ZodNumber,
                        z.ZodBoolean,
                        z.ZodArray<z.ZodString>,
                        z.ZodArray<z.ZodNumber>,
                      ]
                    >;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"repeatable">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"fieldArray">;
                    min: z.ZodNumber;
                    max: z.ZodNumber;
                  },
                  z.core.$strip
                >,
                z.ZodObject<
                  {
                    type: z.ZodLiteral<"sharedFields">;
                    fieldIds: z.ZodArray<z.ZodString>;
                  },
                  z.core.$strip
                >,
              ],
              "type"
            >
          >
        >;
        validations: z.ZodOptional<
          z.ZodRecord<
            z.ZodEnum<{
              required: "required";
              pattern: "pattern";
              maxLength: "maxLength";
              minLength: "minLength";
              maxItems: "maxItems";
              minItems: "minItems";
              equal: "equal";
              notEqual: "notEqual";
              min: "min";
              max: "max";
              conditionalOn: "conditionalOn";
              past: "past";
              pastOrToday: "pastOrToday";
              future: "future";
              futureOrToday: "futureOrToday";
              after: "after";
              before: "before";
              onOrAfter: "onOrAfter";
              onOrBefore: "onOrBefore";
              minYear: "minYear";
              maxYear: "maxYear";
              radio: "radio";
              minSelection: "minSelection";
              maxSelection: "maxSelection";
              email: "email";
              fileTypes: "fileTypes";
              itemMaxSize: "itemMaxSize";
              maxSize: "maxSize";
              gt: "gt";
              lt: "lt";
              contains: "contains";
              strictEquality: "strictEquality";
            }> &
              z.core.$partial,
            z.ZodObject<
              {
                error: z.ZodOptional<z.ZodString>;
                value: z.ZodOptional<z.ZodAny>;
                reference: z.ZodOptional<z.ZodString>;
                targetStepId: z.ZodOptional<z.ZodString>;
              },
              z.core.$strip
            >
          >
        >;
        metadata: z.ZodOptional<
          z.ZodObject<
            {
              pii: z.ZodOptional<z.ZodBoolean>;
              sensitive: z.ZodOptional<z.ZodBoolean>;
            },
            z.core.$strip
          >
        >;
        options: z.ZodOptional<
          z.ZodArray<
            z.ZodObject<
              {
                label: z.ZodString;
                value: z.ZodString;
                disabled: z.ZodOptional<z.ZodBoolean>;
              },
              z.core.$strip
            >
          >
        >;
        ui: z.ZodOptional<
          z.ZodObject<
            {
              width: z.ZodOptional<
                z.ZodEnum<{
                  long: "long";
                  short: "short";
                  medium: "medium";
                }>
              >;
            },
            z.core.$strip
          >
        >;
        multiple: z.ZodBoolean;
        htmlType: z.ZodLiteral<"file">;
      },
      z.core.$strip
    >,
  ],
  "htmlType"
>;
export type Primitive = z.infer<typeof primitiveSchema>;
export declare const fieldOverridesSchema: z.ZodObject<
  {
    options: z.ZodOptional<
      z.ZodArray<
        z.ZodObject<
          {
            label: z.ZodString;
            value: z.ZodString;
            disabled: z.ZodOptional<z.ZodBoolean>;
          },
          z.core.$strip
        >
      >
    >;
    label: z.ZodString;
    placeholder: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    defaultValue: z.ZodOptional<z.ZodAny>;
    isDisabled: z.ZodOptional<z.ZodBoolean>;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    validations: z.ZodOptional<
      z.ZodRecord<
        z.ZodEnum<{
          required: "required";
          pattern: "pattern";
          maxLength: "maxLength";
          minLength: "minLength";
          maxItems: "maxItems";
          minItems: "minItems";
          equal: "equal";
          notEqual: "notEqual";
          min: "min";
          max: "max";
          conditionalOn: "conditionalOn";
          past: "past";
          pastOrToday: "pastOrToday";
          future: "future";
          futureOrToday: "futureOrToday";
          after: "after";
          before: "before";
          onOrAfter: "onOrAfter";
          onOrBefore: "onOrBefore";
          minYear: "minYear";
          maxYear: "maxYear";
          radio: "radio";
          minSelection: "minSelection";
          maxSelection: "maxSelection";
          email: "email";
          fileTypes: "fileTypes";
          itemMaxSize: "itemMaxSize";
          maxSize: "maxSize";
          gt: "gt";
          lt: "lt";
          contains: "contains";
          strictEquality: "strictEquality";
        }> &
          z.core.$partial,
        z.ZodObject<
          {
            error: z.ZodOptional<z.ZodString>;
            value: z.ZodOptional<z.ZodAny>;
            reference: z.ZodOptional<z.ZodString>;
            targetStepId: z.ZodOptional<z.ZodString>;
          },
          z.core.$strip
        >
      >
    >;
    multiple: z.ZodOptional<z.ZodBoolean>;
  },
  z.core.$strip
>;
export type FieldOverrides = z.infer<typeof fieldOverridesSchema>;
