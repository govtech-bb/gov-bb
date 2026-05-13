import { SelectPrimitive } from "@govtech-bb/form-types";

export const Nationality: SelectPrimitive = {
  fieldId: "nationality",
  htmlType: "select",
  label: "Nationality / Citizenship",
  options: [
    { label: "Antiguan and Barbudan", value: "antiguan-and-barbudan" },
    { label: "Bahamian", value: "bahamian" },
    { label: "Barbadian", value: "barbadian" },
    { label: "Belizean", value: "belizean" },
    { label: "Canadian", value: "canadian" },
    { label: "Dominican", value: "dominican" },
    { label: "Grenadian", value: "grenadian" },
    { label: "Guyanese", value: "guyanese" },
    { label: "Jamaican", value: "jamaican" },
    { label: "Kittsian and Nevisian", value: "kittsian-and-nevisian" },
    { label: "Saint Lucian", value: "saint-lucian" },
    { label: "Vincentian", value: "vincentian" },
    { label: "Surinamese", value: "surinamese" },
    {
      label: "Trinidadian and Tobagonian",
      value: "trinidadian-and-tobagonian",
    },
    { label: "British", value: "british" },
    { label: "American", value: "american" },
  ],
  multiple: false,
  validations: {
    required: {
      value: true,
      error: "Nationality is required",
    },
  },
};
