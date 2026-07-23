import type { TextPrimitive } from "@govtech-bb/form-types";
import {
  PERSON_NAME_PATTERN,
  PERSON_NAME_ALLOWED,
} from "../person-name-pattern";

export const FirstName: TextPrimitive = {
  fieldId: "first-name",
  label: "First name",
  htmlType: "text",
  validations: {
    required: {
      value: true,
      error: "First name is required",
    },
    minLength: {
      value: 2,
      error: "First name must be at least 2 characters",
    },
    pattern: {
      value: PERSON_NAME_PATTERN,
      error: `First name must contain only ${PERSON_NAME_ALLOWED}`,
    },
  },
};
