import type { OpeningHoursPrimitive } from "@govtech-bb/form-types";

// Weekly opening hours: seven day rows (Monday first), each holding up to
// three sets of hours entered through native time pickers — no typed
// "HH:MM - HH:MM" strings (#2358). Days with no hours read "Not open" and
// submit nothing. The value is a string array of "Monday 09:00 - 17:00"
// entries, so each set of hours stays one paired value (ADR 0069) and the
// pattern rule below format-checks every entry the renderer composes; an
// entry with a missing half (a set added but not completed) fails it, and a
// backreference lookahead rejects an equal open and close — "00:00 - 00:00"
// is the meaningless non-answer #2358 called out (a 24-hour day is entered
// as 12:00 AM to 11:59 PM, per the hint). Overnight ranges still pass.
export const OpeningHours: OpeningHoursPrimitive = {
  fieldId: "opening-hours",
  htmlType: "opening-hours",
  label: "Opening hours",
  hint: 'Select "Add hours" for each day you are open. Open 24 hours? Enter 12:00 AM to 11:59 PM.',
  validations: {
    required: {
      value: true,
      error: "Add opening hours for at least one day",
    },
    pattern: {
      value:
        "^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (([01]\\d|2[0-3]):[0-5]\\d) - (?!\\2$)([01]\\d|2[0-3]):[0-5]\\d$",
      error:
        "Each set of hours needs an opening and a closing time, and they cannot be the same — for 24 hours, enter 12:00 AM to 11:59 PM",
    },
  },
};
