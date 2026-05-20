import { SelectPrimitive } from "@govtech-bb/form-types";

export const Relationship: SelectPrimitive = {
  fieldId: "relationship",
  htmlType: "select",
  label: "Relationship",
  options: [
    { label: "Spouse", value: "spouse" },
    { label: "Parent", value: "parent" },
    { label: "Child", value: "child" },
    { label: "Sibling", value: "sibling" },
    { label: "Grandparent", value: "grandparent" },
    { label: "Grandchild", value: "grandchild" },
    { label: "Friend", value: "friend" },
    { label: "Colleague", value: "colleague" },
    { label: "Other", value: "other" },
  ],
  multiple: false,
  validations: {
    required: {
      value: true,
      error: "Relationship is required",
    },
  },
};
