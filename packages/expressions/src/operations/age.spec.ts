import { DateTime } from "luxon";
import { age } from "./age";
import { DEFAULT_ZONE } from "./zone";

describe("age", () => {
  it("returns whole years for a known DOB", () => {
    // Compute a DOB exactly 31 years ago today, in DEFAULT_ZONE
    const dob = DateTime.now()
      .setZone(DEFAULT_ZONE)
      .minus({ years: 31 })
      .toISODate();
    expect(age(dob)).toBe(31);
  });

  it("returns NaN for unparseable input", () => {
    expect(age("not-a-date")).toBeNaN();
  });

  it("returns NaN for null/undefined", () => {
    expect(age(null)).toBeNaN();
    expect(age(undefined)).toBeNaN();
  });
});
