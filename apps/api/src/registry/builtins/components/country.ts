import type { SelectPrimitive } from "@govtech-bb/form-types";

export const Country: SelectPrimitive = {
    fieldId: "country",
    label: "Country",
    htmlType: "select",
    options: [],
    multiple: false,
    validations: {
        required: {
            value: true,
            error: "Country is required",
        },
    },
};
