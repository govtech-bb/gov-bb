// Registry defaults: gov-bb/packages/registry/src/components/opening-hours.ts.
export const OPENING_HOURS_PATTERN =
  "^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (([01]\\d|2[0-3]):[0-5]\\d) - (?!\\2$)([01]\\d|2[0-3]):[0-5]\\d$";

export const OPENING_HOURS_ERROR =
  "Enter an opening and a closing time that are different — for 24 hours, enter 12:00 AM to 11:59 PM";

/** Copied team defaults, including provenance and authored validation messages. */
export const openingHoursDefaults = {
  pattern: OPENING_HOURS_PATTERN,
  ref: "components/opening-hours",
  sourceFieldId: "opening-hours",
  sourceLabel: "Opening hours",
  errors: { required: "Add hours for at least one day", pattern: OPENING_HOURS_ERROR },
  required: true,
};
