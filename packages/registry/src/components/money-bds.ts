import type { NumberPrimitive } from "@govtech-bb/form-types";

// An amount of money in Barbados dollars (#3638). The "BDS $" prefix is visual
// only (aria-hidden), so the hint names the currency for screen-reader users —
// a recipe that overrides the hint must keep "BDS dollars" in the label or
// hint. A fractional `step` tells the forms app to offer a decimal keyboard,
// and the pattern takes whole dollars or dollars and cents (1250 or 1250.50).
export const MoneyBds: NumberPrimitive = {
  fieldId: "money-bds",
  htmlType: "number",
  label: "Amount",
  hint: "In BDS dollars",
  step: 0.01,
  ui: {
    prefix: "BDS $",
    width: "short",
  },
  validations: {
    required: {
      value: true,
      error: "Enter the amount",
    },
    pattern: {
      value: "^\\d+(\\.\\d{1,2})?$",
      error: "Enter the amount as a number, like 1250 or 1250.50",
    },
    min: {
      value: 0,
      error: "The amount must be 0 or more",
    },
  },
};
