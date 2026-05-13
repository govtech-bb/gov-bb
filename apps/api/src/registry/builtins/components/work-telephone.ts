import type { TelPrimitive } from "@govtech-bb/form-types";

export const WorkTelephone: TelPrimitive = {
    fieldId: "work-telephone",
    label: "Work telephone",
    htmlType: "tel",
    validations: {
        pattern: {
            value: "^\\d{3}[- ]?\\d{4}$|^(?:\\d{1,2}[- ]?)?\\d{3}[- ]?\\d{3}[- ]?\\d{4}$",
            error: "Please enter a valid phone number",
        },
    },
};
