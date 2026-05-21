import type { TextPrimitive } from "@govtech-bb/form-types";

export const NationalIdNumber: TextPrimitive = {
    fieldId: "national-id-number",
    label: "National ID number",
    htmlType: "text",
    ui: {
        width: "short",
    },
    validations: {
        pattern: {
            value: "^\\d{6}-\\d{4}$",
            error: "Enter a valid ID number (for example, 850101-0001)",
        },
    },
};
