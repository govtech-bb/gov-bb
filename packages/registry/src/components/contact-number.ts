import { TelPrimitive } from "@govtech-bb/form-types";

export const ContactTelephone: TelPrimitive = {
  fieldId: "contact-telephone",
  htmlType: "tel",
  label: "Contact telephone",
  validations: {
    phone: {
      value: true,
      error: "Please enter a valid phone number",
    },
  },
};
