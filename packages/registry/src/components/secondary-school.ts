import type { SelectPrimitive } from "@govtech-bb/form-types";

export const SecondarySchool: SelectPrimitive = {
  fieldId: "secondary-school",
  label: "Secondary School",
  htmlType: "select",
  options: [
    { label: "Alexandra School", value: "alexandra-school" },
    { label: "Alleyne School", value: "alleyne-school" },
    {
      label: "Christ Church Foundation School",
      value: "christ-church-foundation-school",
    },
    { label: "Coleridge & Parry School", value: "coleridge-parry-school" },
    { label: "Combermere School", value: "combermere-school" },
    {
      label: "Daryll Jordan Secondary School",
      value: "daryll-jordan-secondary-school",
    },
    {
      label: "Deighton Griffith Secondary School",
      value: "deighton-griffith-secondary-school",
    },
    {
      label: "Ellerslie Secondary School",
      value: "ellerslie-secondary-school",
    },
    {
      label: "Grantley Adams Memorial School",
      value: "grantley-adams-memorial-school",
    },
    {
      label: "Graydon Sealy Secondary School",
      value: "graydon-sealy-secondary-school",
    },
    { label: "Harrison College", value: "harrison-college" },
    {
      label: "Parkinson Memorial Secondary School",
      value: "parkinson-memorial-secondary-school",
    },
    {
      label: "Princess Margaret Secondary School",
      value: "princess-margaret-secondary-school",
    },
    { label: "Queen's College", value: "queens-college" },
    {
      label: "Springer Memorial Secondary School",
      value: "springer-memorial-secondary-school",
    },
    {
      label: "The Frederick Smith Secondary School",
      value: "frederick-smith-secondary-school",
    },
    { label: "The Lester Vaughan School", value: "lester-vaughan-school" },
    { label: "The Lodge School", value: "lodge-school" },
    {
      label: "The St. George Secondary School",
      value: "st-george-secondary-school",
    },
    {
      label: "The St. Leonard's Boys' Secondary School",
      value: "st-leonards-boys-secondary-school",
    },
    { label: "The St. Michael School", value: "st-michael-school" },
  ],
  multiple: false,
  ui: {
    width: "long",
  },
  validations: {
    required: {
      value: true,
      error: "Secondary School is required",
    },
  },
};
