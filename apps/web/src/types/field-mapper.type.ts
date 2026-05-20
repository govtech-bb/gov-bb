import {
  Behaviour,
  ContactDetails,
  DateTimeFormat,
  fieldValueSchema,
  HtmlTypes,
  Option,
  PrimitiveUI,
  ValidationRule,
} from "@govtech-bb/form-types";
import z from "zod";

export interface ClientPrimitive {
  id: string; // Step ID + field ID
  fieldId: string;
  stepId: string;
  name: string;
  label: string;
  htmlType: HtmlTypes;
  placeholder?: string;
  hint?: string;
  defaultValue?: unknown;
  disabled: boolean;
  hidden: boolean;
  conditionallyHidden: boolean;
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
  nextSteps?: { title: string; content?: string; items?: string[] }[];
}

export interface ClientServiceContract {
  formId: string;
  title: string;
  description?: string;
  contactDetails?: ContactDetails;
  steps: ClientFormStep[];
  createdAt: DateTimeFormat;
  updatedAt: DateTimeFormat;
  version: string;
}

const fieldId = z.string();
export const formValuesSchema = z.record(fieldId, fieldValueSchema);
export type FormValues = z.infer<typeof formValuesSchema>;

type stepId = string;
export type FormValuesByStep = Record<stepId, FormValues | Array<FormValues>>;
