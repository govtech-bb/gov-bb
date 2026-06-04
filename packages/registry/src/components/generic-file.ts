import type { FilePrimitive } from "@govtech-bb/form-types";

export const GenericFile: FilePrimitive = {
  fieldId: "generic-file",
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
