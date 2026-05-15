import type { SelectPrimitive } from "@govtech-bb/form-types";

export const Country: SelectPrimitive = {
  fieldId: "country",
  label: "Country",
  htmlType: "select",
  options: [
    { label: "Antigua and Barbuda", value: "antigua-and-barbuda" },
    { label: "Bahamas", value: "bahamas" },
    { label: "Barbados", value: "barbados" },
    { label: "Belize", value: "belize" },
    { label: "Canada", value: "canada" },
    { label: "Dominica", value: "dominica" },
    { label: "Dominican Republic", value: "dominican-republic" },
    { label: "Grenada", value: "grenada" },
    { label: "Guyana", value: "guyana" },
    { label: "Jamaica", value: "jamaica" },
    { label: "Saint Kitts and Nevis", value: "saint-kitts-and-nevis" },
    { label: "Saint Lucia", value: "saint-lucia" },
    {
      label: "Saint Vincent and the Grenadines",
      value: "saint-vincent-and-the-grenadines",
    },
    { label: "Suriname", value: "suriname" },
    { label: "Trinidad and Tobago", value: "trinidad-and-tobago" },
    { label: "United Kingdom", value: "united-kingdom" },
    { label: "United States", value: "united-states" },
  ],
  multiple: false,
  validations: {
    required: {
      value: true,
      error: "Country is required",
    },
  },
};
