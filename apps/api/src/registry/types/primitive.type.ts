import type { Behaviour } from "./behavior.type";
import type { ValidationRule } from "./validation.type";

export interface PrimitiveMetadata {
  pii: boolean;
  sensitive: boolean;
}

export type HtmlTypes =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "tel"
  | "email"
  | "checkbox"
  | "radio"
  | "file"
  | "select";

export interface Option {
  label: string;
  value: string;
}

export interface BasePrimitive {
  fieldId: string;
  label: string;
  htmlType: HtmlTypes;
  placeholder?: string;
  hint?: string;
  defaultValue?: any;
  value?: any;
  isDisabled?: boolean;
  isVisible?: boolean;
  behaviours?: Behaviour[];
  validations?: Partial<ValidationRule>[];
  metadata?: Partial<PrimitiveMetadata>;
  options?: Array<Option>;
  multiple?: boolean;
}

export interface TextPrimitive extends BasePrimitive {
  htmlType: "text";
}

export interface TextareaPrimitive extends BasePrimitive {
  htmlType: "textarea";
}

export interface DatePrimitive extends BasePrimitive {
  htmlType: "date";
}

export interface NumberPrimitive extends BasePrimitive {
  htmlType: "number";
}

export interface TelPrimitive extends BasePrimitive {
  htmlType: "tel";
}

export interface EmailPrimitive extends BasePrimitive {
  htmlType: "email";
}

export interface CheckboxPrimitive extends BasePrimitive {
  htmlType: "checkbox";
}

export interface SelectPrimitive extends BasePrimitive {
  options: Array<Option>;
  htmlType: "select";
  multiple: boolean;
}

export interface RadioPrimitive extends BasePrimitive {
  options: Array<Option>;
  htmlType: "radio";
}

export interface FilePrimitive extends BasePrimitive {
  multiple: boolean;
  htmlType: "file";
}

export type Primitive =
  | BasePrimitive
  | SelectPrimitive
  | RadioPrimitive
  | FilePrimitive

export type FieldOverrides = Pick<Partial<Primitive>,
  'label' | 'hint' | 'placeholder' | 'validations' | 'defaultValue' | 'isDisabled' | 'isVisible' | 'multiple' | 'options'
>
