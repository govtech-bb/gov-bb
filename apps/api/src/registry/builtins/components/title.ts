import { SelectPrimitive } from "../../types";

export const Title: SelectPrimitive = {
  fieldId: "title",
  htmlType: "select",
  label: "Title",
  options: [
    {
      label: "Mr",
      value: "mr"
    },
    {
      label: "Miss",
      value: "miss"
    },
    {
      label: "Mrs",
      value: "mrs"
    }
  ],
  multiple: false,
}
