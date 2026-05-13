import type { SelectPrimitive } from "@govtech-bb/form-types";

export const AccountType: SelectPrimitive = {
    fieldId: "account-type",
    label: "Account type",
    htmlType: "select",
    options: [],
    multiple: false,
    validations: {
        required: {
            value: true,
            error: "Account type is required",
        },
    },
};
