import { RadioPrimitive } from "@govtech-bb/form-types";

export const Sex: RadioPrimitive = {
  fieldId: "sex",
  htmlType: "radio",
  label: "Sex",
  options: [
    {
      label: "Male",
      value: "male",
    },
    {
      label: "Female",
      value: "female",
    },
  ],
  validations: {
    radio: {
      value: true,
      error: "Please select an option",
    },
  },
};
