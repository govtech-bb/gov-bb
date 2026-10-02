import { TextPrimitive } from "@govtech-bb/form-types";
import {
  PERSON_NAME_PATTERN,
  PERSON_NAME_ALLOWED,
} from "../person-name-pattern";

export const MiddleName: TextPrimitive = {
  fieldId: "middle-name",
  label: "Middle name",
  htmlType: "text",
  validations: {
    minLength: {
      value: 2,
      error: "Middle name must be at least 2 characters",
    },
    pattern: {
      value: PERSON_NAME_PATTERN,
      error: `Middle name must contain only ${PERSON_NAME_ALLOWED}`,
    },
  },
};
