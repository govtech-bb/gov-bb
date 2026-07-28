import { TextPrimitive } from "@govtech-bb/form-types";
import {
  PERSON_NAME_PATTERN,
  PERSON_NAME_ALLOWED,
} from "../person-name-pattern";

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
      value: PERSON_NAME_PATTERN,
      error: `Last name must contain only ${PERSON_NAME_ALLOWED}`,
    },
  },
};
