import type { CheckboxAccordionPrimitive } from "@govtech-bb/form-types";

// A collapsible multi-select. Categories (`groups`) are supplied per form via
// recipe overrides; the value is a flat string[] of selected option values, so
// `required` enforces "at least one item selected across all categories".
export const GenericCheckboxAccordion: CheckboxAccordionPrimitive = {
  fieldId: "generic-checkbox-accordion",
  htmlType: "checkbox-accordion",
  label: "Checkbox accordion",
  groups: [],
  validations: {
    required: {
      value: true,
      error: "This field is required",
    },
  },
};
