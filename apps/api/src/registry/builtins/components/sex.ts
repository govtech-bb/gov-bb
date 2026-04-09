import { RadioPrimitive } from "../../types";

export const Sex: RadioPrimitive = {
  fieldId: "sex",
  htmlType: "radio",
  label: "Sex",
  options: [
    {
      label: "Male",
      value: "male"
    },
    {
      label: "Female",
      value: "female"
    }
  ]
}
