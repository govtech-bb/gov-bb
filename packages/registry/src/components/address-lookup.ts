import { AddressLookupPrimitive } from "@govtech-bb/form-types";

// A single-line address field backed by a Barbados-locked geocoder lookup.
// Stores the same string a plain address text field would; the geocoder only
// assists entry. Mirrors `Address`'s validations so it stays a required field.
export const AddressLookup: AddressLookupPrimitive = {
  fieldId: "address-lookup",
  htmlType: "address-lookup",
  label: "Address",
  ui: {
    width: "long",
  },
  validations: {
    required: {
      value: true,
      error: "Address is required",
    },
    minLength: {
      value: 5,
      error: "Address must be at least 5 characters",
    },
  },
};
