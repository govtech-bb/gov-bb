import {
  Behaviour,
  DateTimeFormat,
  HtmlTypes,
  Option,
  PrimitiveUI,
  ValidationRule,
} from "@govtech-bb/form-types";
import { FieldValue } from "./validation.type";

export interface ClientPrimitive {
  id: string;
  name: string;
  label: string;
  htmlType: HtmlTypes;
  placeholder?: string;
  hint?: string;
  defaultValue?: unknown;
  disabled: boolean;
  hidden: boolean;
  options?: Option[];
  multiple?: boolean;
  validations?: ValidationRule;
  behaviours?: Behaviour[];
  ui?: PrimitiveUI;
}

export interface ClientFormStep {
  stepId: string;
  title: string;
  description?: string;
  fields: ClientPrimitive[];
  behaviours?: Behaviour[];
}

export interface ClientServiceContract {
  formId: string;
  title: string;
  description?: string;
  steps: ClientFormStep[];
  createdAt: DateTimeFormat;
  updatedAt: DateTimeFormat;
  version: string;
}

export type FormValues = Record<string, FieldValue>;
