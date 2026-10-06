import type { QuestionBlock } from "../../forms/schema";
import {
  ACCOUNT_TYPES,
  COUNTRIES,
  MARITAL_STATUSES,
  NATIONALITIES,
  PARISHES,
  PRIMARY_SCHOOLS,
  RELATIONSHIPS,
  SECONDARY_SCHOOLS,
  SEXES,
  TITLES,
} from "./lists";

export {
  OPENING_HOURS_PATTERN,
  OPENING_HOURS_ERROR,
} from "../../forms/features/opening-hours/defaults";

/** Native copied defaults; registry provenance never becomes part of submitted form data. */
export const COMPONENTS = {
  "components/address-lookup": {
    kind: "address-lookup",
    label: "Address",
    required: {
      value: true,
      message: "Address is required",
    },
    validation: [
      {
        id: "minLength",
        type: "minLength",
        value: 5,
        message: "Address must be at least 5 characters",
      },
    ],
  },
  "components/opening-hours": {
    kind: "opening-hours",
    label: "Opening hours",
    required: {
      value: true,
      message: "Add hours for at least one day",
    },
    hint: 'Select "Add hours" for each day you are open. Open 24 hours? Enter 12:00 AM to 11:59 PM.',
    validation: [
      {
        id: "pattern",
        type: "pattern",
        pattern:
          "^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (([01]\\d|2[0-3]):[0-5]\\d) - (?!\\2$)([01]\\d|2[0-3]):[0-5]\\d$",
        flags: "u",
        message:
          "Enter an opening and a closing time that are different — for 24 hours, enter 12:00 AM to 11:59 PM",
      },
    ],
  },
  "components/first-name": {
    kind: "text",
    label: "First name",
    required: {
      value: true,
      message: "Enter first name",
    },
    validation: [
      {
        id: "minLength",
        type: "minLength",
        value: 2,
        message: "First name must be at least 2 characters",
      },
      {
        id: "pattern",
        type: "pattern",
        pattern: "^\\s*\\p{L}(?:[\\p{L}\\p{M}\\s'’.-]*[\\p{L}\\p{M}.])?\\s*$",
        flags: "u",
        message: "First name must contain only letters, spaces, hyphens, apostrophes, or periods",
      },
    ],
  },
  "components/middle-name": {
    kind: "text",
    label: "Middle name(s)",
    required: {
      value: false,
      message: "Enter middle name(s)",
    },
    hint: "If you have more than one, add them in order",
    validation: [
      {
        id: "minLength",
        type: "minLength",
        value: 2,
        message: "Middle name(s) must be at least 2 characters",
      },
      {
        id: "pattern",
        type: "pattern",
        pattern: "^\\s*\\p{L}(?:[\\p{L}\\p{M}\\s'’.-]*[\\p{L}\\p{M}.])?\\s*$",
        flags: "u",
        message:
          "Middle name(s) must contain only letters, spaces, hyphens, apostrophes, or periods",
      },
    ],
  },
  "components/last-name": {
    kind: "text",
    label: "Last name",
    required: {
      value: true,
      message: "Enter last name",
    },
    validation: [
      {
        id: "minLength",
        type: "minLength",
        value: 2,
        message: "Last name must be at least 2 characters",
      },
      {
        id: "pattern",
        type: "pattern",
        pattern: "^\\s*\\p{L}(?:[\\p{L}\\p{M}\\s'’.-]*[\\p{L}\\p{M}.])?\\s*$",
        flags: "u",
        message: "Last name must contain only letters, spaces, hyphens, apostrophes, or periods",
      },
    ],
  },
  "components/name": {
    kind: "text",
    label: "Full name",
    required: {
      value: true,
      message: "Enter full name",
    },
    validation: [
      {
        id: "minLength",
        type: "minLength",
        value: 2,
        message: "Full name must be at least 2 characters",
      },
      {
        id: "pattern",
        type: "pattern",
        pattern: "^\\s*\\p{L}(?:[\\p{L}\\p{M}\\s'’.-]*[\\p{L}\\p{M}.])?\\s*$",
        flags: "u",
        message: "Full name must contain only letters, spaces, hyphens, apostrophes, or periods",
      },
    ],
  },
  "components/title": {
    kind: "choice",
    label: "Title",
    required: {
      value: true,
      message: "Select title",
    },
    config: {
      width: "short",
      placeholder: "Select a title",
      selection: "single",
      presentation: "dropdown",
    },
    options: TITLES.map(([label, value]) => ({ id: value, label, value })),
  },
  "components/date-of-birth": {
    kind: "date",
    label: "Date of birth",
    required: {
      value: true,
      message: "Enter date of birth",
    },
    hint: "For example, 27 3 1990",
    validation: [
      {
        id: "before-today",
        type: "dateBefore",
        value: {
          context: "today",
        },
        inclusive: false,
        message: "Enter a date in the past",
      },
    ],
  },
  "components/sex": {
    kind: "choice",
    label: "Sex",
    required: {
      value: true,
      message: "Select sex",
    },
    config: {
      selection: "single",
      presentation: "radio",
    },
    options: SEXES.map(([label, value]) => ({ id: value, label, value })),
  },
  "components/national-id-number": {
    kind: "text",
    label: "National Identification (ID) number",
    required: {
      value: true,
      message: "Enter your National ID number",
    },
    hint: "This is on your National Registration card. For example, 900314-0052",
    config: {
      width: "medium",
      mask: "999999-9999",
    },
    validation: [
      {
        id: "pattern",
        type: "pattern",
        pattern: "^\\d{6}-\\d{4}$",
        flags: "u",
        message: "Enter a valid National ID number (for example, 900314-0052)",
      },
    ],
  },
  "components/national-insurance-number": {
    kind: "text",
    label: "National Insurance number",
    required: {
      value: true,
      message: "Enter your National Insurance number",
    },
    config: {
      width: "short",
      mask: "999999",
    },
    validation: [
      {
        id: "pattern",
        type: "pattern",
        pattern: "^\\d{6}$",
        flags: "u",
        message: "Enter a valid National Insurance number (for example, 123456)",
      },
    ],
  },
  "components/passport-number": {
    kind: "text",
    label: "Passport number",
    required: {
      value: true,
      message: "Enter passport number",
    },
    config: {
      width: "short",
    },
    validation: [
      {
        id: "minLength",
        type: "minLength",
        value: 6,
        message: "Passport number must be at least 6 characters",
      },
    ],
  },
  "components/tamis-number": {
    kind: "text",
    label: "TAMIS number",
    required: {
      value: true,
      message: "Enter tAMIS number",
    },
    validation: [
      {
        id: "minLength",
        type: "minLength",
        value: 10,
        message: "TAMIS number must be at least 10 characters",
      },
      {
        id: "maxLength",
        type: "maxLength",
        value: 15,
        message: "TAMIS number must be no more than 15 characters",
      },
      {
        id: "pattern",
        type: "pattern",
        pattern: "^\\d+$",
        flags: "u",
        message: "Enter a valid TAMIS number (digits only)",
      },
    ],
  },
  "components/address": {
    kind: "text",
    label: "Address line 1",
    required: {
      value: true,
      message: "Enter address line 1",
    },
    validation: [
      {
        id: "minLength",
        type: "minLength",
        value: 5,
        message: "Address line 1 must be at least 5 characters",
      },
    ],
  },
  "components/parish": {
    kind: "choice",
    label: "Parish",
    required: {
      value: true,
      message: "Select parish",
    },
    config: {
      placeholder: "Select a parish",
      selection: "single",
      presentation: "dropdown",
    },
    options: PARISHES.map(([label, value]) => ({ id: value, label, value })),
  },
  "components/postcode": {
    kind: "text",
    label: "Postcode",
    required: {
      value: false,
      message: "Enter postcode",
    },
    config: {
      width: "short",
    },
    validation: [
      {
        id: "pattern",
        type: "pattern",
        pattern: "^[Bb]{2} ?\\d{5}$",
        flags: "u",
        message: "Enter a valid postcode (for example, BB17004)",
      },
    ],
  },
  "components/country": {
    kind: "choice",
    label: "Country",
    required: {
      value: true,
      message: "Select country",
    },
    config: {
      placeholder: "Select a country",
      selection: "single",
      presentation: "dropdown",
    },
    options: COUNTRIES.map(([label, value]) => ({ id: value, label, value })),
  },
  "components/nationality": {
    kind: "choice",
    label: "Nationality",
    required: {
      value: true,
      message: "Select nationality",
    },
    config: {
      placeholder: "Select a nationality",
      selection: "single",
      presentation: "dropdown",
    },
    options: NATIONALITIES.map(([label, value]) => ({ id: value, label, value })),
  },
  "components/relationship": {
    kind: "choice",
    label: "Relationship",
    required: {
      value: true,
      message: "Select relationship",
    },
    config: {
      placeholder: "Select a relationship",
      selection: "single",
      presentation: "dropdown",
    },
    options: RELATIONSHIPS.map(([label, value]) => ({ id: value, label, value })),
  },
  "components/marital-status": {
    kind: "choice",
    label: "Marital status",
    required: {
      value: true,
      message: "Select marital status",
    },
    config: {
      placeholder: "Select a marital status",
      selection: "single",
      presentation: "dropdown",
    },
    options: MARITAL_STATUSES.map(([label, value]) => ({ id: value, label, value })),
  },
  "components/primary-school": {
    kind: "choice",
    label: "Primary school",
    required: {
      value: true,
      message: "Select primary school",
    },
    config: {
      placeholder: "Select a school",
      selection: "single",
      presentation: "dropdown",
    },
    options: PRIMARY_SCHOOLS.map(([label, value]) => ({ id: value, label, value })),
  },
  "components/secondary-school": {
    kind: "choice",
    label: "Secondary school",
    required: {
      value: true,
      message: "Select secondary school",
    },
    config: {
      placeholder: "Select a school",
      selection: "single",
      presentation: "dropdown",
    },
    options: SECONDARY_SCHOOLS.map(([label, value]) => ({ id: value, label, value })),
  },
  "components/account-type": {
    kind: "choice",
    label: "Account type",
    required: {
      value: true,
      message: "Select account type",
    },
    config: {
      placeholder: "Select an account type",
      selection: "single",
      presentation: "dropdown",
    },
    options: ACCOUNT_TYPES.map(([label, value]) => ({ id: value, label, value })),
  },
} satisfies Record<string, Omit<QuestionBlock, "id" | "type" | "key">>;
