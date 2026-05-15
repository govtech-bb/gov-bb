import type { TextPrimitive } from "@govtech-bb/form-types";

export const Bank: TextPrimitive = {
    fieldId: "bank",
    label: "Bank",
    htmlType: "text",
    validations: {
        minLength: {
            value: 2,
            error: "Bank name must be at least 2 characters",
        },
    },
};
