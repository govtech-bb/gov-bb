import type { TextPrimitive } from "@govtech-bb/form-types";

export const AccountNumber: TextPrimitive = {
    fieldId: "account-number",
    label: "Account number",
    htmlType: "text",
    validations: {
        minLength: {
            value: 5,
            error: "Account number must be at least 5 characters",
        },
    },
};
