import type { SelectPrimitive } from "@govtech-bb/form-types";

export const Parish: SelectPrimitive = {
  fieldId: "parish",
  label: "Parish",
  htmlType: "select",
  options: [
    { label: "Christ Church", value: "christ-church" },
    { label: "St. Andrew", value: "st-andrew" },
    { label: "St. George", value: "st-george" },
    { label: "St. James", value: "st-james" },
    { label: "St. John", value: "st-john" },
    { label: "St. Joseph", value: "st-joseph" },
    { label: "St. Lucy", value: "st-lucy" },
    { label: "St. Michael", value: "st-michael" },
    { label: "St. Peter", value: "st-peter" },
    { label: "St. Philip", value: "st-philip" },
    { label: "St. Thomas", value: "st-thomas" },
  ],
  multiple: false,
  ui: {
    width: "long",
  },
  validations: {
    required: {
      value: true,
      error: "Parish is required",
    },
  },
};
