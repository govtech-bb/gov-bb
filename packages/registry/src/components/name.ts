import { TextPrimitive } from "@govtech-bb/form-types";
import {
  PERSON_NAME_PATTERN,
  PERSON_NAME_ALLOWED,
} from "../person-name-pattern";

export const Name: TextPrimitive = {
  fieldId: "name",
  label: "Name",
  htmlType: "text",
  validations: {
    required: {
      value: true,
      error: "Name is required",
    },
    minLength: {
      value: 2,
      error: "Name must be at least 2 characters",
    },
    pattern: {
      value: PERSON_NAME_PATTERN,
      error: `Name must contain only ${PERSON_NAME_ALLOWED}`,
    },
  },
};
