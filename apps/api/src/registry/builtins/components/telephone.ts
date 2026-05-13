import type { TelPrimitive } from "@govtech-bb/form-types";

export const Telephone: TelPrimitive = {
    fieldId: "telephone",
    label: "Telephone number",
    htmlType: "tel",
    validations: {
        required: {
            value: true,
            error: "Telephone number is required",
        },
        pattern: {
            value: "^\\d{3}[- ]?\\d{4}$|^(?:\\d{1,2}[- ]?)?\\d{3}[- ]?\\d{3}[- ]?\\d{4}$",
            error: "Please enter a valid phone number",
        },
    },
};
