import { TextPrimitive } from "@govtech-bb/form-types";

export const LastName: TextPrimitive = {
    fieldId: "last-name",
    label: "Last name",
    htmlType: "text",
    validations: {
        required: {
            value: true,
            error: "Last name is required",
        },
        minLength: {
            value: 2,
            error: "Last name must be at least 2 characters",
        },
        pattern: {
            value: "^\\s*[A-Za-zÀ-ÖØ-öø-ÿ](?:[A-Za-zÀ-ÖØ-öø-ÿ\\s'-]*[A-Za-zÀ-ÖØ-öø-ÿ])?\\s*$",
            error: "Last name must contain only letters, hyphens, or apostrophes",
        },
    },
};
