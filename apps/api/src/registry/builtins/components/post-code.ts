import type { TextPrimitive } from "@govtech-bb/form-types";

export const Postcode: TextPrimitive = {
    fieldId: "postcode",
    label: "Postcode",
    htmlType: "text",
    ui: {
        width: "short",
    },
    validations: {
        pattern: {
            value: "^BB\\d{5}$",
            error: "Enter a valid postcode (for example, BB17004)",
        },
    },
};
