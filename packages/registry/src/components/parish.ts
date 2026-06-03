import type { SelectPrimitive } from "@govtech-bb/form-types";

export const Parish: SelectPrimitive = {
  fieldId: "parish",
  label: "Parish",
  htmlType: "select",
  options: [
    { label: "Christ Church", value: "christ-church" },
    { label: "Saint Andrew", value: "saint-andrew" },
    { label: "Saint George", value: "saint-george" },
    { label: "Saint James", value: "saint-james" },
    { label: "Saint John", value: "saint-john" },
    { label: "Saint Joseph", value: "saint-joseph" },
    { label: "Saint Lucy", value: "saint-lucy" },
    { label: "Saint Michael", value: "saint-michael" },
    { label: "Saint Peter", value: "saint-peter" },
    { label: "Saint Philip", value: "saint-philip" },
    { label: "Saint Thomas", value: "saint-thomas" },
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
