import {
  Behaviour,
  DateTimeFormat,
  HtmlTypes,
  Option,
  ValidationRule,
} from "@govtech-bb/form-types";

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

export type FormValues = Record<string, any>;
