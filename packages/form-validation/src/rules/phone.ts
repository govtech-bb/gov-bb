import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import type { RuleRunner } from "../types";
import { str, forEachString } from "./string-values";

// A bare local number (7-digit or 246-prefixed) is parsed as Barbados, so
// applicants don't need to type a country code. A leading "+" overrides this,
// so overseas numbers validate against their own country (the diaspora case).
const DEFAULT_PHONE_COUNTRY = "BB";

// Validates a telephone number with Google's libphonenumber metadata. Unlike a
// regex this accepts any user-entered format (spaces, hyphens, brackets,
// country/area codes) and checks the number against real assignable ranges, not
// just its length — so malformed or out-of-range numbers are rejected.
export const phoneRunner: RuleRunner = (value, config) => {
  const msg = config.error ?? "Please enter a valid phone number";
  return forEachString(value, (element) => {
    const parsed = parsePhoneNumberFromString(
      str(element),
      DEFAULT_PHONE_COUNTRY,
    );
    return parsed?.isValid() ? null : msg;
  });
};
