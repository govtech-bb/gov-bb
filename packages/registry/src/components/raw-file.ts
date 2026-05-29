import type { FilePrimitive } from "@govtech-bb/form-types";

export const RawFile: FilePrimitive = {
  fieldId: "raw-file",
  htmlType: "file",
  label: "File upload",
  multiple: false,
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
