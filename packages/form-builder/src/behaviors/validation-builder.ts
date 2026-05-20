import type { HtmlTypes, ValidationType } from "@govtech-bb/form-types";

export type ValidationRuleDescriptor = {
  type: ValidationType;
  label: string;
  hasValue: boolean; // whether the rule takes a `value` parameter
  hasReference: boolean; // whether the rule takes a `referenceFieldId`
};

export const VALIDATION_RULE_DESCRIPTORS: Record<
  HtmlTypes,
  ValidationRuleDescriptor[]
> = {
  text: [
    {
      type: "required",
      label: "Required",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "minLength",
      label: "Min Length",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "maxLength",
      label: "Max Length",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "pattern",
      label: "Pattern",
      hasValue: true,
      hasReference: false,
    },
    { type: "equal", label: "Equal", hasValue: true, hasReference: true },
    {
      type: "notEqual",
      label: "Not Equal",
      hasValue: true,
      hasReference: true,
    },
  ],
  textarea: [
    {
      type: "required",
      label: "Required",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "minLength",
      label: "Min Length",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "maxLength",
      label: "Max Length",
      hasValue: true,
      hasReference: false,
    },
  ],
  email: [
    {
      type: "required",
      label: "Required",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "email",
      label: "Email Format",
      hasValue: false,
      hasReference: false,
    },
  ],
  number: [
    {
      type: "required",
      label: "Required",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "min",
      label: "Min Value",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "max",
      label: "Max Value",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "gt",
      label: "Greater Than",
      hasValue: true,
      hasReference: true,
    },
    {
      type: "lt",
      label: "Less Than",
      hasValue: true,
      hasReference: true,
    },
  ],
  date: [
    {
      type: "required",
      label: "Required",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "past",
      label: "In the Past",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "pastOrToday",
      label: "Past or Today",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "future",
      label: "In the Future",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "futureOrToday",
      label: "Future or Today",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "after",
      label: "After",
      hasValue: true,
      hasReference: true,
    },
    {
      type: "before",
      label: "Before",
      hasValue: true,
      hasReference: true,
    },
    {
      type: "onOrAfter",
      label: "On or After",
      hasValue: true,
      hasReference: true,
    },
    {
      type: "onOrBefore",
      label: "On or Before",
      hasValue: true,
      hasReference: true,
    },
    {
      type: "minYear",
      label: "Min Year",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "maxYear",
      label: "Max Year",
      hasValue: true,
      hasReference: false,
    },
  ],
  tel: [
    {
      type: "required",
      label: "Required",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "pattern",
      label: "Pattern",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "minLength",
      label: "Min Length",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "maxLength",
      label: "Max Length",
      hasValue: true,
      hasReference: false,
    },
  ],
  select: [
    {
      type: "required",
      label: "Required",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "minSelection",
      label: "Min Selection",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "maxSelection",
      label: "Max Selection",
      hasValue: true,
      hasReference: false,
    },
  ],
  radio: [
    {
      type: "required",
      label: "Required",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "radio",
      label: "Radio Required",
      hasValue: false,
      hasReference: false,
    },
  ],
  checkbox: [
    {
      type: "required",
      label: "Required",
      hasValue: false,
      hasReference: false,
    },
  ],
  file: [
    {
      type: "required",
      label: "Required",
      hasValue: false,
      hasReference: false,
    },
    {
      type: "fileTypes",
      label: "File Types",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "itemMaxSize",
      label: "Max File Size",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "maxSize",
      label: "Max Total Size",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "minItems",
      label: "Min Files",
      hasValue: true,
      hasReference: false,
    },
    {
      type: "maxItems",
      label: "Max Files",
      hasValue: true,
      hasReference: false,
    },
  ],
  "show-hide": [],
};
