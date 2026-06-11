import { SelectPrimitive } from "@govtech-bb/form-types";

export const Title: SelectPrimitive = {
  fieldId: "title",
  htmlType: "select",
  label: "Title",
  options: [
    {
      label: "Mr",
      value: "mr",
    },
    {
      label: "Miss",
      value: "miss",
    },
    {
      label: "Ms",
      value: "ms",
    },
    {
      label: "Mrs",
      value: "mrs",
    },
  ],
  multiple: false,
  ui: {
    width: "short",
  },
  validations: {
    required: {
      value: true,
      error: "Title is required",
    },
  },
};
